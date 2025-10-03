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

// 基于事件赔率的K线数据结构
export interface EventOddsKline {
  event_id: number;           // 事件ID
  interval: KlineInterval;    // 时间周期
  timestamp: number;          // 时间戳（毫秒）
  yes_odds_open: number;      // Yes开盘赔率
  yes_odds_high: number;      // Yes最高赔率
  yes_odds_low: number;       // Yes最低赔率
  yes_odds_close: number;     // Yes收盘赔率
  no_odds_open: number;       // No开盘赔率
  no_odds_high: number;       // No最高赔率
  no_odds_low: number;        // No最低赔率
  no_odds_close: number;      // No收盘赔率
  yes_pool: number;           // Yes池子金额
  no_pool: number;            // No池子金额
  total_bets: number;         // 总投注次数
}

// 赔率快照（用于生成K线）
export interface OddsSnapshot {
  event_id: number;
  yes_odds: number;
  no_odds: number;
  yes_pool: number;
  no_pool: number;
  timestamp: number;
}

// K线查询参数
export interface EventKlineQueryParams {
  event_id: number;
  interval: KlineInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

// WebSocket 消息类型
export interface EventKlineWSMessage {
  type: 'subscribe' | 'unsubscribe' | 'kline' | 'odds_update';
  event_id?: number;
  interval?: KlineInterval;
  data?: EventOddsKline | OddsSnapshot;
}
