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
  launch_time?: Date;
  created_at: Date;
  settled_at?: Date;
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
  deadline: string; // ISO 8601格式时间字符串
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
  is_launched: boolean;
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
