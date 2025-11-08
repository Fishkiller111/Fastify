import pool from '../../config/database.js';
import redis from '../../config/redis.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  EventOddsKline,
  OddsSnapshot,
  KlineInterval,
  EventKlineQueryParams,
  CreateKlineBuyRecordInput,
  KlineBuyRecord,
} from './types.js';

class EventKlineService {
  /**
   * 从 DexScreener 获取 BSC 链上代币价格（USD）
   */
  private getProxyAgent(): HttpsProxyAgent<string> | undefined {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    return proxy ? new HttpsProxyAgent(proxy) : undefined;
  }

  private async fetchBSCTokenPrice(contractAddress: string): Promise<number | null> {
    try {
      const cacheKey = `dex:price:bsc:${contractAddress.toLowerCase()}`;

      // 先读缓存
      const cached = await redis.get(cacheKey);
      if (cached) {
        const v = parseFloat(cached);
        if (!isNaN(v)) return v;
      }

      const https = await import('https');
      const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

      const agent = this.getProxyAgent();
      const options: any = {
        agent,
        headers: {
          'user-agent': 'MemeApp/1.0 (kline-service)'
        }
      };

      const data: string = await new Promise((resolve, reject) => {
        const req = (https as any).get(url, options, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          });
        });

        // 超时保护（4秒）
        req.setTimeout(4000, () => {
          req.destroy(new Error('Request timeout'));
        });

        req.on('error', (err: any) => reject(err));
      });

      const response = JSON.parse(data);
      if (!response.pairs || response.pairs.length === 0) return null;

      const bscPairs = response.pairs.filter((pair: any) =>
        pair.chainId === 'bsc' || pair.chainId === 'binance'
      );
      if (bscPairs.length === 0) return null;

      const priceUsd = parseFloat(bscPairs[0].priceUsd);
      if (isNaN(priceUsd)) return null;

      // 写缓存，TTL 30 秒
      await redis.setex(cacheKey, 30, priceUsd.toString());
      return priceUsd;
    } catch (e) {
      return null;
    }
  }
  /**
   * 公共：获取事件详情（同时支持 Meme 与 Mainstream）
   */
  async getEventDetail(eventId: number): Promise<any | null> {
    const result = await pool.query(
      `SELECT 
         me.*,
         bc.symbol as big_coin_symbol,
         bc.name as big_coin_name,
         bc.chain as big_coin_chain,
         bc.icon_url as big_coin_icon_url
       FROM meme_events me
       LEFT JOIN big_coins bc ON me.big_coin_id = bc.id
       WHERE me.id = $1`,
      [eventId]
    );

    if (result.rows.length === 0) return null;

    const e = result.rows[0];
    // Launch condition description for pumpfun/bonk
    let launchCondition: string | null = null;
    if (e.type === 'pumpfun' || e.type === 'bonk') {
      if (e.is_launched === true) {
        launchCondition = 'Launch successful';
      } else if (e.is_launched === false) {
        launchCondition = 'Not yet launched';
      }
      // is_launched 为 null 时，launchCondition 保持 null（事件未结算）
    }

    return {
      id: e.id,
      creator_id: e.creator_id,
      type: e.type,
      contract_address: e.contract_address,
      creator_side: e.creator_side,
      initial_pool_amount: e.initial_pool_amount,
      initial_amount: e.initial_amount ?? null,
      matching_slide: e.matching_slide ?? null,
      pending_match_timeout: e.pending_match_timeout ?? null,
      yes_pool: e.yes_pool,
      no_pool: e.no_pool,
      yes_amount: e.yes_amount ?? null,
      no_amount: e.no_amount ?? null,
      yes_odds: e.yes_odds,
      no_odds: e.no_odds,
      total_yes_bets: e.total_yes_bets,
      total_no_bets: e.total_no_bets,
      status: e.status,
      deadline: e.deadline,
      settled_at: e.settled_at ?? null,
      token_name: e.token_name ?? null,
      is_launched: e.is_launched === null ? null : !!e.is_launched,
      launch_condition: launchCondition,
      // Mainstream 专用字段（若有）
      big_coin: e.big_coin_id ? {
        id: e.big_coin_id,
        symbol: e.big_coin_symbol,
        name: e.big_coin_name,
        chain: e.big_coin_chain,
        icon_url: e.big_coin_icon_url,
      } : null,
      ["Predicted Price"]: e.future_price ?? null,
      current_price: e.current_price ?? null,
    };
  }
  /**
   * 记录赔率快照到数据库
   */
  async recordOddsSnapshot(eventId: number): Promise<void> {
    const result = await pool.query(
      'SELECT yes_odds, no_odds, yes_pool, no_pool FROM meme_events WHERE id = $1',
      [eventId]
    );

    if (result.rows.length > 0) {
      const event = result.rows[0];
      const timestamp = Date.now();

      // 保存到数据库，使用ON CONFLICT确保同一时间戳只有一条记录
      await pool.query(
        `INSERT INTO klines (event_id, timestamp, yes_odds, no_odds, yes_pool, no_pool, total_bets)
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT (event_id, timestamp)
         DO UPDATE SET
           yes_odds = EXCLUDED.yes_odds,
           no_odds = EXCLUDED.no_odds,
           yes_pool = EXCLUDED.yes_pool,
           no_pool = EXCLUDED.no_pool,
           total_bets = klines.total_bets + 1`,
        [
          eventId,
          timestamp,
          parseFloat(event.yes_odds),
          parseFloat(event.no_odds),
          parseFloat(event.yes_pool),
          parseFloat(event.no_pool)
        ]
      );
    }
  }

  /**
   * 从数据库生成K线数据
   */
  async generateKline(eventId: number, interval: KlineInterval, startTime?: number, endTime?: number): Promise<EventOddsKline[]> {
    // 从数据库读取原始快照数据
    let query = 'SELECT * FROM klines WHERE event_id = $1';
    const params: any[] = [eventId];

    if (startTime) {
      query += ' AND timestamp >= $2';
      params.push(startTime);
    }
    if (endTime) {
      const timeIndex = params.length + 1;
      query += ` AND timestamp <= $${timeIndex}`;
      params.push(endTime);
    }

    query += ' ORDER BY timestamp ASC';

    const result = await pool.query(query, params);
    const snapshots = result.rows;

    if (snapshots.length === 0) {
      return [];
    }

    const intervalMs = this.getIntervalMs(interval);
    const klines: EventOddsKline[] = [];

    // 按时间分组快照
    const groupedSnapshots = new Map<number, any[]>();

    snapshots.forEach(snapshot => {
      const periodStart = Math.floor(snapshot.timestamp / intervalMs) * intervalMs;
      const group = groupedSnapshots.get(periodStart) || [];
      group.push(snapshot);
      groupedSnapshots.set(periodStart, group);
    });

    // 生成每个周期的K线
    groupedSnapshots.forEach((periodSnapshots, timestamp) => {
      if (periodSnapshots.length === 0) return;

      const yesOdds = periodSnapshots.map(s => parseFloat(s.yes_odds));
      const noOdds = periodSnapshots.map(s => parseFloat(s.no_odds));
      const lastSnapshot = periodSnapshots[periodSnapshots.length - 1];

      klines.push({
        event_id: eventId,
        interval,
        timestamp,
        yes_odds_open: yesOdds[0],
        yes_odds_high: Math.max(...yesOdds),
        yes_odds_low: Math.min(...yesOdds),
        yes_odds_close: yesOdds[yesOdds.length - 1],
        no_odds_open: noOdds[0],
        no_odds_high: Math.max(...noOdds),
        no_odds_low: Math.min(...noOdds),
        no_odds_close: noOdds[noOdds.length - 1],
        yes_pool: parseFloat(lastSnapshot.yes_pool),
        no_pool: parseFloat(lastSnapshot.no_pool),
        total_bets: periodSnapshots.reduce((sum, s) => sum + parseInt(s.total_bets), 0),
      });
    });

    return klines.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 从数据库获取所有原始赔率快照点(用于绘制折线图)
   */
  async getAllOddsSnapshots(eventId: number, startTime?: number, endTime?: number): Promise<OddsSnapshot[]> {
    let query = 'SELECT * FROM klines WHERE event_id = $1';
    const params: any[] = [eventId];

    if (startTime) {
      query += ' AND timestamp >= $2';
      params.push(startTime);
    }
    if (endTime) {
      const timeIndex = params.length + 1;
      query += ` AND timestamp <= $${timeIndex}`;
      params.push(endTime);
    }

    query += ' ORDER BY timestamp ASC';

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      event_id: row.event_id,
      yes_odds: parseFloat(row.yes_odds),
      no_odds: parseFloat(row.no_odds),
      yes_pool: parseFloat(row.yes_pool),
      no_pool: parseFloat(row.no_pool),
      timestamp: parseInt(row.timestamp),
    }));
  }

  /**
   * 获取历史K线数据
   */
  async getHistoricalKlines(params: EventKlineQueryParams): Promise<EventOddsKline[]> {
    let klines = await this.generateKline(params.event_id, params.interval, params.startTime, params.endTime);

    // 如果指定了limit,则只返回最后N条,否则返回全部历史数据
    if (params.limit) {
      return klines.slice(-params.limit);
    }

    // 返回全部历史K线数据用于绘制完整折线图
    return klines;
  }

  /**
   * 获取当前实时赔率
   */
  async getCurrentOdds(eventId: number): Promise<OddsSnapshot | null> {
    const result = await pool.query(
      'SELECT yes_odds, no_odds, yes_pool, no_pool FROM meme_events WHERE id = $1',
      [eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const event = result.rows[0];
    return {
      event_id: eventId,
      yes_odds: parseFloat(event.yes_odds),
      no_odds: parseFloat(event.no_odds),
      yes_pool: parseFloat(event.yes_pool),
      no_pool: parseFloat(event.no_pool),
      timestamp: Date.now(),
    };
  }

  /**
   * 获取时间间隔的毫秒数
   */
  private getIntervalMs(interval: KlineInterval): number {
    const map: Record<KlineInterval, number> = {
      [KlineInterval.ONE_MINUTE]: 60 * 1000,
      [KlineInterval.FIVE_MINUTES]: 5 * 60 * 1000,
      [KlineInterval.FIFTEEN_MINUTES]: 15 * 60 * 1000,
      [KlineInterval.THIRTY_MINUTES]: 30 * 60 * 1000,
      [KlineInterval.ONE_HOUR]: 60 * 60 * 1000,
      [KlineInterval.FOUR_HOURS]: 4 * 60 * 60 * 1000,
      [KlineInterval.ONE_DAY]: 24 * 60 * 60 * 1000,
      [KlineInterval.ONE_WEEK]: 7 * 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 1000;
  }

  /**
   * 记录用户在K线上买入点
   */
  async recordBuyPoint(data: CreateKlineBuyRecordInput): Promise<void> {
    await pool.query(
      `INSERT INTO kline_buy_records (bet_id, event_id, user_id, bet_type, bet_amount, yes_odds_at_bet, no_odds_at_bet)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (bet_id) DO NOTHING`,
      [
        data.bet_id,
        data.event_id,
        data.user_id,
        data.bet_type,
        data.bet_amount,
        data.yes_odds_at_bet,
        data.no_odds_at_bet,
      ]
    );
  }

  /**
   * 获取指定用户在某事件下的买入记录
   */
  async getUserBuyPoints(eventId: number, userId: number): Promise<KlineBuyRecord[]> {
    const result = await pool.query(
      `SELECT id, bet_id, event_id, user_id, bet_type, bet_amount, yes_odds_at_bet, no_odds_at_bet, created_at
       FROM kline_buy_records
       WHERE event_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [eventId, userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      bet_id: row.bet_id,
      event_id: row.event_id,
      user_id: row.user_id,
      bet_type: row.bet_type,
      bet_amount: parseFloat(row.bet_amount),
      yes_odds_at_bet: parseFloat(row.yes_odds_at_bet),
      no_odds_at_bet: parseFloat(row.no_odds_at_bet),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  }
  /**
   * 公共：获取事件的所有买入/卖出记录（按时间倒序）
   */
  async getEventTrades(eventId: number, limit: number = 200, offset: number = 0): Promise<Array<{
    id: number;
    event_id: number;
    user_id: number;
    username: string;
    wallet_address: string | null;
    transaction_type: 'buy' | 'sell';
    side: 'yes' | 'no';
    amount_delta: number;
    cost_or_return: string;
    odds_at_transaction: string;
    created_at: string;
  }>> {
    const result = await pool.query(
      `SELECT 
         t.id,
         t.event_id,
         t.user_id,
         u.username,
         u.wallet_address,
         t.transaction_type,
         t.side,
         t.amount_delta,
         t.cost_or_return,
         t.odds_at_transaction,
         t.created_at
       FROM transactions t
       INNER JOIN users u ON t.user_id = u.id
       WHERE t.event_id = $1 AND t.transaction_type IN ('buy','sell')
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );

    return result.rows.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      user_id: row.user_id,
      username: row.username,
      wallet_address: row.wallet_address ?? null,
      transaction_type: row.transaction_type,
      side: row.side,
      amount_delta: parseInt(row.amount_delta),
      cost_or_return: row.cost_or_return,
      odds_at_transaction: row.odds_at_transaction,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  }

  /**
   * 公共：主流币事件预测方向（up/down/flat）
   * 仅适配 type=Mainstream；meme 事件不适配
   */
  async getPredictionDirection(eventId: number): Promise<{
    event_id: number;
    type: string;
    predicted_price: string;
    current_price: string;
    direction: 'up' | 'down' | 'flat';
  } | null> {
    // 读取事件
    const res = await pool.query(
      `SELECT id, type, contract_address, future_price
       FROM meme_events
       WHERE id = $1`,
      [eventId]
    );
    if (res.rows.length === 0) return null;

    const ev = res.rows[0];
    if (ev.type !== 'Mainstream') {
      throw new Error('该接口仅适用于主流币事件');
    }
    if (!ev.contract_address || ev.future_price == null) {
      throw new Error('缺少合约地址或预测价格');
    }

    const current = await this.fetchBSCTokenPrice(ev.contract_address);
    if (current == null) {
      throw new Error('无法获取当前代币价格');
    }

    const predicted = parseFloat(ev.future_price);
    const direction = predicted > current ? 'up' : predicted < current ? 'down' : 'flat';

    return {
      event_id: ev.id,
      type: ev.type,
      predicted_price: predicted.toString(),
      current_price: current.toString(),
      direction,
    };
  }

  /**
   * 公共：获取事件结束倒计时
   */
  async getEventCountdown(eventId: number): Promise<{
    event_id: number;
    status: string;
    deadline: string;
    server_time: string;
    ended: boolean;
    remaining_ms: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null> {
    const res = await pool.query(
      'SELECT status, deadline FROM meme_events WHERE id = $1',
      [eventId]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const now = Date.now();
    const deadlineMs = new Date(row.deadline).getTime();
    const diff = Math.max(0, deadlineMs - now);
    const ended = diff === 0 || row.status !== 'active';

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((diff % (60 * 1000)) / 1000);

    return {
      event_id: eventId,
      status: row.status,
      deadline: new Date(row.deadline).toISOString(),
      server_time: new Date(now).toISOString(),
      ended,
      remaining_ms: diff,
      days,
      hours,
      minutes,
      seconds,
    };
  }

  /**
   * 获取热门事件Top榜（根据yes_pool + no_pool总和排序）
   * @param limit 返回的事件数量
   * @returns 热门事件列表
   */
  async getTopEvents(limit: number): Promise<Array<{
    id: number;
    type: string;
    contract_address: string | null;
    token_name: string | null;
    yes_pool: string;
    no_pool: string;
    total_pool: number;
    yes_odds: string;
    no_odds: string;
    total_yes_bets: number;
    total_no_bets: number;
    status: string;
    deadline: string;
    created_at: string;
    big_coin?: {
      id: number;
      symbol: string;
      name: string;
      chain: string;
      icon_url: string | null;
    };
  }>> {
    const result = await pool.query(
      `SELECT 
         me.id,
         me.type,
         me.contract_address,
         me.token_name,
         me.yes_pool,
         me.no_pool,
         (CAST(me.yes_pool AS NUMERIC) + CAST(me.no_pool AS NUMERIC)) as total_pool,
         me.yes_odds,
         me.no_odds,
         me.total_yes_bets,
         me.total_no_bets,
         me.status,
         me.deadline,
         me.created_at,
         bc.id as big_coin_id,
         bc.symbol as big_coin_symbol,
         bc.name as big_coin_name,
         bc.chain as big_coin_chain,
         bc.icon_url as big_coin_icon_url
       FROM meme_events me
       LEFT JOIN big_coins bc ON me.big_coin_id = bc.id
       WHERE me.status = 'active'
       ORDER BY total_pool DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      contract_address: row.contract_address,
      token_name: row.token_name,
      yes_pool: row.yes_pool,
      no_pool: row.no_pool,
      total_pool: parseFloat(row.total_pool),
      yes_odds: row.yes_odds,
      no_odds: row.no_odds,
      total_yes_bets: row.total_yes_bets,
      total_no_bets: row.total_no_bets,
      status: row.status,
      deadline: row.deadline instanceof Date ? row.deadline.toISOString() : row.deadline,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      ...(row.big_coin_id ? {
        big_coin: {
          id: row.big_coin_id,
          symbol: row.big_coin_symbol,
          name: row.big_coin_name,
          chain: row.big_coin_chain,
          icon_url: row.big_coin_icon_url,
        }
      } : {})
    }));
  }

  /**
   * 从配置中获取Top榜显示数量，默认为10
   */
  async getTopEventsLimit(): Promise<number> {
    const result = await pool.query(
      'SELECT value FROM config WHERE key = $1',
      ['top_events_limit']
    );
    
    if (result.rows.length === 0) {
      return 10; // 默认值
    }
    
    const value = parseInt(result.rows[0].value);
    return isNaN(value) || value <= 0 ? 10 : value;
  }

  /**
   * 设置Top榜显示数量
   */
  async setTopEventsLimit(limit: number): Promise<void> {
    if (limit <= 0) {
      throw new Error('Top榜数量必须大于0');
    }
    
    await pool.query(
      `INSERT INTO config (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      ['top_events_limit', limit.toString(), '热门事件Top榜显示数量']
    );
  }
}

export default new EventKlineService();
