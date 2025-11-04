/**
 * 自动结算定时任务
 * 每分钟检查一次，自动结算已到达 deadline 的 active 事件
 */

import cron from 'node-cron';
import pool from '../../config/database.js';
import { checkTokenLaunchStatus } from './token-service.js';
import { settleMainstreamEvent } from '../mainstream/service.js';

/**
 * 自动结算单个事件
 */
async function settleEventAuto(eventId: number, type: string, contractAddress: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`\n🔄 ========== 自动结算事件 ID: ${eventId} ==========`);

    // 通过 DexScreener API 自动判断发射状态
    const isLaunched = await checkTokenLaunchStatus(type as any, contractAddress);

    if (isLaunched === null) {
      console.error(`   ❌ 自动判断发射状态失败，跳过结算`);
      await client.query('ROLLBACK');
      return;
    }

    console.log(`   📊 发射状态: ${isLaunched ? '成功' : '失败'}`);

    // 获取事件信息
    const eventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      console.error(`   ❌ 事件不存在`);
      await client.query('ROLLBACK');
      return;
    }

    const event = eventResult.rows[0];

    // 确定获胜方
    const winnerSide = isLaunched ? 'yes' : 'no';
    const totalPool = parseFloat(event.yes_pool) + parseFloat(event.no_pool);
    const winnerPool = parseFloat(winnerSide === 'yes' ? event.yes_pool : event.no_pool);

    console.log(`   🏆 获胜方: ${winnerSide.toUpperCase()}`);
    console.log(`   💰 总池子: ${totalPool}, 获胜池子: ${winnerPool}`);

    // 更新事件状态
    await client.query(
      `UPDATE meme_events
       SET status = 'settled', is_launched = $1, settled_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [isLaunched, eventId]
    );

    // 只更新 meme_bets 状态为 won/lost，不计算赔付
    // 所有赔付由 AMM 持仓清算处理
    await client.query(
      'UPDATE meme_bets SET status = $1 WHERE event_id = $2 AND bet_type = $3 AND status = $4',
      ['won', eventId, winnerSide, 'pending']
    );

    const loserSide = winnerSide === 'yes' ? 'no' : 'yes';
    await client.query(
      'UPDATE meme_bets SET status = $1 WHERE event_id = $2 AND bet_type = $3 AND status = $4',
      ['lost', eventId, loserSide, 'pending']
    );

    console.log(`   ✅ meme_bets 状态已更新: ${winnerSide} 方获胜`);

    // === AMM系统同步：强制卖出所有持仓并记录settle交易 ===
    console.log(`\n💰 处理AMM持仓清算...`);

    // 获取该事件的所有用户持仓
    const positionsResult = await client.query(
      'SELECT * FROM user_positions WHERE event_id = $1',
      [eventId]
    );

    for (const position of positionsResult.rows) {
      const userId = position.user_id;
      const yesAmount = parseInt(position.yes_amount);
      const noAmount = parseInt(position.no_amount);

      const yesOdds = parseFloat(event.yes_odds || 0);
      const noOdds = parseFloat(event.no_odds || 0);

      // 计算获胜方的返还金额
      // 返还金额 = amount × (odds / 100)
      // 例如：YES获胜，YES赔率80%，则持有100个YES amount返还 100 × 0.8 = 80U
      let settleReturn = 0;

      // 副谜：只返还获胜的一方，也就是 winnerSide 方的持仓
      if (winnerSide === 'yes') {
        settleReturn = yesAmount * (yesOdds / 100);
      } else if (winnerSide === 'no') {
        settleReturn = noAmount * (noOdds / 100);
      }

      // 记录结算交易
      // 覆盖之前的 amount日志
      if (yesAmount > 0) {
        await client.query(
          `INSERT INTO transactions
           (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
           VALUES ($1, $2, 'settle', $3, $4, $5, $6)`,
          [eventId, userId, 'yes', -yesAmount, (winnerSide === 'yes' ? settleReturn : 0), yesOdds]
        );
      }

      if (noAmount > 0) {
        await client.query(
          `INSERT INTO transactions
           (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
           VALUES ($1, $2, 'settle', $3, $4, $5, $6)`,
          [eventId, userId, 'no', -noAmount, (winnerSide === 'no' ? settleReturn : 0), noOdds]
        );
      }

      // 更新用户持仓
      await client.query(
        `UPDATE user_positions
         SET yes_amount = 0,
             no_amount = 0,
             total_returned = total_returned + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE event_id = $1 AND user_id = $3`,
        [eventId, settleReturn, userId]
      );

      // 发放返还
      if (settleReturn > 0) {
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [settleReturn, userId]
        );
      }

      console.log(`   📤 用户 ${userId} 持仓已清算: YES ${yesAmount} (${yesOdds}%) + NO ${noAmount} (${noOdds}%) = 返还 ${settleReturn.toFixed(2)}U`);
    }

    console.log(`   ✅ AMM持仓清算完成，共处理 ${positionsResult.rows.length} 个用户`);

    await client.query('COMMIT');
    console.log(`   🎉 事件 ${eventId} 结算完成！\n`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`   🔥 结算事件 ${eventId} 失败:`, error.message);
  } finally {
    client.release();
  }
}

/**
 * 处理 pending_match 超时事件
 * 1. 如果达到最低标准 → 激活事件
 * 2. 如果未达到最低标准 → 全额退款并取消事件
 */
async function handlePendingMatchTimeout(eventId: number): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`\n⏰ ========== 处理 pending_match 超时事件 ID: ${eventId} ==========`);

    const eventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1 AND status = $2',
      [eventId, 'pending_match']
    );

    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    const event = eventResult.rows[0];
    const creatorSide = event.creator_side;
    const initAmount = event.initial_amount;
    const matchingSlide = event.matching_slide;
    const counterAmount = creatorSide === 'yes' ? event.no_amount : event.yes_amount;
    const minRequiredAmount = Math.floor(initAmount * (1 - matchingSlide / 100));

    console.log(`   创建者方: ${creatorSide}`);
    console.log(`   初始amount: ${initAmount}`);
    console.log(`   反方amount: ${counterAmount}`);
    console.log(`   最低要求amount: ${minRequiredAmount}`);

    if (counterAmount >= minRequiredAmount) {
      // 达到最低标准，激活事件
      console.log(`   ✅ 达到最低标准，激活事件...`);

      // 动态导入 activateEventAfterMatching 函数
      const { activateEventAfterMatching } = await import('./service.js');
      await activateEventAfterMatching(client, eventId, creatorSide, initAmount, matchingSlide);

      console.log(`   🎉 事件 ${eventId} 已激活！`);
    } else {
      // 未达到最低标准，全额退款并取消事件
      console.log(`   ❌ 未达到最低标准，执行全额退款...`);

      // 获取所有投注记录
      const betsResult = await client.query(
        'SELECT * FROM meme_bets WHERE event_id = $1 AND status = $2',
        [eventId, 'pending']
      );

      // 退款给所有参与者
      for (const bet of betsResult.rows) {
        const betAmount = parseFloat(bet.bet_amount);
        const betAmountInAmount = Math.floor(betAmount * 2);

        // 退款
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [betAmount, bet.user_id]
        );

        // 更新投注状态为 refunded
        await client.query(
          'UPDATE meme_bets SET status = $1 WHERE id = $2',
          ['refunded', bet.id]
        );

        // === AMM 系统同步：清空持仓 ===
        await client.query(
          'DELETE FROM user_positions WHERE event_id = $1 AND user_id = $2',
          [eventId, bet.user_id]
        );

        // 记录 AMM 退款交易
        await client.query(
          `INSERT INTO transactions
           (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
           VALUES ($1, $2, 'refund', $3, $4, $5, 0)`,
          [eventId, bet.user_id, bet.bet_type, -betAmountInAmount, betAmount]
        );

        // 记录退款
        await client.query(
          `INSERT INTO refund_records (bet_id, event_id, user_id, refund_type, refund_reason, refund_amount, original_bet_amount, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            bet.id,
            eventId,
            bet.user_id,
            'timeout_unmatched',
            'Pending match timeout: minimum threshold not reached',
            betAmount,
            betAmount,
            'completed'
          ]
        );

        console.log(`   💸 用户 ${bet.user_id} 获得全额退款: ${betAmount}U`);
      }

      // 更新事件状态为 cancelled
      await client.query(
        'UPDATE meme_events SET status = $1 WHERE id = $2',
        ['cancelled', eventId]
      );

      console.log(`   🚫 事件 ${eventId} 已取消`);
    }

    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`   🔥 处理 pending_match 超时失败:`, error.message);
  } finally {
    client.release();
  }
}

