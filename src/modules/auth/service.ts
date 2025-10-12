import { User, RegisterRequest, LoginRequest, JwtPayload, SMSLoginRequest, SMSRegisterRequest, WalletLoginRequest } from './types.js';
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
        'INSERT INTO users (username, email, password, role, permissions, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userData.username, userData.email, hashedPassword, 'user', ['user_access'], 'active']
      );

      const user: User = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        password: result.rows[0].password,
        phone_number: result.rows[0].phone_number,
        wallet_address: result.rows[0].wallet_address,
        balance: result.rows[0].balance,
        role: result.rows[0].role || 'user',
        permissions: result.rows[0].permissions || ['user_access'],
        status: result.rows[0].status || 'active',
        last_login_at: result.rows[0].last_login_at,
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
        'INSERT INTO users (username, email, password, phone_number, role, permissions, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [userData.username, `${userData.phoneNumber}@sms.local`, hashedPassword, userData.phoneNumber, 'user', ['user_access'], 'active']
      );

      const user: User = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        password: result.rows[0].password,
        phone_number: result.rows[0].phone_number,
        wallet_address: result.rows[0].wallet_address,
        balance: result.rows[0].balance,
        role: result.rows[0].role || 'user',
        permissions: result.rows[0].permissions || ['user_access'],
        status: result.rows[0].status || 'active',
        last_login_at: result.rows[0].last_login_at,
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

    // 更新最后登录时间
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    } finally {
      client.release();
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
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

    // 更新最后登录时间
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    } finally {
      client.release();
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );
    
    return { user, token };
  }

  /**
   * 用户登录（钱包方式）
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async loginWithWallet(loginData: WalletLoginRequest): Promise<{ user: User; token: string }> {
    if (!loginData.walletAddress) {
      throw new Error('钱包地址不能为空');
    }

    const normalizedAddress = loginData.walletAddress.toLowerCase();
    const balanceValue = loginData.balance !== undefined ? loginData.balance.toString() : undefined;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingResult = await client.query('SELECT * FROM users WHERE wallet_address = $1', [normalizedAddress]);
      let row;
      let isNewUser = false;

      if (existingResult.rows.length === 0) {
        const randomPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        const walletEmail = `${normalizedAddress}@wallet.local`;
        const insertBalance = balanceValue !== undefined ? balanceValue : '0';

        const insertResult = await client.query(
          `INSERT INTO users (username, email, password, wallet_address, balance, role, permissions, status, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
           RETURNING *`,
          [
            normalizedAddress,
            walletEmail,
            hashedPassword,
            normalizedAddress,
            insertBalance,
            'user',
            ['user_access'],
            'active'
          ]
        );

        row = insertResult.rows[0];
        isNewUser = true;
      } else {
        const currentRow = existingResult.rows[0];
        const nextBalance = balanceValue !== undefined ? balanceValue : currentRow.balance ?? '0';
        const updateResult = await client.query(
          `UPDATE users
           SET balance = $1, last_login_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [nextBalance, currentRow.id]
        );

        row = updateResult.rows[0];
      }

      // 如果是新用户且提供了邀请码，激活邀请关系
      if (isNewUser && loginData.referralCode) {
        try {
          const { ReferralService } = await import('../referral/service.js');
          await ReferralService.activateReferral(row.id, loginData.referralCode);
        } catch (referralError: any) {
          console.error('邀请码激活失败:', referralError.message);
          // 邀请码激活失败不影响注册流程，继续执行
        }
      }

      await client.query('COMMIT');

      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        password: row.password,
        phone_number: row.phone_number,
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
      );

      return { user, token };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * 根据当前配置的登录方式注册用户
   * @param userData 用户注册数据
   * @returns 创建的用户信息
   */
  async register(userData: RegisterRequest | SMSRegisterRequest | WalletLoginRequest): Promise<User> {
    const loginConfig = await getLoginConfig();

    if (loginConfig.method === LoginMethod.SMS) {
      if ('phoneNumber' in userData) {
        return this.registerWithSMS(userData as SMSRegisterRequest);
      }
      throw new Error('当前注册方式为短信注册，请提供手机号和验证码');
    }

    if (loginConfig.method === LoginMethod.WALLET) {
      if ('walletAddress' in userData) {
        const { user } = await this.loginWithWallet(userData as WalletLoginRequest);
        return user;
      }
      throw new Error('当前注册方式为钱包注册，请提供钱包地址');
    }

    if (loginConfig.method === LoginMethod.BOTH) {
      if ('phoneNumber' in userData) {
        return this.registerWithSMS(userData as SMSRegisterRequest);
      }
      if ('email' in userData) {
        return this.registerWithEmail(userData as RegisterRequest);
      }
      throw new Error('请提供手机号验证码或邮箱密码进行注册');
    }

    return this.registerWithEmail(userData as RegisterRequest);
  }
  
  /**
   * 根据当前配置的登录方式登录用户
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async login(loginData: LoginRequest | SMSLoginRequest | WalletLoginRequest): Promise<{ user: User; token: string }> {
    const loginConfig = await getLoginConfig();

    switch (loginConfig.method) {
      case LoginMethod.SMS:
        if ('phoneNumber' in loginData) {
          return this.loginWithSMS(loginData as SMSLoginRequest);
        }
        throw new Error('当前登录方式为短信登录，请提供手机号和验证码');
      case LoginMethod.WALLET:
        if ('walletAddress' in loginData) {
          return this.loginWithWallet(loginData as WalletLoginRequest);
        }
        throw new Error('当前登录方式为钱包登录，请提供钱包地址');
      case LoginMethod.BOTH:
        if ('phoneNumber' in loginData) {
          return this.loginWithSMS(loginData as SMSLoginRequest);
        }
        if ('email' in loginData) {
          return this.loginWithEmail(loginData as LoginRequest);
        }
        throw new Error('请提供手机号验证码或邮箱密码进行登录');
      case LoginMethod.EMAIL:
      default:
        if ('email' in loginData) {
          return this.loginWithEmail(loginData as LoginRequest);
        }
        throw new Error('当前登录方式为邮箱登录，请提供邮箱和密码');
    }
  }
}

export default new AuthService();
