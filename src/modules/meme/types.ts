// Meme事件类型
export type MemeEventType = 'pumpfun' | 'bonk';

// Meme事件状态
export type MemeEventStatus = 'pending_match' | 'active' | 'settled' | 'cancelled';

// 投注类型
export type BetType = 'yes' | 'no';

// 投注状态
export type BetStatus = 'pending' | 'won' | 'lost' | 'refunded';

// Meme事件接口
export interface MemeEvent {
  id: number;
  creator_id: number;
  type: MemeEventType;
  contract_address?: string;
  creator_side: BetType;
  initial_pool_amount: string;
  yes_pool: string;
  no_pool: string;
  yes_odds: string;
  no_odds: string;
  total_yes_bets: number;
  total_no_bets: number;
  is_launched: boolean | null;
  status: MemeEventStatus;
  deadline: Date;
  deadline_after_settlement?: Date;
  launch_time?: Date;
  created_at: Date;
  settled_at?: Date;
  token_name?: string | null;
}

// 投注记录接口
export interface MemeBet {
  id: number;
  event_id: number;
  user_id: number;
  bet_type: BetType;
  bet_amount: string;
  odds_at_bet: string;
  potential_payout?: string;
  actual_payout?: string;
  status: BetStatus;
  created_at: Date;
}

// 创建事件请求接口
export interface CreateMemeEventRequest {
  type: MemeEventType;
  contract_address: string;
  creator_side: BetType;
  initial_pool_amount: number;
  duration: string; // 例如: "10minutes", "30minutes", "1days", 或自定义小时数 "5hours"
}

// 投注请求接口
export interface PlaceBetRequest {
  event_id: number;
  bet_type: BetType;
  bet_amount: number;
}

// 结算事件请求接口
export interface SettleEventRequest {
  event_id: number;
  is_launched?: boolean; // 可选参数，如果不提供则自动通过 DexScreener API 判断
}

// 事件列表查询参数
export interface GetEventsQuery {
  status?: MemeEventStatus;
  type?: MemeEventType;
  limit?: number;
  offset?: number;
}

// 用户投注历史查询参数
export interface GetUserBetsQuery {
  user_id?: number;
  event_id?: number;
  status?: BetStatus;
  limit?: number;
  offset?: number;
}

// 用户所有投注记录(包含事件详情)
export interface UserBetWithEvent extends MemeBet {
  event: {
    id: number;
    type: string;
    status: MemeEventStatus;
    contract_address?: string;
    deadline: Date;
    settled_at?: Date;
    token_name?: string;
    // Mainstream特有字段
    big_coin_id?: number;
    big_coin_symbol?: string;
    big_coin_name?: string;
    big_coin_icon_url?: string;
    future_price?: string;
    current_price?: string;
  };
}

// 用户统计数据
export interface UserStatistics {
  total_bets: number;           // 总下注次数
  total_bet_amount: string;     // 总下注金额
  active_bet_amount: string;    // 活跃下注金额(pending状态)
  profit: string;               // 盈利(won状态的收益)
  loss: string;                 // 亏损(lost状态的损失)
  net_profit: string;           // 净盈利(profit - loss)
  win_rate: string;             // 胜率百分比
}
