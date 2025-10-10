import  pool  from "../../config/database.js";
import { getConfigByKey } from "../config/service.js";
import { updateUserMembershipLevel } from "../membership/service.js";
import type { PointTransaction } from "./types.js";

// 添加用户积分
export async function addPoints(
  userId: number,
  points: number,
  type: string,
  source?: string,
  description?: string
): Promise<PointTransaction> {
  const client = await pool.connect();
  try {
    // 检查积分系统是否启用
    const pointsEnabledConfig = await getConfigByKey("points_system_enabled");
    const pointsEnabled = pointsEnabledConfig?.value === "true";

    if (!pointsEnabled) {
      throw new Error("积分系统未启用");
    }

    // 检查每日积分上限
    const maxDailyPointsConfig = await getConfigByKey("max_daily_points");
    const maxDailyPoints = maxDailyPointsConfig
      ? parseInt(maxDailyPointsConfig.value, 10)
      : 100;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyPointsResult = await client.query(
      `SELECT sum(points) as daily_points FROM point_transactions 
       WHERE user_id = $1 AND points > 0 AND created_at >= $2 AND created_at < $3`,
      [userId, today, tomorrow]
    );

    const dailyPoints = dailyPointsResult.rows[0].daily_points || 0;

    if (dailyPoints + points > maxDailyPoints) {
      throw new Error(`每日积分已达上限${maxDailyPoints}，无法添加更多积分`);
    }

    await client.query("BEGIN");

    // 创建积分交易记录
    const transactionResult = await client.query(
      `INSERT INTO point_transactions (user_id, points, type, source, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, points, type, source, description]
    );

    // 更新用户积分
    const pointsExpiryConfig = await getConfigByKey("points_expiry_days");
    const expiryDays = pointsExpiryConfig
      ? parseInt(pointsExpiryConfig.value, 10)
      : 365;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    await client.query(
      `INSERT INTO user_membership (user_id, current_points, total_points, points_expire_date)
       VALUES ($1, $2, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET 
         current_points = user_membership.current_points + $2,
         total_points = user_membership.total_points + $2,
         points_expire_date = $3`,
      [userId, points, expiryDate]
    );

    // 尝试更新用户会员等级
    await updateUserMembershipLevel(userId);

    await client.query("COMMIT");

    return transactionResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 扣除用户积分
export async function deductPoints(
  userId: number,
  points: number,
  type: string,
  source?: string,
  description?: string
): Promise<PointTransaction> {
  const client = await pool.connect();
  try {
    // 检查积分系统是否启用
    const pointsEnabledConfig = await getConfigByKey("points_system_enabled");
    const pointsEnabled = pointsEnabledConfig?.value === "true";

    if (!pointsEnabled) {
      throw new Error("积分系统未启用");
    }

    await client.query("BEGIN");

    // 检查用户积分是否足够
    const userPointsResult = await client.query(
      "SELECT current_points FROM user_membership WHERE user_id = $1",
      [userId]
    );

    if (
      userPointsResult.rows.length === 0 ||
      userPointsResult.rows[0].current_points < points
    ) {
      await client.query("ROLLBACK");
      throw new Error("积分不足");
    }

    // 创建积分交易记录（负值表示扣除）
    const transactionResult = await client.query(
      `INSERT INTO point_transactions (user_id, points, type, source, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, -points, type, source, description]
    );

    // 更新用户积分
    await client.query(
      "UPDATE user_membership SET current_points = current_points - $1 WHERE user_id = $2",
      [points, userId]
    );

    // 尝试更新用户会员等级
    await updateUserMembershipLevel(userId);

    await client.query("COMMIT");

    return transactionResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 获取用户积分交易记录
export async function getUserPointTransactions(
  userId: number,
  limit: number = 50,
  offset: number = 0
): Promise<PointTransaction[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
