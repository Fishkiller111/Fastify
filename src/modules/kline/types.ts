// K线时间周期
export enum KlineInterval {
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  THIRTY_MINUTES = '30m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  ONE_DAY = '1d',
  ONE_WEEK = '1w',
}

// K线数据结构
export interface Kline {
  symbol: string;        // 交易对，如 'BTC/USDT'
  interval: KlineInterval; // 时间周期
  timestamp: number;     // 时间戳（毫秒）
  open: number;          // 开盘价
  high: number;          // 最高价
  low: number;           // 最低价
  close: number;         // 收盘价
  volume: number;        // 成交量
}

// WebSocket 消息类型
export interface KlineWSMessage {
  type: 'subscribe' | 'unsubscribe' | 'kline';
  symbol?: string;
  interval?: KlineInterval;
  data?: Kline;
}

// 历史数据查询参数
export interface KlineQueryParams {
  symbol: string;
  interval: KlineInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}
