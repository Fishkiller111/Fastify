import { setConfig } from '../modules/config/service.js';

/**
 * 初始化阿里云短信服务配置
 * 请根据实际情况修改以下配置值
 */
async function initializeAliyunSMSConfig() {
  try {
    console.log('开始初始化阿里云短信服务配置...');
    
    // 设置阿里云AccessKeyId
    await setConfig({
      key: 'aliyun_sms_access_key_id',
      value: process.env.ALIYUN_SMS_ACCESS_KEY_ID || 'your-access-key-id',
      description: '阿里云短信服务AccessKeyId'
    });
    
    // 设置阿里云AccessKeySecret
    await setConfig({
      key: 'aliyun_sms_access_key_secret',
      value: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || 'your-access-key-secret',
      description: '阿里云短信服务AccessKeySecret'
    });
    
    // 设置短信签名
    await setConfig({
      key: 'aliyun_sms_sign_name',
      value: process.env.ALIYUN_SMS_SIGN_NAME || 'your-sign-name',
      description: '阿里云短信服务签名'
    });
    
    // 设置短信模板Code
    await setConfig({
      key: 'aliyun_sms_template_code',
      value: process.env.ALIYUN_SMS_TEMPLATE_CODE || 'your-template-code',
      description: '阿里云短信服务模板Code'
    });
    
    console.log('阿里云短信服务配置初始化完成');
    console.log('请记得在生产环境中通过环境变量或直接在数据库中设置真实的配置值');
  } catch (error) {
    console.error('初始化阿里云短信服务配置时发生错误:', error);
  }
}

// 如果直接运行此脚本，则执行初始化
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeAliyunSMSConfig();
}