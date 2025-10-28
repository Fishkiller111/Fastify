import pool from '../config/database.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 为 meme_events 表添加 pending_match_timeout 字段
    // 单位：秒(s)，默认值 3600(1小时)
    // 检查列是否已存在
    const columnCheckResult = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'meme_events' AND column_name = 'pending_match_timeout'`
    );

    if (columnCheckResult.rows.length === 0) {
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN pending_match_timeout INTEGER DEFAULT 3600
        CHECK (pending_match_timeout > 0 AND pending_match_timeout <= 604800);
      `);
    } else {
      console.log('ℹ️  Column pending_match_timeout already exists, skipping add');
    }

    // 添加索引以提高查询性能
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_pending_match_check
      ON meme_events(status, created_at)
      WHERE status = 'pending_match';
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 011: Added pending_match_timeout field successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 011 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 删除索引
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_pending_match_check;
    `);

    // 删除字段
    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN pending_match_timeout;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 011: Dropped pending_match_timeout field successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 011 rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
