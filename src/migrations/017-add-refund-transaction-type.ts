/**
 * Migration 017: 添加 refund 交易类型
 *
 * 为 transactions 表的 transaction_type 添加 'refund' 类型支持
 * 用于记录 matching 阶段的超额退款交易
 */

import pool from '../config/database.js';

interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * 执行迁移
 */
export async function up(): Promise<MigrationResult> {
  const client = await pool.connect();

  try {
    console.log('🚀 开始迁移：添加 refund 交易类型...');
    await client.query('BEGIN');

    // 修改 transaction_type 的 CHECK 约束，添加 'refund' 类型
    await client.query(`
      ALTER TABLE transactions
      DROP CONSTRAINT IF EXISTS transactions_transaction_type_check
    `);

    await client.query(`
      ALTER TABLE transactions
      ADD CONSTRAINT transactions_transaction_type_check
      CHECK (transaction_type IN ('buy', 'sell', 'settle', 'refund'))
    `);

    console.log('✅ refund 交易类型已添加到 transactions 表');

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Migration 017: refund 交易类型添加成功'
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败:', error);
    return {
      success: false,
      message: 'Migration 017: refund 交易类型添加失败',
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * 回滚迁移
 */
export async function down(): Promise<MigrationResult> {
  const client = await pool.connect();

  try {
    console.log('🔄 回滚迁移：移除 refund 交易类型...');
    await client.query('BEGIN');

    // 恢复原来的 CHECK 约束
    await client.query(`
      ALTER TABLE transactions
      DROP CONSTRAINT IF EXISTS transactions_transaction_type_check
    `);

    await client.query(`
      ALTER TABLE transactions
      ADD CONSTRAINT transactions_transaction_type_check
      CHECK (transaction_type IN ('buy', 'sell', 'settle'))
    `);

    console.log('✅ refund 交易类型已从 transactions 表移除');

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Migration 017: refund 交易类型回滚成功'
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ 回滚失败:', error);
    return {
      success: false,
      message: 'Migration 017: refund 交易类型回滚失败',
      error: error.message
    };
  } finally {
    client.release();
  }
}
