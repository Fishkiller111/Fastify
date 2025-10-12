import pool from "../../config/database.js";
import { getConfigByKey } from "../config/service.js";
import type { MembershipLevel, UserMembership } from "./types.js";

// 创建会员等级
export async function createMembershipLevel(
  level: Omit<MembershipLevel, "id" | "created_at" | "updated_at">
): Promise<MembershipLevel> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO membership_levels (name, level, upgrade_fee, gift_points, description, extra)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [level.name, level.level, level.upgrade_fee, level.gift_points, level.description, level.extra]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// 获取所有会员等级
export async function getAllMembershipLevels(): Promise<MembershipLevel[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM membership_levels ORDER BY level"
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// 获取用户会员信息
export async function getUserMembership(
  userId: number
): Promise<UserMembership> {
  const client = await pool.connect();
  try {
    // 检查会员积分系统是否启用
    const membershipEnabledConfig = await getConfigByKey(
      "membership_points_system_enabled"
    );
    const membershipEnabled = membershipEnabledConfig?.value === "true";

    if (!membershipEnabled) {
      throw new Error("会员积分系统未启用");
    }

    let result = await client.query(
      "SELECT * FROM user_membership WHERE user_id = $1",
      [userId]
    );

    // 如果用户没有会员信息，创建一条
    if (result.rows.length === 0) {
      result = await client.query(
        `INSERT INTO user_membership (user_id, current_points, total_points)
         VALUES ($1, 0, 0)
         RETURNING *`,
        [userId]
      );
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

// 更新用户会员等级
export async function updateUserMembershipLevel(userId: number): Promise<void> {
  const client = await pool.connect();
  try {
    // 检查会员积分系统是否启用
    const membershipEnabledConfig = await getConfigByKey(
      "membership_points_system_enabled"
    );
    const membershipEnabled = membershipEnabledConfig?.value === "true";

    if (!membershipEnabled) {
      return;
    }

    await client.query("BEGIN");

    // 获取用户当前积分
    const userMembershipResult = await client.query(
      "SELECT current_points FROM user_membership WHERE user_id = $1",
      [userId]
    );

    if (userMembershipResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const currentPoints = userMembershipResult.rows[0].current_points;

    // 获取适合用户积分的最高等级
    const levelResult = await client.query(
      `SELECT id FROM membership_levels 
       WHERE upgrade_fee <= $1 
       ORDER BY level DESC LIMIT 1`,
      [currentPoints]
    );

    if (levelResult.rows.length > 0) {
      const levelId = levelResult.rows[0].id;

      // 更新用户会员等级
      await client.query(
        "UPDATE user_membership SET level_id = $1 WHERE user_id = $2",
        [levelId, userId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
