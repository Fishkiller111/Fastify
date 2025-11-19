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
 * 创建充值支付订单表 payment_orders
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建支付订单表
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id VARCHAR(64) NOT NULL UNIQUE,
        trade_id VARCHAR(64),
        amount_cny NUMERIC(18, 2) NOT NULL,
        actual_amount NUMERIC(36, 18),
        token VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
          CHECK (status IN ('unpaid', 'pending_onchain', 'paid', 'expired', 'cancelled')),
        payment_url TEXT,
        timeout_seconds INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 为 payment_orders 增加 updated_at 自动更新时间戳触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_payment_orders_updated_at ON payment_orders;
      CREATE TRIGGER update_payment_orders_updated_at
      BEFORE UPDATE ON payment_orders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    // 索引优化
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id ON payment_orders(order_id);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_id ON payment_orders(trade_id);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 018: payment_orders 表创建成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 018 failed:', error);
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

    await client.query('DROP TABLE IF EXISTS payment_orders CASCADE');

    await client.query('COMMIT');
    console.log('✅ Migration 018 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 018 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
