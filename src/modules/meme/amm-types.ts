/**
 * AMM (自动做市商) 相关类型定义
 */

// 用户持仓
export interface UserPosition {
  id: number;
  event_id: number;
  user_id: number;
  yes_amount: number;          // 持有的 YES 份额
  no_amount: number;           // 持有的 NO 份额
  total_invested: string;      // 总投入金额
  total_returned: string;      // 总卖出收益
  created_at: Date;
  updated_at: Date;
}

// 交易记录
export interface Transaction {
  id: number;
  event_id: number;
  user_id: number;
  transaction_type: 'buy' | 'sell' | 'settle';
  side: 'yes' | 'no';
  amount_delta: number;        // 份额变化 (正数=买入, 负数=卖出)
  cost_or_return: string;      // 花费或收益
  odds_at_transaction: string; // 交易时的赔率
  created_at: Date;
}

// 买入请求
export interface BuyAmountRequest {
  event_id: number;
  side: 'yes' | 'no';
  spend_amount: number;        // 愿意花费的金额
}

// 买入响应
export interface BuyAmountResponse {
  transaction_id: number;
  event_id: number;
  side: 'yes' | 'no';
  amount_purchased: number;    // 购买到的份额
  cost: string;                // 实际花费
  current_odds: string;        // 当前赔率
  average_price: string;       // 平均成交价 (cost / amount_purchased)
  position: UserPosition;      // 更新后的持仓
}

// 卖出请求
export interface SellAmountRequest {
  event_id: number;
  side: 'yes' | 'no';
  amount_to_sell: number;      // 要卖出的份额数量
}

// 卖出响应
export interface SellAmountResponse {
  transaction_id: number;
  event_id: number;
  side: 'yes' | 'no';
  amount_sold: number;         // 卖出的份额
  return_amount: string;       // 收回的金额
  current_odds: string;        // 当前赔率
  average_price: string;       // 平均成交价 (return / amount_sold)
  position: UserPosition;      // 更新后的持仓
}

// 买入计算请求
export interface CalculateBuyRequest {
  event_id: number;
  side: 'yes' | 'no';
  spend_amount: number;
}

// 买入计算响应
export interface CalculateBuyResponse {
  amount_to_receive: number;   // 将获得的份额
  average_price: string;       // 平均价格
  current_odds: string;        // 当前赔率
  price_impact: string;        // 价格影响 (百分比)
}

// 卖出计算请求
export interface CalculateSellRequest {
  event_id: number;
  side: 'yes' | 'no';
  amount_to_sell: number;
}

// 卖出计算响应
export interface CalculateSellResponse {
  return_amount: string;       // 将获得的金额
  average_price: string;       // 平均价格
  current_odds: string;        // 当前赔率
  price_impact: string;        // 价格影响 (百分比)
}
