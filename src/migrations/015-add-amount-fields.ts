/**
 * Migration 015: 添加amount字段到meme_events表
 *
 * 实现amount机制:
 * - 1 amount = 0.5 U
 * - 添加 yes_amount, no_amount, initial_amount 字段
 * - amount = pool × 2 的关系
 *
 * 变更内容:
 * 1. 向 meme_events 表添加 initial_amount 字段 (INTEGER)
 * 2. 向 meme_events 表添加 yes_amount 字段 (INTEGER)
 * 3. 向 meme_events 表添加 no_amount 字段 (INTEGER)
 * 4. 创建索引优化查询性能
 */

import pool from '../config/database.js';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * 执行迁移
 */
async function up(): Promise<MigrationResult> {
  const client = await pool.connect();

  try {
    console.log('🚀 开始迁移：添加amount字段...');

    await client.query('BEGIN');

    // 1. 检查 initial_amount 字段是否已存在
    const initialAmountExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'meme_events' AND column_name = 'initial_amount'
    `);

    if (initialAmountExists.rows.length === 0) {
      console.log('📝 添加 initial_amount 字段...');
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN initial_amount INTEGER DEFAULT 0 NOT NULL
      `);
      console.log('✅ initial_amount 字段已添加');
    } else {
      console.log('ℹ️ initial_amount 字段已存在，跳过创建');
    }

    // 2. 检查 yes_amount 字段是否已存在
    const yesAmountExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'meme_events' AND column_name = 'yes_amount'
    `);

    if (yesAmountExists.rows.length === 0) {
      console.log('📝 添加 yes_amount 字段...');
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN yes_amount INTEGER DEFAULT 0 NOT NULL
      `);
      console.log('✅ yes_amount 字段已添加');
    } else {
      console.log('ℹ️ yes_amount 字段已存在，跳过创建');
    }

    // 3. 检查 no_amount 字段是否已存在
    const noAmountExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'meme_events' AND column_name = 'no_amount'
    `);

    if (noAmountExists.rows.length === 0) {
      console.log('📝 添加 no_amount 字段...');
      await client.query(`
        ALTER TABLE meme_events
        ADD COLUMN no_amount INTEGER DEFAULT 0 NOT NULL
      `);
      console.log('✅ no_amount 字段已添加');
    } else {
      console.log('ℹ️ no_amount 字段已存在，跳过创建');
    }

    // 4. 为现有数据填充 amount 值 (pool × 2)
    // 只在字段存在的情况下才填充数据
    if (initialAmountExists.rows.length > 0 && yesAmountExists.rows.length > 0 && noAmountExists.rows.length > 0) {
      console.log('🔄 为现有数据填充 amount 值...');
      await client.query(`
        UPDATE meme_events
        SET
          initial_amount = CAST(initial_pool_amount * 2 AS INTEGER),
          yes_amount = CAST(yes_pool * 2 AS INTEGER),
          no_amount = CAST(no_pool * 2 AS INTEGER)
        WHERE initial_amount = 0 AND yes_amount = 0 AND no_amount = 0
      `);
      console.log('✅ 现有数据已填充');
    } else {
      console.log('ℹ️ 字段刚创建，跳过数据填充（默认值已设置）');
    }

    // 5. 创建索引以优化查询性能
    console.log('📝 创建索引...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_yes_amount
      ON meme_events(yes_amount)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_no_amount
      ON meme_events(no_amount)
    `);
    console.log('✅ 索引已创建');

    await client.query('COMMIT');
    console.log('🎉 迁移完成：amount 字段已成功添加');

    return {
      success: true,
      message: 'Amount 字段迁移成功',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败:', error);

    return {
      success: false,
      message: '迁移失败',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

/**
 * 回滚迁移
 */
async function down(): Promise<MigrationResult> {
  const client = await pool.connect();

  try {
    console.log('🔙 开始回滚：删除amount字段...');

    await client.query('BEGIN');

    // 1. 删除索引
    console.log('📝 删除索引...');
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_yes_amount;
    `);
    await client.query(`
      DROP INDEX IF EXISTS idx_meme_events_no_amount;
    `);
    console.log('✅ 索引已删除');

    // 2. 删除字段
    console.log('📝 删除 amount 字段...');
    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS no_amount;
    `);
    console.log('✅ no_amount 字段已删除');

    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS yes_amount;
    `);
    console.log('✅ yes_amount 字段已删除');

    await client.query(`
      ALTER TABLE meme_events
      DROP COLUMN IF EXISTS initial_amount;
    `);
    console.log('✅ initial_amount 字段已删除');

    await client.query('COMMIT');
    console.log('🎉 回滚完成：amount 字段已删除');

    return {
      success: true,
      message: 'Amount 字段回滚成功',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 回滚失败:', error);

    return {
      success: false,
      message: '回滚失败',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

// 如果直接运行此文件，执行迁移
const currentFile = fileURLToPath(import.meta.url);
const mainFile = resolve(process.argv[1]);

if (currentFile === mainFile) {
  console.log('🚀 开始执行迁移...');
  up()
    .then((result) => {
      if (result.success) {
        console.log('✅', result.message);
        process.exit(0);
      } else {
        console.error('❌', result.message, result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ 迁移执行失败:', error);
      process.exit(1);
    });
}

export { up, down };
