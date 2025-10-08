import pool from '../config/database.js';

/**
 * Migration 007: 为big_coins表添加icon_url字段
 * 添加主流币种的图标URL地址
 */
export async function up() {
  const client = await pool.connect();

  try {
    console.log('Running migration: 007-add-coin-icon');

    // 添加icon_url字段
    await client.query(`
      ALTER TABLE big_coins
      ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500);
    `);

    console.log('✅ Migration 007 completed: Added icon_url to big_coins');
  } catch (error) {
    console.error('❌ Migration 007 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
