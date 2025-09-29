import { User, SafeUser, CreateUserRequest, UpdateUserRequest, UserListQuery, PaginatedResponse } from '../auth/types.js';
import pool from '../../config/database.js';
import bcrypt from 'bcrypt';

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
        phone_number: row.phone_number,
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
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }
  
  /**
   * 根据手机号获取用户信息
   * @param phoneNumber 用户手机号
   * @returns 用户信息
   */
  async getUserByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const client = await pool.connect();
    
    try {
      const result = await client.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        password: row.password,
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
      
      return user;
    } finally {
      client.release();
    }
  }

  /**
   * 获取用户列表（管理端）
   * @param query 查询参数
   * @returns 分页的用户列表
   */
  async getUserList(query: UserListQuery): Promise<PaginatedResponse<SafeUser>> {
    const client = await pool.connect();

    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 10, 100); // 最大限制100条
      const offset = (page - 1) * limit;
      const search = query.search || '';
      const sortBy = query.sortBy || 'created_at';
      const sortOrder = query.sortOrder || 'desc';

      // 构建搜索条件
      let whereClause = '';
      let queryParams: any[] = [];

      if (search) {
        whereClause = `WHERE username ILIKE $1 OR email ILIKE $1 OR phone_number ILIKE $1`;
        queryParams.push(`%${search}%`);
      }

      // 获取总数
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // 构建排序和分页查询
      const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      const limitClause = `LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

      queryParams.push(limit, offset);

      // 查询用户数据（不包含密码）
      const userQuery = `
        SELECT id, username, email, phone_number, created_at, updated_at
        FROM users
        ${whereClause}
        ${orderClause}
        ${limitClause}
      `;

      const result = await client.query(userQuery, queryParams);

      const users: SafeUser[] = result.rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      return {
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * 获取安全的用户信息（不包含密码）
   * @param id 用户ID
   * @returns 安全的用户信息
   */
  async getSafeUserById(id: number): Promise<SafeUser | null> {
    const client = await pool.connect();

    try {
      const result = await client.query(
        'SELECT id, username, email, phone_number, created_at, updated_at FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * 创建用户（管理端）
   * @param userData 用户数据
   * @returns 创建的用户信息
   */
  async createUser(userData: CreateUserRequest): Promise<SafeUser> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 检查用户名是否已存在
      const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1', [userData.username]);
      if (usernameCheck.rows.length > 0) {
        throw new Error('用户名已存在');
      }

      // 检查邮箱是否已存在
      const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [userData.email]);
      if (emailCheck.rows.length > 0) {
        throw new Error('邮箱已存在');
      }

      // 检查手机号是否已存在（如果提供了手机号）
      if (userData.phone_number) {
        const phoneCheck = await client.query('SELECT id FROM users WHERE phone_number = $1', [userData.phone_number]);
        if (phoneCheck.rows.length > 0) {
          throw new Error('手机号已存在');
        }
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // 插入用户数据
      const insertQuery = `
        INSERT INTO users (username, email, password, phone_number)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, phone_number, created_at, updated_at
      `;

      const result = await client.query(insertQuery, [
        userData.username,
        userData.email,
        hashedPassword,
        userData.phone_number || null
      ]);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 更新用户（管理端）
   * @param id 用户ID
   * @param userData 更新数据
   * @returns 更新后的用户信息
   */
  async updateUser(id: number, userData: UpdateUserRequest): Promise<SafeUser | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 检查用户是否存在
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [id]);
      if (userCheck.rows.length === 0) {
        return null;
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // 动态构建更新语句
      if (userData.username !== undefined) {
        // 检查用户名是否被其他用户使用
        const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1 AND id != $2', [userData.username, id]);
        if (usernameCheck.rows.length > 0) {
          throw new Error('用户名已存在');
        }
        updates.push(`username = $${paramIndex++}`);
        values.push(userData.username);
      }

      if (userData.email !== undefined) {
        // 检查邮箱是否被其他用户使用
        const emailCheck = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [userData.email, id]);
        if (emailCheck.rows.length > 0) {
          throw new Error('邮箱已存在');
        }
        updates.push(`email = $${paramIndex++}`);
        values.push(userData.email);
      }

      if (userData.password !== undefined) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        updates.push(`password = $${paramIndex++}`);
        values.push(hashedPassword);
      }

      if (userData.phone_number !== undefined) {
        if (userData.phone_number) {
          // 检查手机号是否被其他用户使用
          const phoneCheck = await client.query('SELECT id FROM users WHERE phone_number = $1 AND id != $2', [userData.phone_number, id]);
          if (phoneCheck.rows.length > 0) {
            throw new Error('手机号已存在');
          }
        }
        updates.push(`phone_number = $${paramIndex++}`);
        values.push(userData.phone_number || null);
      }

      if (updates.length === 0) {
        // 没有更新字段，直接返回当前用户信息
        await client.query('ROLLBACK');
        return this.getSafeUserById(id);
      }

      // 添加updated_at字段
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const updateQuery = `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, username, email, phone_number, created_at, updated_at
      `;

      const result = await client.query(updateQuery, values);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 删除用户（管理端）
   * @param id 用户ID
   * @returns 是否删除成功
   */
  async deleteUser(id: number): Promise<boolean> {
    const client = await pool.connect();

    try {
      const result = await client.query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount !== null && result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  /**
   * 检查用户名是否存在
   * @param username 用户名
   * @param excludeId 排除的用户ID（用于更新时检查）
   * @returns 是否存在
   */
  async isUsernameExists(username: string, excludeId?: number): Promise<boolean> {
    const client = await pool.connect();

    try {
      let query = 'SELECT id FROM users WHERE username = $1';
      const params: any[] = [username];

      if (excludeId) {
        query += ' AND id != $2';
        params.push(excludeId);
      }

      const result = await client.query(query, params);
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * 检查邮箱是否存在
   * @param email 邮箱
   * @param excludeId 排除的用户ID（用于更新时检查）
   * @returns 是否存在
   */
  async isEmailExists(email: string, excludeId?: number): Promise<boolean> {
    const client = await pool.connect();

    try {
      let query = 'SELECT id FROM users WHERE email = $1';
      const params: any[] = [email];

      if (excludeId) {
        query += ' AND id != $2';
        params.push(excludeId);
      }

      const result = await client.query(query, params);
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * 检查手机号是否存在
   * @param phoneNumber 手机号
   * @param excludeId 排除的用户ID（用于更新时检查）
   * @returns 是否存在
   */
  async isPhoneNumberExists(phoneNumber: string, excludeId?: number): Promise<boolean> {
    const client = await pool.connect();

    try {
      let query = 'SELECT id FROM users WHERE phone_number = $1';
      const params: any[] = [phoneNumber];

      if (excludeId) {
        query += ' AND id != $2';
        params.push(excludeId);
      }

      const result = await client.query(query, params);
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }
}

export default new UserService();