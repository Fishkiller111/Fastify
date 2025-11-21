import crypto from 'crypto';
import config from '../config/index.js';

/**
 * 创建交易请求参数（对应 BEpusdt create-transaction 接口）
 */
export interface GatewayCreateTransactionParams {
  order_id: string;
  amount: string; // 使用字符串避免浮点精度问题，例如 "28.88"
  address?: string;
  trade_type?: string;
  notify_url?: string;
  redirect_url?: string;
  timeout?: number;
  rate?: string;
}

export interface GatewayCreateTransactionData {
  trade_id: string;
  order_id: string;
  amount: string; // 请求支付金额，CNY
  actual_amount: string; // 实际支付数额 usdt or trx
  token: string; // 收款地址
  expiration_time: number; // 订单有效期，秒
  payment_url: string; // 收银台地址
}

export interface GatewayCreateTransactionResponse {
  status_code: number;
  message: string;
  data: GatewayCreateTransactionData;
  request_id: string;
}

// 取消交易请求参数（对应 BEpusdt cancel-transaction 接口）
export interface GatewayCancelTransactionParams {
  trade_id: string;
}

// 取消交易响应
export interface GatewayCancelTransactionResponse {
  status_code: number;
  message: string;
  data: {
    trade_id: string;
  };
  request_id: string;
}

/**
 * 根据 docs/api.md 规则生成签名
 */
export function signGatewayParams(
  params: Record<string, any>,
  authToken: string = config.paymentGateway.authToken,
): string {
  if (!authToken) {
    throw new Error('支付网关 auth_token 未配置，请设置 PAYMENT_GATEWAY_AUTH_TOKEN');
  }

  // 1. 取所有非空参数（不含 signature 本身），按参数名字典序排序
  const entries = Object.entries(params)
    .filter(([key, value]) => {
      if (key === 'signature') return false;
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  // 2. 拼成 key1=value1&key2=value2&...
  const baseString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  // 3. 在末尾直接拼上 auth_token
  const toSign = baseString + authToken;

  // 4. 对字符串做 MD5，再转成小写 32 字节
  const signature = crypto
    .createHash('md5')
    .update(toSign, 'utf8')
    .digest('hex')
    .toLowerCase();

  return signature;
}

/**
 * 调用 BEpusdt 的 /api/v1/order/create-transaction 接口
 */
export async function createGatewayTransaction(
  params: GatewayCreateTransactionParams,
): Promise<GatewayCreateTransactionData> {
  const gatewayConfig = config.paymentGateway;

  if (!gatewayConfig.baseUrl) {
    throw new Error('支付网关基础地址未配置，请设置 PAYMENT_GATEWAY_BASE_URL');
  }
  if (!gatewayConfig.authToken) {
    throw new Error('支付网关 auth_token 未配置，请设置 PAYMENT_GATEWAY_AUTH_TOKEN');
  }

  const body: Record<string, any> = {
    address: params.address ?? '',
    trade_type: params.trade_type || gatewayConfig.defaultTradeType,
    order_id: params.order_id,
    amount: params.amount,
    notify_url: params.notify_url || gatewayConfig.notifyUrl,
    redirect_url: params.redirect_url || '',
    timeout: params.timeout || gatewayConfig.defaultTimeoutSeconds,
  };

  // 业务需要：每个订单固定使用汇率 1（即 1 CNY 对应 1 单位计价），忽略网关默认汇率配置
  const rate = params.rate ?? '1';
  body.rate = rate;

  // 生成签名
  body.signature = signGatewayParams(body, gatewayConfig.authToken);

  const url = new URL('/api/v1/order/create-transaction', gatewayConfig.baseUrl).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`调用支付网关失败: HTTP ${response.status} ${response.statusText} ${text}`);
  }

  const json = (await response.json()) as GatewayCreateTransactionResponse;

  if (json.status_code !== 200) {
    throw new Error(`支付网关返回错误: ${json.message || json.status_code}`);
  }

  return json.data;
}

/**
 * 调用 BEpusdt 的 /api/v1/order/cancel-transaction 接口，取消指定 trade_id 的订单
 */
export async function cancelGatewayTransaction(
  tradeId: string,
): Promise<{ trade_id: string }> {
  const gatewayConfig = config.paymentGateway;

  if (!gatewayConfig.baseUrl) {
    throw new Error('支付网关基础地址未配置，请设置 PAYMENT_GATEWAY_BASE_URL');
  }
  if (!gatewayConfig.authToken) {
    throw new Error('支付网关 auth_token 未配置，请设置 PAYMENT_GATEWAY_AUTH_TOKEN');
  }

  const body: Record<string, any> = {
    trade_id: tradeId,
  };

  // 生成签名
  body.signature = signGatewayParams(body, gatewayConfig.authToken);

  const url = new URL('/api/v1/order/cancel-transaction', gatewayConfig.baseUrl).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`调用支付网关取消失败: HTTP ${response.status} ${response.statusText} ${text}`);
  }

  const json = (await response.json()) as GatewayCancelTransactionResponse;

  if (json.status_code !== 200) {
    throw new Error(`支付网关取消返回错误: ${json.message || json.status_code}`);
  }

  return json.data;
}
