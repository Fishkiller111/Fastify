/**
 * 提现相关类型定义
 */

// 本地提现订单状态
export type WithdrawStatus = 'pending' | 'success' | 'failed' | 'cancelled';

// 前端发起提现申请请求体（前端 -> 我方后端）
export interface CreateWithdrawApplyRequest {
  // 提现金额（代币数量，例如 10.5 USDT）
  amount: number;
  // 提现代币类型，例如 usdt.polygon，不传则使用默认配置
  trade_type?: string;
  // 提现收款地址，如果不传则使用用户绑定的钱包地址
  address?: string;
  // 提现单过期时间（秒），不传则使用默认配置
  timeout?: number;
  // （可选）覆盖该用户今日提现限额（代币数量），<=0 则使用网关默认
  daily_limit?: number;
}

// 本地提现订单实体
export interface WithdrawOrder {
  id: number;
  user_id: number;
  order_id: string;
  withdraw_id: string | null;
  trade_type: string;
  // 用户最终实际到账金额（扣除抽成后的金额）
  amount: string;
  // 用户实际扣减总金额（含抽成），无抽成时等于 amount
  gross_amount?: string | null;
  // 抽成金额，无抽成时为 0
  fee_amount?: string | null;
  // 抽成比例（小数，0.05 表示 5%），无抽成时为 0
  fee_rate?: string | null;
  address: string;
  status: WithdrawStatus;
  from_address: string | null;
  tx_hash: string | null;
  expired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// 创建提现申请响应（返回给前端）
export interface CreateWithdrawApplyResponse {
  order_id: string;
  withdraw_id: string;
  // 用户最终实际到账金额
  amount: string;
  trade_type: string;
  address: string;
  status: WithdrawStatus;
  expired_at: number; // 时间戳（秒）
  // 以下字段在有抽成时返回：
  // 用户实际扣减总金额（含抽成），无抽成时等于 amount
  gross_amount?: string;
  // 抽成金额，无抽成时为 "0"
  fee_amount?: string;
}

// 提现状态查询响应
export interface WithdrawStatusResponse {
  order_id: string;
  withdraw_id: string | null;
  amount: string;
  trade_type: string;
  address: string;
  status: WithdrawStatus;
  tx_hash: string | null;
  from_address: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
}

// 取消提现响应
export interface CancelWithdrawResponse {
  order_id: string;
  withdraw_id: string | null;
  status: WithdrawStatus;
}

// 提现结果回调（BEpusdt -> 我方后端 notify_url）
export interface WithdrawGatewayNotifyRequest {
  trade_id: string; // 本地提现ID（WithdrawId）
  order_id: string; // 商户提现订单号
  amount: number; // 回调中通常为 0
  actual_amount: number | string; // 实际提现代币数量
  token: string; // 用户收款地址
  block_transaction_id?: string; // 链上交易哈希
  signature: string;
  // 文档中约定：2=提现成功，3=提现失败/取消
  status: number;
}
