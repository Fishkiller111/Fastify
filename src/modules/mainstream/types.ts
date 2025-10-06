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
  big_coin_id: number; // 主流币ID（对应 big_coins 表中的 id）
  creator_side: 'yes' | 'no';
  initial_pool_amount: number;
  duration: string; // 例如: "10minutes", "30minutes", "1days"
  future_price: number; // 预测的未来价格
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
  future_price?: string;
  current_price?: string;
}

// 获取主流币列表查询参数
export interface GetBigCoinsQuery {
  is_active?: boolean;
  chain?: string;
  limit?: number;
  offset?: number;
}

// 添加主流币请求
export interface AddBigCoinRequest {
  symbol: string;
  name: string;
  contract_address: string;
  chain?: string;
  decimals?: number;
  is_active?: boolean;
}
