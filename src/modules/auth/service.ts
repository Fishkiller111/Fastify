import { User, RegisterRequest, LoginRequest, JwtPayload } from './types.js';
import bcrypt from 'bcrypt';
import pool from '../../config/database.js';
import UserService from '../user/service.js';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

/**
 * 用户认证服务
 */
class AuthService {
  /**
   * 注册新用户
   * @param userData 用户注册数据
   * @returns 创建的用户信息
   */
  async register(userData: RegisterRequest): Promise<User> {
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
   * 用户登录
   * @param loginData 登录数据
   * @returns 用户信息和JWT令牌
   */
  async login(loginData: LoginRequest): Promise<{ user: User; token: string }> {
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
}

export default new AuthService();