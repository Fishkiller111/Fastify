import { Kline, KlineInterval, KlineQueryParams } from './types.js';

class KlineService {
  // 模拟数据存储（实际应用中应使用数据库或 Redis）
  private klineData: Map<string, Kline[]> = new Map();

  /**
   * 获取历史 K线数据
   */
  async getHistoricalKlines(params: KlineQueryParams): Promise<Kline[]> {
    const key = `${params.symbol}_${params.interval}`;
    let data = this.klineData.get(key) || [];

    // 时间范围过滤
    if (params.startTime) {
      data = data.filter(k => k.timestamp >= params.startTime!);
    }
    if (params.endTime) {
      data = data.filter(k => k.timestamp <= params.endTime!);
    }

    // 限制返回数量
    const limit = params.limit || 500;
    return data.slice(-limit);
  }

  /**
   * 添加新的 K线数据
   */
  async addKline(kline: Kline): Promise<void> {
    const key = `${kline.symbol}_${kline.interval}`;
    const data = this.klineData.get(key) || [];

    // 检查是否已存在相同时间戳的数据
    const existingIndex = data.findIndex(k => k.timestamp === kline.timestamp);

    if (existingIndex >= 0) {
      // 更新现有数据
      data[existingIndex] = kline;
    } else {
      // 添加新数据并保持时间顺序
      data.push(kline);
      data.sort((a, b) => a.timestamp - b.timestamp);
    }

    this.klineData.set(key, data);
  }

  /**
   * 生成模拟 K线数据（用于测试）
   */
  generateMockKline(symbol: string, interval: KlineInterval): Kline {
    const now = Date.now();
    const basePrice = 50000; // 基础价格
    const volatility = 100; // 波动范围

    const open = basePrice + Math.random() * volatility - volatility / 2;
    const close = open + Math.random() * volatility - volatility / 2;
    const high = Math.max(open, close) + Math.random() * volatility / 2;
    const low = Math.min(open, close) - Math.random() * volatility / 2;
    const volume = Math.random() * 1000;

    return {
      symbol,
      interval,
      timestamp: now,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: parseFloat(volume.toFixed(4)),
    };
  }

  /**
   * 初始化历史数据（用于测试）
   */
  async initMockData(symbol: string, interval: KlineInterval, count: number = 100): Promise<void> {
    const key = `${symbol}_${interval}`;
    const data: Kline[] = [];

    // 计算间隔时间（毫秒）
    const intervalMs = this.getIntervalMs(interval);
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - i * intervalMs;
      const basePrice = 50000;
      const volatility = 100;

      const open = basePrice + Math.random() * volatility - volatility / 2;
      const close = open + Math.random() * volatility - volatility / 2;
      const high = Math.max(open, close) + Math.random() * volatility / 2;
      const low = Math.min(open, close) - Math.random() * volatility / 2;
      const volume = Math.random() * 1000;

      data.push({
        symbol,
        interval,
        timestamp,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(4)),
      });
    }

    this.klineData.set(key, data);
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

export default new KlineService();
