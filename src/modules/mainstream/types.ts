// 主流币接口
export interface BigCoin {
  id: number;
  symbol: string;
  name: string;
  contract_address: string;
  chain: string;
  decimals: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// 主流币事件类型
export type MainstreamEventType = 'Mainstream';

// 创建主流币事件请求
export interface CreateMainstreamEventRequest {
  type: MainstreamEventType;
  contract_address: string; // 主流币合约地址（必须在 big_coins 表中存在）
  creator_side: 'yes' | 'no';
  initial_pool_amount: number;
  duration: string; // 例如: "10minutes", "30minutes", "1days"
}

// 主流币事件响应
export interface MainstreamEventResponse {
  id: number;
  creator_id: number;
  type: MainstreamEventType;
  contract_address: string;
  big_coin_id: number;
  big_coin: {
    symbol: string;
    name: string;
    chain: string;
  };
  creator_side: 'yes' | 'no';
  initial_pool_amount: string;
  yes_pool: string;
  no_pool: string;
  yes_odds: string;
  no_odds: string;
  total_yes_bets: number;
  total_no_bets: number;
  status: 'pending_match' | 'active' | 'settled' | 'cancelled';
  deadline: Date;
  created_at: Date;
  settled_at?: Date;
}

// 获取主流币列表查询参数
export interface GetBigCoinsQuery {
  is_active?: boolean;
  chain?: string;
  limit?: number;
  offset?: number;
}
