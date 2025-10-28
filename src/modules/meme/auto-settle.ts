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

    // 获取所有获胜的投注（包括计算退款后的净投注金额）
    const winningBets = await client.query(
      `SELECT 
        mb.*,
        COALESCE(SUM(rr.refund_amount), 0) as total_refund
       FROM meme_bets mb
       LEFT JOIN refund_records rr ON mb.id = rr.bet_id AND rr.status = 'completed'
       WHERE mb.event_id = $1 AND mb.bet_type = $2 AND mb.status = $3
       GROUP BY mb.id`,
      [eventId, winnerSide, 'pending']
    );

    console.log(`   👥 获胜投注数: ${winningBets.rows.length}`);

    // 分配奖金给获胜者
    for (const bet of winningBets.rows) {
      const betAmount = parseFloat(bet.bet_amount);
      const refundAmount = parseFloat(bet.total_refund || 0);
      const netBetAmount = betAmount - refundAmount;  // 净投注金额（已扣除退款）
      const oddsAtBet = parseFloat(bet.odds_at_bet);

      // 赔付 = 净投注金额 × (1 + 赔率/100)
      // 即: 本金 + 利润 = 净投注金额 × (1 + 赔率/100)
      const payout = (netBetAmount * (1 + oddsAtBet / 100)).toFixed(2);

      // 更新投注状态和实际奖金
      await client.query(
        'UPDATE meme_bets SET status = $1, actual_payout = $2 WHERE id = $3',
        ['won', payout, bet.id]
      );

      // 发放奖金给用户
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [payout, bet.user_id]
      );

      // 详细的结算日志（包括退款信息）
      if (refundAmount > 0) {
        console.log(`   ✅ 用户 ${bet.user_id}: 原始投注 $${betAmount}, 退款 $${refundAmount}, 净投注 $${netBetAmount}, 赔付 $${payout}`);
      } else {
        console.log(`   ✅ 用户 ${bet.user_id}: 投注 $${betAmount}, 赔付 $${payout}`);
      }
    }

    // 更新失败的投注
    const loserSide = winnerSide === 'yes' ? 'no' : 'yes';
    const lostBetsResult = await client.query(
      'UPDATE meme_bets SET status = $1 WHERE event_id = $2 AND bet_type = $3 AND status = $4 RETURNING id',
      ['lost', eventId, loserSide, 'pending']
    );

    console.log(`   ❌ 失败投注数: ${lostBetsResult.rows.length}`);

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
 * 检查并结算所有到期事件
 */
export async function checkAndSettleEvents(): Promise<void> {
  try {
    console.log(`\n⏰ ========== 开始检查待结算事件 ==========`);
    console.log(`   当前时间: ${new Date().toISOString()}`);

    // 查询所有已到达 deadline 的 active 事件
    const result = await pool.query(
      `SELECT id, type, contract_address, deadline
       FROM meme_events
       WHERE status = 'active' AND deadline <= NOW()
       ORDER BY deadline ASC`
    );

    if (result.rows.length === 0) {
      console.log(`   ✅ 没有需要结算的事件\n`);
      return;
    }

    console.log(`   📋 找到 ${result.rows.length} 个待结算事件`);

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
