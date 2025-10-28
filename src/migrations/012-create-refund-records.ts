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
 * 创建退款记录表 - 用于追踪所有退款操作
 * 包括: 超额投注退款、活动取消退款等
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建退款记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS refund_records (
        id SERIAL PRIMARY KEY,
        bet_id INTEGER REFERENCES meme_bets(id) ON DELETE CASCADE,
        event_id INTEGER NOT NULL REFERENCES meme_events(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refund_type VARCHAR(50) NOT NULL CHECK (refund_type IN ('excess_matching', 'event_cancelled', 'manual', 'other')),
        refund_reason VARCHAR(255) NOT NULL,
        refund_amount NUMERIC(36, 18) NOT NULL,
        original_bet_amount NUMERIC(36, 18),
        status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引以加快查询
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_refund_records_event ON refund_records(event_id);
      CREATE INDEX IF NOT EXISTS idx_refund_records_user ON refund_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_refund_records_bet ON refund_records(bet_id);
      CREATE INDEX IF NOT EXISTS idx_refund_records_type ON refund_records(refund_type);
      CREATE INDEX IF NOT EXISTS idx_refund_records_created ON refund_records(created_at);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 012: 退款记录表创建成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 012 failed:', error);
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

    await client.query('DROP TABLE IF EXISTS refund_records CASCADE');

    await client.query('COMMIT');
    console.log('✅ Migration 012 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 012 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
