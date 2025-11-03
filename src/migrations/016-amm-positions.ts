/**
 * Migration 016: AMM 持仓系统重构
 *
 * 重构预测市场为 AMM (自动做市商) 机制:
 * - 创建 user_positions 表: 记录用户在各事件的当前持仓
 * - 创建 transactions 表: 记录所有买入/卖出交易历史
 * - 迁移现有 meme_bets 数据到新表
 *
 * AMM 定价机制:
 * - 1 amount 价格 = 1 × odds (例如: yes_odds=80% → 1 YES amount = 0.8U)
 * - 用户可随时买入/卖出，价格实时变化
 * - 结算时强制卖出所有持仓
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
    console.log('🚀 开始迁移：AMM 持仓系统重构...');
    await client.query('BEGIN');

    // 1. 创建 user_positions 表
    console.log('📝 创建 user_positions 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_positions (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES meme_events(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        yes_amount INTEGER DEFAULT 0 NOT NULL,
        no_amount INTEGER DEFAULT 0 NOT NULL,
        total_invested DECIMAL(36, 18) DEFAULT 0 NOT NULL,
        total_returned DECIMAL(36, 18) DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, user_id)
      )
    `);
    console.log('✅ user_positions 表已创建');

    // 2. 创建 transactions 表
    console.log('📝 创建 transactions 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES meme_events(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('buy', 'sell', 'settle')),
        side VARCHAR(3) NOT NULL CHECK (side IN ('yes', 'no')),
        amount_delta INTEGER NOT NULL,
        cost_or_return DECIMAL(36, 18) NOT NULL,
        odds_at_transaction DECIMAL(5, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ transactions 表已创建');

    // 3. 创建索引
    console.log('📝 创建索引...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_positions_event
      ON user_positions(event_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_positions_user
      ON user_positions(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_event
      ON transactions(event_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user
      ON transactions(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_type
      ON transactions(transaction_type)
    `);
    console.log('✅ 索引已创建');

    // 4. 迁移现有 meme_bets 数据
    console.log('🔄 迁移现有 meme_bets 数据...');

    // 检查 meme_bets 表是否有数据
    const betCount = await client.query('SELECT COUNT(*) FROM meme_bets');
    const count = parseInt(betCount.rows[0].count);

    if (count > 0) {
      console.log(`  发现 ${count} 条投注记录，开始迁移...`);

      // 将 meme_bets 转换为 transactions (买入记录)
      await client.query(`
        INSERT INTO transactions (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction, created_at)
        SELECT
          mb.event_id,
          mb.user_id,
          'buy' as transaction_type,
          mb.bet_type as side,
          CAST(mb.bet_amount * 2 AS INTEGER) as amount_delta,
          mb.bet_amount as cost_or_return,
          mb.odds_at_bet as odds_at_transaction,
          mb.created_at
        FROM meme_bets mb
        WHERE mb.status IN ('pending', 'won', 'lost')
      `);

      // 聚合生成 user_positions (只包含 pending 状态的持仓)
      await client.query(`
        INSERT INTO user_positions (event_id, user_id, yes_amount, no_amount, total_invested, created_at)
        SELECT
          mb.event_id,
          mb.user_id,
          SUM(CASE WHEN mb.bet_type = 'yes' THEN CAST(mb.bet_amount * 2 AS INTEGER) ELSE 0 END) as yes_amount,
          SUM(CASE WHEN mb.bet_type = 'no' THEN CAST(mb.bet_amount * 2 AS INTEGER) ELSE 0 END) as no_amount,
          SUM(mb.bet_amount) as total_invested,
          MIN(mb.created_at) as created_at
        FROM meme_bets mb
        WHERE mb.status = 'pending'
        GROUP BY mb.event_id, mb.user_id
        ON CONFLICT (event_id, user_id) DO NOTHING
      `);

      console.log('✅ 数据迁移完成');
    } else {
      console.log('  无需迁移数据（表为空）');
    }

    await client.query('COMMIT');
    console.log('🎉 迁移完成：AMM 持仓系统已就绪');

    return {
      success: true,
      message: 'AMM 持仓系统迁移成功',
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
    console.log('🔙 开始回滚：删除 AMM 持仓系统...');
    await client.query('BEGIN');

    console.log('📝 删除索引...');
    await client.query('DROP INDEX IF EXISTS idx_transactions_type');
    await client.query('DROP INDEX IF EXISTS idx_transactions_user');
    await client.query('DROP INDEX IF EXISTS idx_transactions_event');
    await client.query('DROP INDEX IF EXISTS idx_user_positions_user');
    await client.query('DROP INDEX IF EXISTS idx_user_positions_event');
    console.log('✅ 索引已删除');

    console.log('📝 删除表...');
    await client.query('DROP TABLE IF EXISTS transactions');
    await client.query('DROP TABLE IF EXISTS user_positions');
    console.log('✅ 表已删除');

    await client.query('COMMIT');
    console.log('🎉 回滚完成');

    return {
      success: true,
      message: 'AMM 持仓系统回滚成功',
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
