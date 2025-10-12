import pool from '../../config/database.js';
import type {
  ReferralCode,
  ReferralRelationship,
  CommissionTier,
  CommissionRecord,
  ReferralStatistics,
  CreateCommissionTierRequest,
  UpdateCommissionTierRequest
} from './types.js';
import crypto from 'crypto';

export class ReferralService {
  /**
   * 生成唯一邀请码
   */
  private static async generateUniqueCode(): Promise<string> {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;

    while (!isUnique) {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      const result = await pool.query(
        'SELECT id FROM referral_codes WHERE code = $1',
        [code]
      );
      isUnique = result.rows.length === 0;
    }

    return code;
  }

  /**
   * 为用户生成邀请码
   */
  static async generateReferralCode(userId: number): Promise<ReferralCode> {
    // 检查用户是否已有邀请码
    const existingCode = await pool.query<ReferralCode>(
      'SELECT * FROM referral_codes WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (existingCode.rows.length > 0) {
      return existingCode.rows[0];
    }

    // 生成新邀请码
    const code = await this.generateUniqueCode();
    const result = await pool.query<ReferralCode>(
      `INSERT INTO referral_codes (user_id, code)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, code]
    );

    return result.rows[0];
  }

  /**
   * 获取用户的邀请码
   */
  static async getUserReferralCode(userId: number): Promise<ReferralCode | null> {
    const result = await pool.query<ReferralCode>(
      'SELECT * FROM referral_codes WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * 验证邀请码是否有效
   */
  static async validateReferralCode(code: string): Promise<ReferralCode | null> {
    const result = await pool.query<ReferralCode>(
      'SELECT * FROM referral_codes WHERE code = $1 AND is_active = true',
      [code]
    );

    return result.rows[0] || null;
  }

  /**
   * 激活邀请关系
   */
  static async activateReferral(
    inviteeId: number,
    referralCode: string
  ): Promise<ReferralRelationship | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 验证邀请码
      const codeResult = await client.query<ReferralCode>(
        'SELECT * FROM referral_codes WHERE code = $1 AND is_active = true',
        [referralCode]
      );

      if (codeResult.rows.length === 0) {
        throw new Error('无效的邀请码');
      }

      const inviterId = codeResult.rows[0].user_id;

      // 检查是否自己邀请自己
      if (inviterId === inviteeId) {
        throw new Error('不能使用自己的邀请码');
      }

      // 检查是否已经被邀请过
      const existingRelation = await client.query(
        'SELECT id FROM referral_relationships WHERE invitee_id = $1',
        [inviteeId]
      );

      if (existingRelation.rows.length > 0) {
        throw new Error('该账户已被邀请过');
      }

      // 创建邀请关系
      const result = await client.query<ReferralRelationship>(
        `INSERT INTO referral_relationships (inviter_id, invitee_id, referral_code)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [inviterId, inviteeId, referralCode]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 获取邀请统计信息
   */
  static async getReferralStatistics(userId: number): Promise<ReferralStatistics> {
    // 获取邀请人数和总交易量
    const statsResult = await pool.query(
      `SELECT
        COUNT(DISTINCT rr.invitee_id) as total_invitees,
        COALESCE(SUM(mb.bet_amount), 0) as total_volume
       FROM referral_relationships rr
       LEFT JOIN meme_bets mb ON mb.user_id = rr.invitee_id
       WHERE rr.inviter_id = $1`,
      [userId]
    );

    const totalInvitees = parseInt(statsResult.rows[0].total_invitees) || 0;
    const totalVolume = parseFloat(statsResult.rows[0].total_volume) || 0;

    // 获取佣金统计
    const commissionResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'settled' THEN commission_amount ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_commission
       FROM commission_records
       WHERE inviter_id = $1`,
      [userId]
    );

    const totalCommissionEarned = parseFloat(commissionResult.rows[0].total_earned) || 0;
    const pendingCommission = parseFloat(commissionResult.rows[0].pending_commission) || 0;

    // 获取当前等级和下一等级
    const currentTier = await this.getTierByVolume(totalVolume);
    const nextTier = await this.getNextTier(currentTier?.tier_order || 0);

    let volumeToNextTier: number | null = null;
    if (nextTier) {
      volumeToNextTier = nextTier.min_volume - totalVolume;
    }

    return {
      inviter_id: userId,
      total_invitees: totalInvitees,
      total_volume: totalVolume,
      total_commission_earned: totalCommissionEarned,
      pending_commission: pendingCommission,
      current_tier: currentTier,
      next_tier: nextTier,
      volume_to_next_tier: volumeToNextTier
    };
  }

  /**
   * 根据交易量获取对应等级
   */
  static async getTierByVolume(volume: number): Promise<CommissionTier | null> {
    const result = await pool.query<CommissionTier>(
      `SELECT * FROM commission_tiers
       WHERE is_active = true
         AND min_volume <= $1
         AND (max_volume IS NULL OR max_volume > $1)
       ORDER BY tier_order DESC
       LIMIT 1`,
      [volume]
    );

    return result.rows[0] || null;
  }

  /**
   * 获取下一等级
   */
  static async getNextTier(currentTierOrder: number): Promise<CommissionTier | null> {
    const result = await pool.query<CommissionTier>(
      `SELECT * FROM commission_tiers
       WHERE is_active = true AND tier_order > $1
       ORDER BY tier_order ASC
       LIMIT 1`,
      [currentTierOrder]
    );

    return result.rows[0] || null;
  }

  /**
   * 获取所有等级配置
   */
  static async getAllTiers(): Promise<CommissionTier[]> {
    const result = await pool.query<CommissionTier>(
      'SELECT * FROM commission_tiers ORDER BY tier_order ASC'
    );
    return result.rows;
  }

  /**
   * 创建等级配置
   */
  static async createTier(data: CreateCommissionTierRequest): Promise<CommissionTier> {
    const { tier_name, min_volume, max_volume, commission_rate, tier_order } = data;

    // 验证佣金比例
    if (commission_rate < 0 || commission_rate > 1) {
      throw new Error('佣金比例必须在 0 到 1 之间');
    }

    // 验证交易量范围
    if (max_volume !== undefined && max_volume <= min_volume) {
      throw new Error('最大交易量必须大于最小交易量');
    }

    const result = await pool.query<CommissionTier>(
      `INSERT INTO commission_tiers
        (tier_name, min_volume, max_volume, commission_rate, tier_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tier_name, min_volume, max_volume || null, commission_rate, tier_order]
    );

    return result.rows[0];
  }

  /**
   * 更新等级配置
   */
  static async updateTier(
    tierId: number,
    data: UpdateCommissionTierRequest
  ): Promise<CommissionTier> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.tier_name !== undefined) {
      updates.push(`tier_name = $${paramIndex++}`);
      values.push(data.tier_name);
    }

