import { User } from '../auth/types.js';
import pool from '../../config/database.js';

/**
 * 用户服务
 */
class UserService {
  /**
   * 根据ID获取用户信息
   * @param id 用户ID
   * @returns 用户信息
   */
  async getUserById(id: number): Promise<User | null> {
    const client = await pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        password: row.password,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }

  /**
   * 根据邮箱获取用户信息
   * @param email 用户邮箱
   * @returns 用户信息
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const client = await pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        password: row.password,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }
}

export default new UserService();