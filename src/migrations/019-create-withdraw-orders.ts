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
 * 创建提现订单表 withdraw_orders
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建提现订单表
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdraw_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id VARCHAR(64) NOT NULL UNIQUE,
        withdraw_id VARCHAR(64),
        trade_type VARCHAR(64) NOT NULL,
        amount NUMERIC(36, 18) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
        from_address VARCHAR(255),
        tx_hash VARCHAR(255),
        expired_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 为 withdraw_orders 增加 updated_at 自动更新时间戳触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_withdraw_orders_updated_at ON withdraw_orders;
      CREATE TRIGGER update_withdraw_orders_updated_at
      BEFORE UPDATE ON withdraw_orders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    // 索引优化
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_withdraw_orders_user ON withdraw_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_withdraw_orders_order_id ON withdraw_orders(order_id);
      CREATE INDEX IF NOT EXISTS idx_withdraw_orders_withdraw_id ON withdraw_orders(withdraw_id);
      CREATE INDEX IF NOT EXISTS idx_withdraw_orders_status ON withdraw_orders(status);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 019: withdraw_orders 表创建成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 019 failed:', error);
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

    await client.query('DROP TABLE IF EXISTS withdraw_orders CASCADE');

    await client.query('COMMIT');
    console.log('✅ Migration 019 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 019 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
