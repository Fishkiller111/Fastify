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
  console.log('🚀 开始修改 meme_events 表支持 Mainstream 类型...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 修改 type 字段的约束,添加 Mainstream 类型
    await client.query(`
      ALTER TABLE meme_events
      DROP CONSTRAINT IF EXISTS meme_events_type_check;
    `);

    await client.query(`
      ALTER TABLE meme_events
      ADD CONSTRAINT meme_events_type_check
      CHECK (type IN ('pumpfun', 'bonk', 'Mainstream'));
    `);

    // 添加 big_coin_id 外键字段（可选，仅 Mainstream 类型使用）
    await client.query(`
      ALTER TABLE meme_events
      ADD COLUMN IF NOT EXISTS big_coin_id INTEGER REFERENCES big_coins(id);
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_big_coin ON meme_events(big_coin_id);
      CREATE INDEX IF NOT EXISTS idx_meme_events_type ON meme_events(type);
    `);

    await client.query('COMMIT');
    console.log('🎉 meme_events 表修改完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ meme_events 表修改失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log('🔄 开始回滚 meme_events 表修改...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 删除新增的字段和索引
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_big_coin;
      DROP INDEX IF EXISTS idx_meme_events_type;
    `);

    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS big_coin_id;
    `);

    // 恢复原始类型约束
    await client.query(`
      ALTER TABLE meme_events
      DROP CONSTRAINT IF EXISTS meme_events_type_check;
    `);

    await client.query(`
      ALTER TABLE meme_events
      ADD CONSTRAINT meme_events_type_check
      CHECK (type IN ('pumpfun', 'bonk'));
    `);

    await client.query('COMMIT');
    console.log('🎉 meme_events 表回滚完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ meme_events 表回滚失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
