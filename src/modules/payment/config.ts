import { PaymentConfig, PaymentMethod } from './types.js';
import { getConfigByKey, setConfig } from '../config/service.js';

// 配置键名
const PAYMENT_CONFIG_KEY = 'payment_config';

// 获取支付配置
export async function getPaymentConfig(): Promise<PaymentConfig[]> {
  try {
    const configItem = await getConfigByKey(PAYMENT_CONFIG_KEY);
    if (configItem && configItem.value) {
      return JSON.parse(configItem.value);
    }
    return [];
  } catch (error) {
    console.error('获取支付配置失败:', error);
    return [];
  }
}

// 设置支付配置
export async function setPaymentConfig(config: PaymentConfig[]): Promise<boolean> {
  try {
    const configItem = {
      key: PAYMENT_CONFIG_KEY,
      value: JSON.stringify(config),
      description: '支付配置'
    };
    await setConfig(configItem);
    return true;
  } catch (error) {
    console.error('设置支付配置失败:', error);
    return false;
  }
}

// 获取启用的支付方式
export async function getEnabledPaymentMethods(): Promise<PaymentMethod[]> {
  const configs = await getPaymentConfig();
  return configs
    .filter(config => config.enabled)
    .map(config => config.method);
}

// 获取特定支付方式的配置
export async function getPaymentMethodConfig(method: PaymentMethod): Promise<PaymentConfig | null> {
  const configs = await getPaymentConfig();
  return configs.find(config => config.method === method) || null;
}

// 初始化默认支付配置
export async function initializePaymentConfig(): Promise<void> {
  const existingConfig = await getPaymentConfig();
  
  if (existingConfig.length === 0) {
    // 如果没有配置，创建默认配置
    const defaultConfig: PaymentConfig[] = [
      {
        method: PaymentMethod.WECHAT,
        enabled: false,
        appId: '',
        appSecret: '',
        merchantId: ''
      },
      {
        method: PaymentMethod.ALIPAY,
        enabled: false,
        appId: '',
        privateKey: '',
        alipayPublicKey: ''
      }
    ];
    
    await setPaymentConfig(defaultConfig);
  }
}