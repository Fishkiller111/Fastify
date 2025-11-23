import config from '../config/index.js';
import { Pool } from 'pg';

function createPool() {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });
}

/**
 * Migration 020: 为 withdraw_orders 表增加提现抽成相关字段
 * - gross_amount: 用户实际扣减总金额（含抽成）
 * - fee_amount: 抽成金额
 * - fee_rate: 抽成比例（小数，0.05 表示 5%）
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 新增字段（如果不存在）
    await client.query(`
      ALTER TABLE withdraw_orders
      ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(36, 18) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(36, 18) DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS fee_rate NUMERIC(10, 6) DEFAULT 0 NOT NULL
    `);

    // 对历史数据做一次回填：默认视为无抽成
    await client.query(`
      UPDATE withdraw_orders
      SET gross_amount = amount,
          fee_amount = 0,
          fee_rate = 0
      WHERE gross_amount = 0
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 020: withdraw_orders 抽成字段添加成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 020 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

export const down = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE withdraw_orders
      DROP COLUMN IF EXISTS gross_amount,
      DROP COLUMN IF EXISTS fee_amount,
      DROP COLUMN IF EXISTS fee_rate
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 020 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 020 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
