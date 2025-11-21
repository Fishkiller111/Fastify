/**
 * 充值订单相关类型定义
 */

// 本地订单状态
export type OrderStatus =
  | 'unpaid'
  | 'pending_onchain'
  | 'paid'
  | 'expired'
  | 'cancelled';

// 创建充值订单请求（前端 → 我方后端）
export interface CreateRechargeOrderRequest {
  // 充值金额（单位：CNY）
  amount: number;
  // 订单描述或商品名称（可选）
  description?: string;
  // 支付通道类型（例如 usdt.trc20），不传则使用默认配置
  trade_type?: string;
  // 订单超时时间（秒），不传则使用默认配置
  timeout?: number;
}

// 本地订单实体（简化版）
export interface PaymentOrder {
  id: number;
  user_id: number;
  order_id: string;
  trade_id: string | null;
  amount_cny: string; // 使用字符串承载数据库 numeric
  actual_amount: string | null;
  token: string | null;
  status: OrderStatus;
  payment_url: string | null;
  timeout_seconds: number | null;
  created_at: Date;
  updated_at: Date;
}

// 创建订单接口的响应
export interface CreateRechargeOrderResponse {
  // 商户订单号（本地生成，用于前端和回调校验）
  order_id: string;
  // 支付网关返回的交易ID
  trade_id: string;
  // 请求支付金额（CNY）
  amount: string;
  // 实际支付金额（USDT / TRX）
  actual_amount: string;
  // 收银台地址
  payment_url: string;
  // 订单有效期（秒）
  expiration_time: number;
  // 本地订单状态
  status: OrderStatus;
}

// 支付网关回调请求体（notify_url）
export interface GatewayNotifyRequest {
  trade_id: string;
  order_id: string;
  amount: number; // 请求支付金额，CNY
  actual_amount: number; // 实际支付金额，USDT / TRX
  token: string;
  block_transaction_id?: string;
  signature: string;
  // 1:等待支付  2:支付成功  3:支付超时
  status: 1 | 2 | 3;
}

// 订单状态查询响应
export interface OrderStatusResponse {
  order_id: string;
  trade_id: string | null;
  amount_cny: string;
  actual_amount: string | null;
  status: OrderStatus;
  payment_url: string | null;
  timeout_seconds: number | null;
  created_at: string;
  updated_at: string;
}

// 取消订单响应
export interface CancelOrderResponse {
  order_id: string;
  trade_id: string | null;
  status: OrderStatus;
}