/**
 * 检查并结算所有到期事件
 */
export async function checkAndSettleEvents(): Promise<void> {
  try {
    console.log(`\n⏰ ========== 开始检查待结算事件 ==========`);
    console.log(`   当前时间: ${new Date().toISOString()}`);

    // 1. 查询所有 pending_match 超时的事件
    const pendingMatchResult = await pool.query(
      `SELECT id, created_at, pending_match_timeout
       FROM meme_events
       WHERE status = 'pending_match'
         AND (EXTRACT(EPOCH FROM (NOW() - created_at)) >= pending_match_timeout)
       ORDER BY created_at ASC`
    );

    if (pendingMatchResult.rows.length > 0) {
      console.log(`   ⏱️ 找到 ${pendingMatchResult.rows.length} 个 pending_match 超时事件`);

      for (const event of pendingMatchResult.rows) {
        await handlePendingMatchTimeout(event.id);
      }
    }

    // 2. 查询所有已到达 deadline 的 active 事件
    const result = await pool.query(
      `SELECT id, type, contract_address, deadline
       FROM meme_events
       WHERE status = 'active' AND deadline <= NOW()
       ORDER BY deadline ASC`
    );

    if (result.rows.length === 0) {
      console.log(`   ✅ 没有需要结算的 active 事件\n`);
      return;
    }

    console.log(`   📋 找到 ${result.rows.length} 个待结算 active 事件`);

    // 逐个结算事件
    for (const event of result.rows) {
      // 根据事件类型选择结算方式
      if (event.type === 'Mainstream') {
        console.log(`\n🪙 ========== 自动结算主流币事件 ID: ${event.id} ==========`);
        try {
          await settleMainstreamEvent(event.id);
          console.log(`   🎉 主流币事件 ${event.id} 结算完成！\n`);
        } catch (error: any) {
          console.error(`   🔥 主流币事件 ${event.id} 结算失败:`, error.message);
        }
      } else {
        // Meme事件 (pumpfun, bonk)
        await settleEventAuto(event.id, event.type, event.contract_address);
      }
    }

    console.log(`   ✅ 本轮结算任务完成\n`);
  } catch (error: any) {
    console.error(`   🔥 检查结算事件失败:`, error.message);
  }
}

/**
 * 启动定时任务
 */
export function startAutoSettleJob(): void {
  // 每分钟执行一次
  cron.schedule('* * * * *', async () => {
    await checkAndSettleEvents();
  });

  console.log('🚀 自动结算定时任务已启动 (每分钟执行一次)');
}

export default {
  checkAndSettleEvents,
  startAutoSettleJob,
};
