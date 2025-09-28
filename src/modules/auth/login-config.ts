import { getConfigByKey, setConfig } from '../config/service.js';

// 登录方式枚举
export enum LoginMethod {
  EMAIL = 'email',
  SMS = 'sms'
}

// 登录配置接口
export interface LoginConfig {
  method: LoginMethod;
  aliCloudAccessKeyId?: string;
  aliCloudAccessKeySecret?: string;
  aliCloudSignName?: string;
  aliCloudTemplateCode?: string;
}

// 获取当前登录配置
export async function getLoginConfig(): Promise<LoginConfig> {
  // 获取登录方式
  const methodConfig = await getConfigByKey('login_method');
  const method = methodConfig?.value === LoginMethod.SMS ? LoginMethod.SMS : LoginMethod.EMAIL;
  
  // 如果是短信登录方式，获取阿里云配置
  if (method === LoginMethod.SMS) {
    const accessKeyIdConfig = await getConfigByKey('aliyun_sms_access_key_id');
    const accessKeySecretConfig = await getConfigByKey('aliyun_sms_access_key_secret');
    const signNameConfig = await getConfigByKey('aliyun_sms_sign_name');
    const templateCodeConfig = await getConfigByKey('aliyun_sms_template_code');
    
    return {
      method,
      aliCloudAccessKeyId: accessKeyIdConfig?.value,
      aliCloudAccessKeySecret: accessKeySecretConfig?.value,
      aliCloudSignName: signNameConfig?.value,
      aliCloudTemplateCode: templateCodeConfig?.value
    };
  }
  
  return {
    method
  };
}

// 设置登录方式
export async function setLoginMethod(method: LoginMethod): Promise<void> {
  await setConfig({
    key: 'login_method',
    value: method,
    description: '登录方式配置 (email 或 sms)'
  });
}

// 设置阿里云短信服务配置
export async function setAliyunSMSConfig(config: {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
}): Promise<void> {
  await setConfig({
    key: 'aliyun_sms_access_key_id',
    value: config.accessKeyId,
    description: '阿里云短信服务AccessKeyId'
  });
  
  await setConfig({
    key: 'aliyun_sms_access_key_secret',
    value: config.accessKeySecret,
    description: '阿里云短信服务AccessKeySecret'
  });
  
  await setConfig({
    key: 'aliyun_sms_sign_name',
    value: config.signName,
    description: '阿里云短信服务签名'
  });
  
  await setConfig({
    key: 'aliyun_sms_template_code',
    value: config.templateCode,
    description: '阿里云短信服务模板Code'
  });
}

// 验证阿里云短信配置是否完整
export async function validateAliyunSMSConfig(): Promise<boolean> {
  const accessKeyIdConfig = await getConfigByKey('aliyun_sms_access_key_id');
  const accessKeySecretConfig = await getConfigByKey('aliyun_sms_access_key_secret');
  const signNameConfig = await getConfigByKey('aliyun_sms_sign_name');
  const templateCodeConfig = await getConfigByKey('aliyun_sms_template_code');
  
  return !!(
    accessKeyIdConfig?.value &&
    accessKeySecretConfig?.value &&
    signNameConfig?.value &&
    templateCodeConfig?.value
  );
}