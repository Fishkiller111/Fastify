import pool from '../../config/database.js';
import { EventOddsKline, OddsSnapshot, KlineInterval, EventKlineQueryParams } from './types.js';

class EventKlineService {
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

}

export default new EventKlineService();
