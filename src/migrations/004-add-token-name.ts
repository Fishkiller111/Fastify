import { Client, Pool } from 'pg';
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
  console.log('🚀 开始添加 token_name 字段到 meme_events 表...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 添加 token_name 字段
    await client.query(`
      ALTER TABLE meme_events
      ADD COLUMN IF NOT EXISTS token_name VARCHAR(200);
    `);

    // 创建索引以提高查询性能
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_token_name ON meme_events(token_name);
    `);

    await client.query('COMMIT');
    console.log('🎉 token_name 字段添加完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ token_name 字段添加失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log('🔄 开始回滚 token_name 字段...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 删除索引
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_token_name;
    `);

    // 删除字段
    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS token_name;
    `);

    await client.query('COMMIT');
    console.log('🎉 token_name 字段回滚完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ token_name 字段回滚失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
