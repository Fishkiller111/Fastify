import Core from '@alicloud/pop-core';
import { getConfigByKey } from '../config/service.js';

// 短信服务接口
export interface SMSService {
  sendVerificationCode(phoneNumber: string, code: string): Promise<boolean>;
}

// 阿里云短信服务配置接口
interface AliyunSMSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
}

// 阿里云短信服务实现
export class AliyunSMSService implements SMSService {
  private client: Core | null = null;
  private config: AliyunSMSConfig | null = null;

  // 初始化阿里云客户端
  private async initClient(): Promise<void> {
    if (this.client) return;

    // 从配置表中获取阿里云短信服务配置
    const accessKeyIdConfig = await getConfigByKey('aliyun_sms_access_key_id');
    const accessKeySecretConfig = await getConfigByKey('aliyun_sms_access_key_secret');
    const signNameConfig = await getConfigByKey('aliyun_sms_sign_name');
    const templateCodeConfig = await getConfigByKey('aliyun_sms_template_code');

    if (!accessKeyIdConfig || !accessKeySecretConfig || !signNameConfig || !templateCodeConfig) {
      throw new Error('阿里云短信服务配置不完整，请检查config表中的相关配置项');
    }

    this.config = {
      accessKeyId: accessKeyIdConfig.value,
      accessKeySecret: accessKeySecretConfig.value,
      signName: signNameConfig.value,
      templateCode: templateCodeConfig.value
    };

    this.client = new Core({
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      endpoint: 'https://dysmsapi.aliyuncs.com',
      apiVersion: '2017-05-25'
    });
  }

  // 发送验证码
  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      await this.initClient();
      
      if (!this.client || !this.config) {
        throw new Error('阿里云短信服务未正确初始化');
      }

      const params = {
        RegionId: 'cn-hangzhou',
        PhoneNumbers: phoneNumber,
        SignName: this.config.signName,
        TemplateCode: this.config.templateCode,
        TemplateParam: JSON.stringify({ code })
      };

      const requestOption = {
        method: 'POST'
      };

      const response: any = await this.client.request('SendSms', params, requestOption);
      
      if (response.Code === 'OK') {
        console.log(`验证码发送成功: ${phoneNumber}`);
        return true;
      } else {
        console.error(`验证码发送失败: ${response.Message}`);
        return false;
      }
    } catch (error) {
      console.error('发送验证码时发生错误:', error);
      return false;
    }
  }
}

// 获取默认短信服务实例
export async function getDefaultSMSService(): Promise<SMSService> {
  return new AliyunSMSService();
}