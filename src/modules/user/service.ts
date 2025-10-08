import { User, SafeUser, CreateUserRequest, UpdateUserRequest, UpdateUserRoleRequest, UserListQuery, PaginatedResponse } from '../auth/types.js';
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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      return user;
    } finally {
      client.release();
    }
  }

  /**
   * 根据钱包地址获取用户信息
   * @param walletAddress 钱包地址
   * @returns 用户信息
   */
  async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    const client = await pool.connect();

    try {
      const normalizedAddress = walletAddress.toLowerCase();
      const result = await client.query('SELECT * FROM users WHERE wallet_address = $1', [normalizedAddress]);

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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
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
        whereClause = `WHERE username ILIKE $1 OR email ILIKE $1 OR phone_number ILIKE $1 OR wallet_address ILIKE $1`;
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
        SELECT id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at
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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
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
        'SELECT id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at FROM users WHERE id = $1',
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
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role || 'user',
        permissions: row.permissions || ['user_access'],
        status: row.status || 'active',
        last_login_at: row.last_login_at,
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

      // 检查钱包地址是否已存在（如果提供了钱包地址）
      let normalizedWallet: string | null = null;
      if (userData.wallet_address) {
        normalizedWallet = userData.wallet_address.toLowerCase();
        const walletCheck = await client.query('SELECT id FROM users WHERE wallet_address = $1', [normalizedWallet]);
        if (walletCheck.rows.length > 0) {
          throw new Error('钱包地址已存在');
        }
      }

      const balanceValue = userData.balance !== undefined ? userData.balance.toString() : null;

      // 加密密码
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // 插入用户数据
      const insertQuery = `
        INSERT INTO users (username, email, password, phone_number, wallet_address, balance, role, permissions, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at
      `;

      const result = await client.query(insertQuery, [
        userData.username,
        userData.email,
        hashedPassword,
        userData.phone_number || null,
        normalizedWallet,
        balanceValue,
        'user',
        ['user_access'],
        'active'
      ]);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role,
        permissions: row.permissions,
        status: row.status,
        last_login_at: row.last_login_at,
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

      if (userData.wallet_address !== undefined) {
        let normalizedWallet: string | null = null;
        if (userData.wallet_address) {
          normalizedWallet = userData.wallet_address.toLowerCase();
          const walletCheck = await client.query('SELECT id FROM users WHERE wallet_address = $1 AND id != $2', [normalizedWallet, id]);
          if (walletCheck.rows.length > 0) {
            throw new Error('钱包地址已存在');
          }
        }
        updates.push(`wallet_address = $${paramIndex++}`);
        values.push(normalizedWallet);
      }

      if (userData.balance !== undefined) {
        const normalizedBalance = userData.balance !== undefined ? userData.balance.toString() : null;
        updates.push(`balance = $${paramIndex++}`);
        values.push(normalizedBalance);
      }

      if (userData.role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        values.push(userData.role);

        // 根据角色设置默认权限
        const defaultPermissions = userData.role === 'admin' ? ['admin_access', 'user_management'] : ['user_access'];
        updates.push(`permissions = $${paramIndex++}`);
        values.push(defaultPermissions);
      }

      if (userData.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(userData.status);
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
        RETURNING id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at
      `;

      const result = await client.query(updateQuery, values);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role,
        permissions: row.permissions,
        status: row.status,
        last_login_at: row.last_login_at,
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
   * 更新用户角色
   * @param id 用户ID
   * @param roleData 角色数据
   * @returns 更新后的用户信息
   */
  async updateUserRole(id: number, roleData: UpdateUserRoleRequest): Promise<SafeUser | null> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 检查用户是否存在
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [id]);
      if (userCheck.rows.length === 0) {
        return null;
      }

      // 根据角色设置默认权限
      const defaultPermissions = roleData.role === 'admin' ? ['admin_access', 'user_management'] : ['user_access'];

      const updateQuery = `
        UPDATE users
        SET role = $1, permissions = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at
      `;

      const result = await client.query(updateQuery, [roleData.role, defaultPermissions, id]);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role,
        permissions: row.permissions,
        status: row.status,
        last_login_at: row.last_login_at,
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
   * 获取用户所有下注记录(包含事件详情)
   * 包括 meme 和 mainstream 类型的所有下注
   * @param userId 用户ID
   * @param limit 返回记录数
   * @param offset 分页偏移量
   * @returns 用户下注记录列表
   */
  async getAllUserBets(userId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT
          mb.*,
          me.type,
          me.status as event_status,
          me.contract_address,
          me.deadline,
          me.settled_at,
          me.token_name,
          me.big_coin_id,
          bc.symbol as big_coin_symbol,
          bc.name as big_coin_name,
          bc.icon_url as big_coin_icon_url,
          me.future_price,
          me.current_price
         FROM meme_bets mb
         INNER JOIN meme_events me ON mb.event_id = me.id
         LEFT JOIN big_coins bc ON me.big_coin_id = bc.id
         WHERE mb.user_id = $1
         ORDER BY mb.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows.map(row => ({
        id: row.id,
        event_id: row.event_id,
        user_id: row.user_id,
        bet_type: row.bet_type,
        bet_amount: row.bet_amount,
        odds_at_bet: row.odds_at_bet,
        potential_payout: row.potential_payout,
        actual_payout: row.actual_payout,
        status: row.status,
        created_at: row.created_at,
        event: {
          id: row.event_id,
          type: row.type,
          status: row.event_status,
          contract_address: row.contract_address,
          deadline: row.deadline,
          settled_at: row.settled_at,
          token_name: row.token_name,
          big_coin_id: row.big_coin_id,
          big_coin_symbol: row.big_coin_symbol,
          big_coin_name: row.big_coin_name,
          big_coin_icon_url: row.big_coin_icon_url,
          future_price: row.future_price,
          current_price: row.current_price,
        }
      }));
    } finally {
      client.release();
    }
  }

  /**
   * 获取用户统计数据
   * 包括: 盈利、亏损、活跃下注金额等
   * @param userId 用户ID
   * @param timeRange 时间范围 ('1d' | '1w' | '1m' | 'all')
   * @returns 用户统计数据
   */
  async getUserStatistics(userId: number, timeRange: string = 'all'): Promise<any> {
    const client = await pool.connect();

    try {
      // 构建时间过滤条件
      let timeFilter = '';
      const params: any[] = [userId];

      if (timeRange !== 'all') {
        let interval = '';
        switch (timeRange) {
          case '1d':
            interval = '1 day';
            break;
          case '1w':
            interval = '7 days';
            break;
          case '1m':
            interval = '30 days';
            break;
          default:
            interval = ''; // 默认为all,不添加时间限制
        }

        if (interval) {
          timeFilter = `AND created_at >= NOW() - INTERVAL '${interval}'`;
        }
      }

      const result = await client.query(
        `SELECT
          COUNT(*) as total_bets,
          COALESCE(SUM(bet_amount), 0) as total_bet_amount,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN bet_amount ELSE 0 END), 0) as active_bet_amount,
          COALESCE(SUM(CASE WHEN status = 'won' THEN (actual_payout - bet_amount) ELSE 0 END), 0) as profit,
          COALESCE(SUM(CASE WHEN status = 'lost' THEN bet_amount ELSE 0 END), 0) as loss,
          COUNT(CASE WHEN status = 'won' THEN 1 END) as won_count,
          COUNT(CASE WHEN status IN ('won', 'lost') THEN 1 END) as settled_count
         FROM meme_bets
         WHERE user_id = $1 ${timeFilter}`,
        params
      );

      const row = result.rows[0];

      const profit = parseFloat(row.profit);
      const loss = parseFloat(row.loss);
      const netProfit = profit - loss;
      const settledCount = parseInt(row.settled_count);
      const wonCount = parseInt(row.won_count);
      const winRate = settledCount > 0 ? ((wonCount / settledCount) * 100).toFixed(2) : '0.00';

      return {
        time_range: timeRange,
        total_bets: parseInt(row.total_bets),
        total_bet_amount: parseFloat(row.total_bet_amount).toFixed(2),
        active_bet_amount: parseFloat(row.active_bet_amount).toFixed(2),
        profit: profit.toFixed(2),
        loss: loss.toFixed(2),
        net_profit: netProfit.toFixed(2),
        win_rate: winRate,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 创建管理员用户
   * @param userData 管理员数据
   * @returns 创建的管理员用户信息
   */
  async createAdmin(userData: CreateUserRequest): Promise<SafeUser> {
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

      // 检查钱包地址是否已存在（如果提供了钱包地址）
      let normalizedWallet: string | null = null;
      if (userData.wallet_address) {
        normalizedWallet = userData.wallet_address.toLowerCase();
        const walletCheck = await client.query('SELECT id FROM users WHERE wallet_address = $1', [normalizedWallet]);
        if (walletCheck.rows.length > 0) {
          throw new Error('钱包地址已存在');
        }
      }

      const balanceValue = userData.balance !== undefined ? userData.balance.toString() : null;

      // 加密密码
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // 插入管理员用户数据
      const insertQuery = `
        INSERT INTO users (username, email, password, phone_number, wallet_address, balance, role, permissions, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, username, email, phone_number, wallet_address, balance, role, permissions, status, last_login_at, created_at, updated_at
      `;

      const result = await client.query(insertQuery, [
        userData.username,
        userData.email,
        hashedPassword,
        userData.phone_number || null,
        normalizedWallet,
        balanceValue,
        'admin',
        ['admin_access', 'user_management'],
        'active'
      ]);

      await client.query('COMMIT');

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        phone_number: row.phone_number,
        wallet_address: row.wallet_address,
        balance: row.balance,
        role: row.role,
        permissions: row.permissions,
        status: row.status,
        last_login_at: row.last_login_at,
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
}

export default new UserService();
