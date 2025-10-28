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
 * 为 meme_bets 表添加 final_amount 字段
 * 用于存储扣除退款后的最终注金金额，用于结算时计算实际收益
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 添加 final_amount 字段，默认值为 bet_amount
    await client.query(`
      ALTER TABLE meme_bets
      ADD COLUMN IF NOT EXISTS final_amount NUMERIC(36, 18);
    `);

    // 初始化现有数据的 final_amount = bet_amount
    await client.query(`
      UPDATE meme_bets
      SET final_amount = bet_amount
      WHERE final_amount IS NULL;
    `);

    // 为 final_amount 添加非空约束
    await client.query(`
      ALTER TABLE meme_bets
      ALTER COLUMN final_amount SET NOT NULL;
    `);

    // 添加索引以加快查询
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_bets_final_amount 
      ON meme_bets(final_amount);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 014: meme_bets 表添加 final_amount 字段成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 014 failed:', error);
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
      DROP INDEX IF EXISTS idx_meme_bets_final_amount;
    `);

    await client.query(`
      ALTER TABLE meme_bets
      DROP COLUMN IF EXISTS final_amount;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 014 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 014 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
