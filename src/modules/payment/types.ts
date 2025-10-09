// 支付方式枚举
export enum PaymentMethod {
  WECHAT = 'wechat',
  ALIPAY = 'alipay'
}

// 支付配置接口
export interface PaymentConfig {
  method: PaymentMethod;
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  merchantId?: string;
  privateKey?: string;
  alipayPublicKey?: string;
}

// 支付参数接口
export interface PaymentParams {
  orderId: string;
  amount: number;
  description: string;
  userId: number;
}

// 支付结果接口
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message?: string;
}