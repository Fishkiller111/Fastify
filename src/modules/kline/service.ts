import pool from '../../config/database.js';
import { EventOddsKline, OddsSnapshot, KlineInterval, EventKlineQueryParams } from './types.js';

class EventKlineService {
  // 内存存储赔率快照（生产环境应使用Redis或时序数据库）
  private oddsSnapshots: Map<number, OddsSnapshot[]> = new Map();

  /**
   * 记录赔率快照
   */
  async recordOddsSnapshot(eventId: number): Promise<void> {
    const result = await pool.query(
      'SELECT yes_odds, no_odds, yes_pool, no_pool FROM meme_events WHERE id = $1',
      [eventId]
    );

    if (result.rows.length > 0) {
      const event = result.rows[0];
      const snapshot: OddsSnapshot = {
        event_id: eventId,
        yes_odds: parseFloat(event.yes_odds),
        no_odds: parseFloat(event.no_odds),
        yes_pool: parseFloat(event.yes_pool),
        no_pool: parseFloat(event.no_pool),
        timestamp: Date.now(),
      };

      const snapshots = this.oddsSnapshots.get(eventId) || [];
      snapshots.push(snapshot);
      this.oddsSnapshots.set(eventId, snapshots);
    }
  }

  /**
   * 生成K线数据
   */
  async generateKline(eventId: number, interval: KlineInterval): Promise<EventOddsKline[]> {
    const snapshots = this.oddsSnapshots.get(eventId) || [];
    if (snapshots.length === 0) {
      return [];
    }

    const intervalMs = this.getIntervalMs(interval);
    const klines: EventOddsKline[] = [];

    // 按时间分组快照
    const groupedSnapshots = new Map<number, OddsSnapshot[]>();
    
    snapshots.forEach(snapshot => {
      const periodStart = Math.floor(snapshot.timestamp / intervalMs) * intervalMs;
      const group = groupedSnapshots.get(periodStart) || [];
      group.push(snapshot);
      groupedSnapshots.set(periodStart, group);
    });

    // 生成每个周期的K线
    groupedSnapshots.forEach((periodSnapshots, timestamp) => {
      if (periodSnapshots.length === 0) return;

      const yesOdds = periodSnapshots.map(s => s.yes_odds);
      const noOdds = periodSnapshots.map(s => s.no_odds);
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
        yes_pool: lastSnapshot.yes_pool,
        no_pool: lastSnapshot.no_pool,
        total_bets: periodSnapshots.length,
      });
    });

    return klines.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 获取所有原始赔率快照点(用于绘制折线图)
   */
  async getAllOddsSnapshots(eventId: number, startTime?: number, endTime?: number): Promise<OddsSnapshot[]> {
    let snapshots = this.oddsSnapshots.get(eventId) || [];

    // 时间范围过滤
    if (startTime) {
      snapshots = snapshots.filter(s => s.timestamp >= startTime);
    }
    if (endTime) {
      snapshots = snapshots.filter(s => s.timestamp <= endTime);
    }

    return snapshots;
  }

  /**
   * 获取历史K线数据
   */
  async getHistoricalKlines(params: EventKlineQueryParams): Promise<EventOddsKline[]> {
    let klines = await this.generateKline(params.event_id, params.interval);

    // 时间范围过滤
    if (params.startTime) {
      klines = klines.filter(k => k.timestamp >= params.startTime!);
    }
    if (params.endTime) {
      klines = klines.filter(k => k.timestamp <= params.endTime!);
    }

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
   * 初始化事件的模拟历史数据
   */
  async initMockEventData(eventId: number, interval: KlineInterval, count: number = 100): Promise<void> {
    const intervalMs = this.getIntervalMs(interval);
    const now = Date.now();
    const snapshots: OddsSnapshot[] = [];

    // 生成模拟的赔率变化数据
    let yesOdds = 50;
    let noOdds = 50;
    let yesPool = 1000;
    let noPool = 1000;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - i * intervalMs;
      
      // 模拟赔率波动
      const change = (Math.random() - 0.5) * 5;
      yesOdds = Math.max(10, Math.min(90, yesOdds + change));
      noOdds = 100 - yesOdds;
      
      // 模拟池子变化
      yesPool += Math.random() * 100;
      noPool += Math.random() * 100;

      snapshots.push({
        event_id: eventId,
        yes_odds: parseFloat(yesOdds.toFixed(2)),
        no_odds: parseFloat(noOdds.toFixed(2)),
        yes_pool: parseFloat(yesPool.toFixed(2)),
        no_pool: parseFloat(noPool.toFixed(2)),
        timestamp,
      });
    }

    this.oddsSnapshots.set(eventId, snapshots);
  }
}

export default new EventKlineService();