    if (data.min_volume !== undefined) {
      updates.push(`min_volume = $${paramIndex++}`);
      values.push(data.min_volume);
    }

    if (data.max_volume !== undefined) {
      updates.push(`max_volume = $${paramIndex++}`);
      values.push(data.max_volume);
    }

    if (data.commission_rate !== undefined) {
      if (data.commission_rate < 0 || data.commission_rate > 1) {
        throw new Error('佣金比例必须在 0 到 1 之间');
      }
      updates.push(`commission_rate = $${paramIndex++}`);
      values.push(data.commission_rate);
    }

    if (data.tier_order !== undefined) {
      updates.push(`tier_order = $${paramIndex++}`);
      values.push(data.tier_order);
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(tierId);

    const result = await pool.query<CommissionTier>(
      `UPDATE commission_tiers
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('等级配置不存在');
    }

    return result.rows[0];
  }

  /**
   * 删除等级配置
   */
  static async deleteTier(tierId: number): Promise<void> {
    const result = await pool.query(
      'DELETE FROM commission_tiers WHERE id = $1',
      [tierId]
    );

    if (result.rowCount === 0) {
      throw new Error('等级配置不存在');
    }
  }

  /**
   * 记录佣金（在用户下注时调用）
   */
  static async recordCommission(
    inviteeId: number,
    betId: number,
    betAmount: number
  ): Promise<CommissionRecord | null> {
    // 检查是否有邀请关系
    const relationResult = await pool.query<ReferralRelationship>(
      'SELECT * FROM referral_relationships WHERE invitee_id = $1',
      [inviteeId]
    );

    if (relationResult.rows.length === 0) {
      return null; // 没有邀请人，不记录佣金
    }

    const inviterId = relationResult.rows[0].inviter_id;

    // 获取邀请人的当前交易量和等级
    const stats = await this.getReferralStatistics(inviterId);
    const currentTier = stats.current_tier;

    if (!currentTier) {
      return null; // 没有匹配的等级
    }

    const commissionRate = currentTier.commission_rate;
    const commissionAmount = betAmount * commissionRate;

    // 记录佣金
    const result = await pool.query<CommissionRecord>(
      `INSERT INTO commission_records
        (inviter_id, invitee_id, bet_id, bet_amount, commission_rate, commission_amount, tier_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [inviterId, inviteeId, betId, betAmount, commissionRate, commissionAmount, currentTier.id]
    );

    return result.rows[0];
  }

  /**
   * 结算佣金（在事件结算时调用）
   */
  static async settleCommission(betId: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 获取待结算的佣金记录
      const commissionResult = await client.query<CommissionRecord>(
        `SELECT * FROM commission_records
         WHERE bet_id = $1 AND status = 'pending'`,
        [betId]
      );

      if (commissionResult.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      const commission = commissionResult.rows[0];

      // 更新用户余额
      await client.query(
        `UPDATE users
         SET balance = balance + $1
         WHERE id = $2`,
        [commission.commission_amount, commission.inviter_id]
      );

      // 更新佣金状态
      await client.query(
        `UPDATE commission_records
         SET status = 'settled', settled_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [commission.id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 获取邀请人的被邀请者列表
   */
  static async getInviteesList(
    inviterId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<Array<{
    user_id: number;
    wallet_address: string | null;
    email: string | null;
    total_bets: number;
    total_bet_amount: number;
    activated_at: Date;
  }>> {
    const result = await pool.query(
      `SELECT
        u.id as user_id,
        u.wallet_address,
        u.email,
        COUNT(mb.id) as total_bets,
        COALESCE(SUM(mb.bet_amount), 0) as total_bet_amount,
        rr.activated_at
       FROM referral_relationships rr
       JOIN users u ON u.id = rr.invitee_id
       LEFT JOIN meme_bets mb ON mb.user_id = u.id
       WHERE rr.inviter_id = $1
       GROUP BY u.id, u.wallet_address, u.email, rr.activated_at
       ORDER BY rr.activated_at DESC
       LIMIT $2 OFFSET $3`,
      [inviterId, limit, offset]
    );

    return result.rows;
  }

  /**
   * 获取佣金记录
   */
  static async getCommissionRecords(
    inviterId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<CommissionRecord[]> {
    const result = await pool.query<CommissionRecord>(
      `SELECT * FROM commission_records
       WHERE inviter_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [inviterId, limit, offset]
    );

    return result.rows;
  }
}
