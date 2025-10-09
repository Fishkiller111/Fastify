import { PaymentMethod, PaymentParams, PaymentResult } from './types.js';
import { getPaymentMethodConfig } from './config.js';
import { WeChatPaymentService } from './wechat-service.js';
import { AlipayPaymentService } from './alipay-service.js';

// 支付服务映射
const paymentServices = new Map<PaymentMethod, WeChatPaymentService | AlipayPaymentService>();

// 获取支付服务实例
async function getPaymentService(method: PaymentMethod) {
  // 如果服务实例已存在，直接返回
  if (paymentServices.has(method)) {
    return paymentServices.get(method);
  }

  // 获取配置
  const config = await getPaymentMethodConfig(method);
  
  // 创建服务实例
  let service: WeChatPaymentService | AlipayPaymentService | null = null;
  
  switch (method) {
    case PaymentMethod.WECHAT:
      service = new WeChatPaymentService(config);
      break;
    case PaymentMethod.ALIPAY:
      service = new AlipayPaymentService(config);
      break;
    default:
      throw new Error(`不支持的支付方式: ${method}`);
  }
  
  // 保存实例
  if (service) {
    paymentServices.set(method, service);
  }
  
  return service;
}

// 执行支付
export async function processPayment(method: PaymentMethod, params: PaymentParams): Promise<PaymentResult> {
  try {
    const service = await getPaymentService(method);
    if (!service) {
      return {
        success: false,
        message: `不支持的支付方式: ${method}`
      };
    }
    
    return await service.pay(params);
  } catch (error: any) {
    console.error('支付处理失败:', error);
    return {
      success: false,
      message: error.message || '支付处理失败'
    };
  }
}

// 查询支付状态
export async function queryPaymentStatus(method: PaymentMethod, transactionId: string): Promise<PaymentResult> {
  try {
    const service = await getPaymentService(method);
    if (!service) {
      return {
        success: false,
        message: `不支持的支付方式: ${method}`
      };
    }
    
    return await service.queryPayment(transactionId);
  } catch (error: any) {
    console.error('查询支付状态失败:', error);
    return {
      success: false,
      message: error.message || '查询支付状态失败'
    };
  }
}