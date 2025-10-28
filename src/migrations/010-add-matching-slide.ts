/**
 * 迁移 010: 添加匹配滑动值字段
 * 
 * ⚠️ 重要提示 - 数据安全声明:
 * 
 * 本迁移文件：
 * ✅ 不会插入任何初始数据
 * ✅ 不会修改现有的 big_coins 表数据
 * ✅ 不会修改现有的 commission_tiers 表数据
 * ✅ 不会影响任何用户数据
 * ✅ 完全幂等 - 重复运行不会出错
 * 
 * 只会执行以下操作:
 * 1. 向 meme_events 表添加 matching_slide 字段 (如果不存在)
 * 2. 向 meme_events 表添加 matched_amount 字段 (如果不存在)
 * 3. 创建 idx_meme_events_matching_slide 索引 (幂等操作)
 * 
 * 所有操作都使用 IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，
 * 确保重复运行不会产生错误或覆盖现有数据。
 */

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

/**
 * 迁移：添加matching_slide字段到meme_events表
 * 匹配滑动值：1-100之间的整数，表示反方需要达到的投注金额百分比
 * 例如50表示需要达到初始资金池的50%才能成功开盘
 * 
 * 重要提示：
 * - 本迁移不会插入任何数据
 * - 不会覆盖现有的 big_coins 数据
 * - 不会覆盖现有的 commission_tiers 数据
 * - 只添加字段和索引，确保数据安全
 */
async function up() {
  console.log('🚀 开始迁移：添加matching_slide字段...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 检查matching_slide字段是否已存在（幂等设计）
    const matchingSlideResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'meme_events' AND column_name = 'matching_slide'
    `);

    if (matchingSlideResult.rows.length > 0) {
      console.log('ℹ️ matching_slide字段已存在，跳过创建');
      // 继续检查 matched_amount 字段
    } else {
      console.log('📝 添加 matching_slide 字段...');

      // 添加matching_slide字段
      // 默认值设为50（表示需要达到初始资金池的50%）
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN matching_slide INTEGER DEFAULT 50
        CHECK (matching_slide >= 1 AND matching_slide <= 100)
      `);
      console.log('✅ matching_slide字段已添加');
    }

    // 检查matched_amount字段是否已存在（幂等设计）
    const matchedAmountResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'meme_events' AND column_name = 'matched_amount'
    `);

    if (matchedAmountResult.rows.length === 0) {
      console.log('📝 添加 matched_amount 字段...');
      // 添加matched_amount字段，记录当前反方的投注累计
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN matched_amount NUMERIC(36, 18) DEFAULT 0
      `);
      console.log('✅ matched_amount字段已添加');
    } else {
      console.log('ℹ️ matched_amount字段已存在，跳过创建');
    }

    // 添加索引以提高查询性能（幂等设计）
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_matching_slide 
      ON meme_events(matching_slide)
    `);
    console.log('✅ 索引已创建或已存在');

    await client.query('COMMIT');
    console.log('🎉 迁移完成：matching_slide机制已添加');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log('🔄 开始回滚迁移...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 删除索引
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_matching_slide;
    `);

    // 删除字段
    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS matched_amount;
    `);

    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS matching_slide;
    `);

    await client.query('COMMIT');
    console.log('🎉 回滚完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 回滚失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
