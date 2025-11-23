import config from '../config/index.js';
import { signGatewayParams } from './payment-gateway.js';

/**
 * 提现创建请求参数（对应 BEpusdt /api/v1/withdraw/create 接口）
 */
export interface GatewayWithdrawCreateParams {
  order_id: string;
  user_id: string;
  amount: string; // 使用字符串避免浮点精度问题，例如 "10.5"
  trade_type?: string;
  address: string;
  notify_url?: string;
  timeout?: number;
  daily_limit?: number;
}

/**
 * 提现订单数据（BEpusdt 返回的 data 字段）
 */
export interface GatewayWithdrawData {
  withdraw_id: string; // 本地提现ID（BEpusdt端）
  order_id: string; // 商户提现订单号
  user_id: string;
  trade_type: string;
  amount: string; // 提现金额（代币数量）
  status: number; // 1:Pending 2:Broadcasting 3:Success 4:Failed 5:Canceled
  address: string; // 提现到的地址
  from_address: string; // 出款钱包地址
  tx_hash: string; // 链上交易哈希
  expired_at: number; // 过期时间（时间戳秒）
}

export interface GatewayWithdrawCreateResponse {
  status_code: number;
  message: string;
  data: GatewayWithdrawData;
  request_id: string;
}

/**
 * 调用 BEpusdt 的 /api/v1/withdraw/create 接口
 */
export async function createGatewayWithdraw(
  params: GatewayWithdrawCreateParams,
): Promise<GatewayWithdrawData> {
  const gatewayConfig = config.withdrawGateway;

  if (!gatewayConfig.baseUrl) {
    throw new Error('提现网关基础地址未配置，请设置 WITHDRAW_GATEWAY_BASE_URL 或 PAYMENT_GATEWAY_BASE_URL');
  }
  if (!gatewayConfig.authToken) {
    throw new Error('提现网关 auth_token 未配置，请设置 WITHDRAW_GATEWAY_AUTH_TOKEN 或 PAYMENT_GATEWAY_AUTH_TOKEN');
  }
  if (!gatewayConfig.notifyUrl && !params.notify_url) {
    throw new Error('提现回调地址未配置，请设置 WITHDRAW_NOTIFY_URL');
  }

  const body: Record<string, any> = {
    order_id: params.order_id,
    user_id: params.user_id,
    amount: params.amount,
    trade_type: params.trade_type || gatewayConfig.defaultTradeType,
    address: params.address,
    notify_url: params.notify_url || gatewayConfig.notifyUrl,
    timeout: params.timeout || gatewayConfig.defaultTimeoutSeconds,
    daily_limit: params.daily_limit,
  };

  // 生成签名
  body.signature = signGatewayParams(body, gatewayConfig.authToken);

  const url = new URL('/api/v1/withdraw/create', gatewayConfig.baseUrl).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`调用提现网关失败: HTTP ${response.status} ${response.statusText} ${text}`);
  }

  const json = (await response.json()) as GatewayWithdrawCreateResponse;

  if (json.status_code !== 200) {
    throw new Error(`提现网关返回错误: ${json.message || json.status_code}`);
  }

  return json.data;
}

/**
 * 提现取消接口请求体
 */
export interface GatewayWithdrawCancelResponse {
  status_code: number;
  message: string;
  data: {
    withdraw_id: string;
  };
  request_id: string;
}

/**
 * 调用 BEpusdt 的 /api/v1/withdraw/cancel 接口，取消指定 withdraw_id 的提现订单
 */
export async function cancelGatewayWithdraw(
  withdrawId: string,
): Promise<{ withdraw_id: string }> {
  const gatewayConfig = config.withdrawGateway;

  if (!gatewayConfig.baseUrl) {
    throw new Error('提现网关基础地址未配置，请设置 WITHDRAW_GATEWAY_BASE_URL 或 PAYMENT_GATEWAY_BASE_URL');
  }
  if (!gatewayConfig.authToken) {
    throw new Error('提现网关 auth_token 未配置，请设置 WITHDRAW_GATEWAY_AUTH_TOKEN 或 PAYMENT_GATEWAY_AUTH_TOKEN');
  }

  const body: Record<string, any> = {
    withdraw_id: withdrawId,
  };

  body.signature = signGatewayParams(body, gatewayConfig.authToken);

  const url = new URL('/api/v1/withdraw/cancel', gatewayConfig.baseUrl).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`调用提现网关取消失败: HTTP ${response.status} ${response.statusText} ${text}`);
  }

  const json = (await response.json()) as GatewayWithdrawCancelResponse;

  if (json.status_code !== 200) {
    throw new Error(`提现网关取消返回错误: ${json.message || json.status_code}`);
  }

  return json.data;
}
