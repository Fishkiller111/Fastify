import { PaymentMethod, PaymentParams, PaymentResult } from './types.js';
import { getPaymentConfig, setPaymentConfig } from './config.js';
import { WeChatPaymentService } from './wechat-service.js';
import { AlipayPaymentService } from './alipay-service.js';
import { processPayment, queryPaymentStatus } from './service.js';

// 支付模块主类
export class PaymentModule {
  // 初始化支付模块
  static async initialize() {
    console.log('支付模块初始化完成');
  }

  // 获取支付配置
  static async getConfig() {
    return await getPaymentConfig();
  }

  // 设置支付配置
  static async setConfig(config: any[]) {
    return await setPaymentConfig(config);
  }

  // 获取启用的支付方式
  static async getEnabledMethods() {
    const configs = await getPaymentConfig();
    return configs.filter(config => config.enabled).map(config => config.method);
  }

  // 处理支付
  static async pay(method: PaymentMethod, params: PaymentParams): Promise<PaymentResult> {
    // 检查支付方式是否启用
    const enabledMethods = await this.getEnabledMethods();
    if (!enabledMethods.includes(method)) {
      return {
        success: false,
        message: `支付方式 ${method} 未启用`
      };
    }
    
    return await processPayment(method, params);
  }

  // 查询支付状态
  static async queryStatus(method: PaymentMethod, transactionId: string): Promise<PaymentResult> {
    return await queryPaymentStatus(method, transactionId);
  }
}