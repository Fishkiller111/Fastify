import pool from '../config/database.js';

/**
 * 迁移006: 为主流币事件添加 future_price 和 current_price 字段
 */
export async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('添加 future_price 和 current_price 字段到 meme_events 表...');

    // 添加 future_price 字段（预测的未来价格）
    await client.query(`
      ALTER TABLE meme_events
      ADD COLUMN IF NOT EXISTS future_price NUMERIC(36, 18);
    `);

    // 添加 current_price 字段（结算时的实际价格）
    await client.query(`
      ALTER TABLE meme_events
      ADD COLUMN IF NOT EXISTS current_price NUMERIC(36, 18);
    `);

    await client.query('COMMIT');
    console.log('✅ 迁移006完成: future_price 和 current_price 字段已添加');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移006失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('回滚迁移006: 删除 future_price 和 current_price 字段...');

    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS future_price,
      DROP COLUMN IF EXISTS current_price;
    `);

    await client.query('COMMIT');
    console.log('✅ 迁移006已回滚');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 回滚迁移006失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default { up, down };
