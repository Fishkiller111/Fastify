import { Pool } from 'pg';
import config from '../config/index.js';

function createPool() {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });
}

async function up() {
  console.log('🚀 开始创建K线数据表...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建K线数据表
    await client.query(`
      CREATE TABLE IF NOT EXISTS klines (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES meme_events(id) ON DELETE CASCADE,
        timestamp BIGINT NOT NULL,
        yes_odds DECIMAL(10, 2) NOT NULL,
        no_odds DECIMAL(10, 2) NOT NULL,
        yes_pool DECIMAL(20, 2) NOT NULL DEFAULT 0,
        no_pool DECIMAL(20, 2) NOT NULL DEFAULT 0,
        total_bets INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, timestamp)
      )
    `);

    // 创建索引提升查询性能
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_klines_event_id ON klines(event_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_klines_timestamp ON klines(timestamp)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_klines_event_timestamp ON klines(event_id, timestamp)
    `);

    await client.query('COMMIT');
    console.log('✅ K线数据表创建成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ K线数据表创建失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log('🔄 开始回滚K线数据表...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 删除索引
    await client.query('DROP INDEX IF EXISTS idx_klines_event_timestamp');
    await client.query('DROP INDEX IF EXISTS idx_klines_timestamp');
    await client.query('DROP INDEX IF EXISTS idx_klines_event_id');

    // 删除表
    await client.query('DROP TABLE IF EXISTS klines');

    await client.query('COMMIT');
    console.log('✅ K线数据表回滚成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ K线数据表回滚失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
