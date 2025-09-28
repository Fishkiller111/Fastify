import { getConfigByKey, setConfig } from '../config/service.js';
import { getDefaultSMSService } from '../sms/service.js';

// 验证码接口
export interface VerificationCode {
  phoneNumber: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

// 生成随机验证码
function generateCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

// 验证码服务
export class VerificationCodeService {
  private static instance: VerificationCodeService;
  private codeExpiryMinutes: number = 5; // 验证码默认5分钟有效期

  private constructor() {
    // 私有构造函数，实现单例模式
  }

  // 获取验证码服务实例
  static getInstance(): VerificationCodeService {
    if (!VerificationCodeService.instance) {
      VerificationCodeService.instance = new VerificationCodeService();
    }
    return VerificationCodeService.instance;
  }

  // 设置验证码有效期（分钟）
  setExpiryMinutes(minutes: number): void {
    this.codeExpiryMinutes = minutes;
  }

  // 发送验证码
  async sendCode(phoneNumber: string): Promise<boolean> {
    try {
      // 生成验证码
      const code = generateCode(6);
      
      // 计算过期时间
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.codeExpiryMinutes);
      
      // 保存验证码到数据库（这里简化处理，实际项目中可能需要单独的表）
      const codeKey = `verification_code_${phoneNumber}`;
      const codeData = {
        code: code,
        expiresAt: expiresAt.toISOString()
      };
      
      await setConfig({
        key: codeKey,
        value: JSON.stringify(codeData),
        description: `手机号 ${phoneNumber} 的验证码`
      });
      
      // 获取短信服务并发送验证码
      const smsService = await getDefaultSMSService();
      const result = await smsService.sendVerificationCode(phoneNumber, code);
      
      if (result) {
        console.log(`验证码已发送至 ${phoneNumber}`);
      } else {
        console.error(`验证码发送失败: ${phoneNumber}`);
      }
      
      return result;
    } catch (error) {
      console.error('发送验证码时发生错误:', error);
      return false;
    }
  }

  // 验证验证码
  async verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const codeKey = `verification_code_${phoneNumber}`;
      const config = await getConfigByKey(codeKey);
      
      if (!config) {
        return false;
      }
      
      const codeData = JSON.parse(config.value);
      
      // 检查验证码是否过期
      const expiresAt = new Date(codeData.expiresAt);
      const now = new Date();
      
      if (now > expiresAt) {
        // 验证码已过期，删除它
        // await deleteConfig(codeKey); // 这里需要实现deleteConfig函数
        return false;
      }
      
      // 检查验证码是否正确
      return codeData.code === code;
    } catch (error) {
      console.error('验证验证码时发生错误:', error);
      return false;
    }
  }
}

// 导出单例实例
export default VerificationCodeService.getInstance();