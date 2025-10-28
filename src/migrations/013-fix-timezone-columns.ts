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
 * 修复时区问题迁移
 * 
 * 问题: deadline 字段定义为 TIMESTAMP 而不是 TIMESTAMP WITH TIME ZONE
 * 导致: 时区计算错误，deadline 比预期晚
 * 
 * 解决方案:
 * 1. 修改 meme_events 表的时间戳字段使用 TIMESTAMP WITH TIME ZONE
 * 2. 确保所有时间都存储为 UTC
 * 3. 修改 deadline 计算逻辑使用 UTC
 */
export const up = async () => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 修复 meme_events 表的时区列...');

    // 修改 deadline 列从 TIMESTAMP 到 TIMESTAMP WITH TIME ZONE
    await client.query(`
      ALTER TABLE meme_events
      ALTER COLUMN deadline TYPE TIMESTAMP WITH TIME ZONE USING deadline AT TIME ZONE 'UTC'
    `);
    console.log('  ✅ deadline 列已修改为 TIMESTAMP WITH TIME ZONE');

    // 修改 launch_time 列
    await client.query(`
      ALTER TABLE meme_events
      ALTER COLUMN launch_time TYPE TIMESTAMP WITH TIME ZONE USING launch_time AT TIME ZONE 'UTC'
    `);
    console.log('  ✅ launch_time 列已修改为 TIMESTAMP WITH TIME ZONE');

    // 修改 created_at 列
    await client.query(`
      ALTER TABLE meme_events
      ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('  ✅ created_at 列已修改为 TIMESTAMP WITH TIME ZONE');

    // 修改 settled_at 列
    await client.query(`
      ALTER TABLE meme_events
      ALTER COLUMN settled_at TYPE TIMESTAMP WITH TIME ZONE USING settled_at AT TIME ZONE 'UTC'
    `);
    console.log('  ✅ settled_at 列已修改为 TIMESTAMP WITH TIME ZONE');

    // 同时修复 meme_bets 表的时间戳
    console.log('\n🔧 修复 meme_bets 表的时区列...');
    
    await client.query(`
      ALTER TABLE meme_bets
      ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('  ✅ meme_bets.created_at 列已修改为 TIMESTAMP WITH TIME ZONE');

    // 设置数据库时区为 UTC
    console.log('\n🔧 设置数据库会话时区为 UTC...');
    await client.query("SET TIME ZONE 'UTC'");
    console.log('  ✅ 数据库时区已设置为 UTC');

    await client.query('COMMIT');
    console.log('\n✅ Migration 013: 时区问题修复成功');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 013 failed:', error);
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

    console.log('⏮️ 回滚 Migration 013...');

    // 回滚 meme_events 表
    await client.query(`
      ALTER TABLE meme_events
      ALTER COLUMN deadline TYPE TIMESTAMP,
      ALTER COLUMN launch_time TYPE TIMESTAMP,
      ALTER COLUMN created_at TYPE TIMESTAMP SET DEFAULT CURRENT_TIMESTAMP,
      ALTER COLUMN settled_at TYPE TIMESTAMP
    `);

    // 回滚 meme_bets 表
    await client.query(`
      ALTER TABLE meme_bets
      ALTER COLUMN created_at TYPE TIMESTAMP SET DEFAULT CURRENT_TIMESTAMP
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 013 rollback successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 013 rollback failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};
