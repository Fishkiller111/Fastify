import { User, RegisterRequest, LoginRequest, JwtPayload, SMSLoginRequest, SMSRegisterRequest } from './types.js';
import bcrypt from 'bcrypt';
import pool from '../../config/database.js';
import UserService from '../user/service.js';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { getLoginConfig, LoginMethod } from './login-config.js';
import VerificationCodeService from '../verification/service.js';

/**
 * 用户认证服务
 */
class AuthService {
  /**
   * 注册新用户（邮箱方式）
   * @param userData 用户注册数据
   * @returns 创建的用户信息
   */
  async registerWithEmail(userData: RegisterRequest): Promise<User> {
    const client = await pool.connect();
    
    try {
      // 检查用户是否已存在
      const existingUser = await UserService.getUserByEmail(userData.email);
      if (existingUser) {
        throw new Error('用户已存在');
      }
      
      // 密码加密
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // 插入新用户到数据库
      const result = await client.query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
        [userData.username, userData.email, hashedPassword]
      );
      
      const user: User = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        password: result.rows[0].password,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }
  
  /**
   * 注册新用户（短信方式）
   * @param userData 用户注册数据
   * @returns 创建的用户信息
   */
  async registerWithSMS(userData: SMSRegisterRequest): Promise<User> {
    const client = await pool.connect();
    
    try {
      // 验证手机号验证码
      const isCodeValid = await VerificationCodeService.verifyCode(userData.phoneNumber, userData.code);
      if (!isCodeValid) {
        throw new Error('验证码无效或已过期');
      }
      
      // 检查用户是否已存在（通过手机号）
      const existingUser = await UserService.getUserByPhoneNumber(userData.phoneNumber);
      if (existingUser) {
        throw new Error('用户已存在');
      }
      
      // 生成随机密码（因为短信注册不需要用户设置密码）
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      // 插入新用户到数据库
      const result = await client.query(
        'INSERT INTO users (username, email, password, phone_number) VALUES ($1, $2, $3, $4) RETURNING *',
        [userData.username, `${userData.phoneNumber}@sms.local`, hashedPassword, userData.phoneNumber]
      );
      
      const user: User = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        password: result.rows[0].password,
        phone_number: result.rows[0].phone_number,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }

  /**
   * 用户登录（邮箱方式）
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async loginWithEmail(loginData: LoginRequest): Promise<{ user: User; token: string }> {
    // 查找用户
    const user = await UserService.getUserByEmail(loginData.email);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(loginData.password, user.password);
    
    if (!isPasswordValid) {
      throw new Error('密码错误');
    }
    
    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );
    
    return { user, token };
  }
  
  /**
   * 用户登录（短信方式）
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async loginWithSMS(loginData: SMSLoginRequest): Promise<{ user: User; token: string }> {
    // 验证手机号验证码
    const isCodeValid = await VerificationCodeService.verifyCode(loginData.phoneNumber, loginData.code);
    if (!isCodeValid) {
      throw new Error('验证码无效或已过期');
    }
    
    // 查找用户
    const user = await UserService.getUserByPhoneNumber(loginData.phoneNumber);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    
    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );
    
    return { user, token };
  }
  
  /**
   * 根据当前配置的登录方式注册用户
   * @param userData 用户注册数据
   * @returns 创建的用户信息
   */
  async register(userData: RegisterRequest | SMSRegisterRequest): Promise<User> {
    const loginConfig = await getLoginConfig();
    
    if (loginConfig.method === LoginMethod.SMS && 'phoneNumber' in userData) {
      return this.registerWithSMS(userData as SMSRegisterRequest);
    } else {
      return this.registerWithEmail(userData as RegisterRequest);
    }
  }
  
  /**
   * 根据当前配置的登录方式登录用户
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async login(loginData: LoginRequest | SMSLoginRequest): Promise<{ user: User; token: string }> {
    const loginConfig = await getLoginConfig();
    
    if (loginConfig.method === LoginMethod.SMS && 'phoneNumber' in loginData) {
      return this.loginWithSMS(loginData as SMSLoginRequest);
    } else {
      return this.loginWithEmail(loginData as LoginRequest);
    }
  }
}

export default new AuthService();