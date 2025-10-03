import pool from '../../config/database.js';
import type {
  MemeEvent,
  MemeBet,
  CreateMemeEventRequest,
  PlaceBetRequest,
  SettleEventRequest,
  GetEventsQuery,
  GetUserBetsQuery,
} from './types.js';
import EventKlineService from '../kline/service.js';

/**
 * 创建Meme事件合约
 */
export async function createMemeEvent(
  creatorId: number,
  data: CreateMemeEventRequest
): Promise<MemeEvent> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 检查创建者余额
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1',
      [creatorId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('用户不存在');
    }

    const userBalance = parseFloat(userResult.rows[0].balance);
    if (userBalance < data.initial_pool_amount) {
      throw new Error('余额不足');
    }

    // 扣除创建者余额
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [data.initial_pool_amount, creatorId]
    );

    // 根据创建者选择的方向分配初始资金池
    const yesPool = data.creator_side === 'yes' ? data.initial_pool_amount : 0;
    const noPool = data.creator_side === 'no' ? data.initial_pool_amount : 0;

    // 创建事件(待匹配状态)
    const result = await client.query(
      `INSERT INTO meme_events
       (creator_id, type, contract_address, creator_side, initial_pool_amount,
        yes_pool, no_pool, status, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_match', $8)
       RETURNING *`,
      [
        creatorId,
        data.type,
        data.contract_address,
        data.creator_side,
        data.initial_pool_amount,
        yesPool,
        noPool,
        data.deadline,
      ]
    );

    await client.query('COMMIT');

    const event = result.rows[0];

    // 记录初始赔率快照
    await EventKlineService.recordOddsSnapshot(event.id);

    return event;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 计算赔率
 */
function calculateOdds(yesPool: number, noPool: number) {
  const totalPool = yesPool + noPool;
  if (totalPool === 0) {
    return { yesOdds: 50, noOdds: 50 };
  }

  // 赔率 = (对方池子 / 总池子) * 100
  const yesOdds = ((noPool / totalPool) * 100).toFixed(2);
  const noOdds = ((yesPool / totalPool) * 100).toFixed(2);

  return {
    yesOdds: parseFloat(yesOdds),
    noOdds: parseFloat(noOdds),
  };
}

/**
 * 用户下注
 */
export async function placeBet(
  userId: number,
  data: PlaceBetRequest
): Promise<MemeBet> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 检查事件是否存在且可下注
    const eventResult = await client.query(
      `SELECT * FROM meme_events
       WHERE id = $1 AND status IN ('pending_match', 'active')`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或已结束');
    }

    const event = eventResult.rows[0];

    // 待匹配状态时,只能下注与创建者相反的方向
    if (event.status === 'pending_match' && data.bet_type === event.creator_side) {
      throw new Error('待匹配状态下只能下注相反方向');
    }

    // 检查用户余额
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('用户不存在');
    }

    const userBalance = parseFloat(userResult.rows[0].balance);
    if (userBalance < data.bet_amount) {
      throw new Error('余额不足');
    }

    // 扣除用户余额
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [data.bet_amount, userId]
    );

    // 更新事件池子
    const poolField = data.bet_type === 'yes' ? 'yes_pool' : 'no_pool';
    const counterField = data.bet_type === 'yes' ? 'total_yes_bets' : 'total_no_bets';

    await client.query(
      `UPDATE meme_events
       SET ${poolField} = ${poolField} + $1,
           ${counterField} = ${counterField} + 1
       WHERE id = $2`,
      [data.bet_amount, data.event_id]
    );

    // 获取更新后的事件信息
    const updatedEvent = await client.query(
      'SELECT yes_pool, no_pool, status, creator_side FROM meme_events WHERE id = $1',
      [data.event_id]
    );

    const { yes_pool, no_pool, status, creator_side } = updatedEvent.rows[0];
    const odds = calculateOdds(parseFloat(yes_pool), parseFloat(no_pool));

    // 如果是待匹配状态且对方池子已有资金,则激活事件
    if (status === 'pending_match') {
      const oppositePool = creator_side === 'yes' ? parseFloat(no_pool) : parseFloat(yes_pool);
      if (oppositePool > 0) {
        await client.query(
          `UPDATE meme_events
           SET status = 'active', launch_time = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [data.event_id]
        );
      }
    }

    // 更新赔率
    await client.query(
      `UPDATE meme_events
       SET yes_odds = $1, no_odds = $2
       WHERE id = $3`,
      [odds.yesOdds, odds.noOdds, data.event_id]
    );

    // 创建投注记录
    const currentOdds = data.bet_type === 'yes' ? odds.yesOdds : odds.noOdds;
    const potentialPayout = (data.bet_amount * (currentOdds / 100)).toFixed(2);

    const betResult = await client.query(
      `INSERT INTO meme_bets
       (event_id, user_id, bet_type, bet_amount, odds_at_bet, potential_payout, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [data.event_id, userId, data.bet_type, data.bet_amount, currentOdds, potentialPayout]
    );

    await client.query('COMMIT');

    // 记录赔率快照
    await EventKlineService.recordOddsSnapshot(data.event_id);

    return betResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 结算事件
 */
export async function settleEvent(data: SettleEventRequest): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 获取事件信息
    const eventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1 AND status = $2',
      [data.event_id, 'active']
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或状态不正确');
    }

    const event = eventResult.rows[0];

    // 检查是否到达deadline
    if (new Date() < new Date(event.deadline)) {
      throw new Error('未到结算时间');
    }

    // 确定获胜方
    const winnerSide = data.is_launched ? 'yes' : 'no';
    const totalPool = parseFloat(event.yes_pool) + parseFloat(event.no_pool);
    const winnerPool = parseFloat(winnerSide === 'yes' ? event.yes_pool : event.no_pool);

    // 更新事件状态
    await client.query(
      `UPDATE meme_events
       SET status = 'settled', is_launched = $1, settled_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [data.is_launched, data.event_id]
    );

    // 获取所有获胜的投注
    const winningBets = await client.query(
      'SELECT * FROM meme_bets WHERE event_id = $1 AND bet_type = $2 AND status = $3',
      [data.event_id, winnerSide, 'pending']
    );

    // 分配奖金给获胜者
    for (const bet of winningBets.rows) {
      const betAmount = parseFloat(bet.bet_amount);
      const userShare = betAmount / winnerPool;
      const payout = (userShare * totalPool).toFixed(2);

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
    }

    // 更新失败的投注
    const loserSide = winnerSide === 'yes' ? 'no' : 'yes';
    await client.query(
      'UPDATE meme_bets SET status = $1 WHERE event_id = $2 AND bet_type = $3 AND status = $4',
      ['lost', data.event_id, loserSide, 'pending']
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取事件列表
 */
export async function getEvents(query: GetEventsQuery): Promise<MemeEvent[]> {
  const { status, type, limit = 20, offset = 0 } = query;

  const conditions = [];
  const params: any[] = [];
  let paramCount = 1;

  if (status) {
    conditions.push(`status = $${paramCount++}`);
    params.push(status);
  }

  if (type) {
    conditions.push(`type = $${paramCount++}`);
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT * FROM meme_events
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, limit, offset]
  );

  return result.rows;
}

/**
 * 根据ID获取事件
 */
export async function getEventById(eventId: number): Promise<MemeEvent | null> {
  const result = await pool.query(
    'SELECT * FROM meme_events WHERE id = $1',
    [eventId]
  );

  return result.rows[0] || null;
}

/**
 * 获取用户投注历史
 */
export async function getUserBets(query: GetUserBetsQuery): Promise<MemeBet[]> {
  const { user_id, event_id, status, limit = 20, offset = 0 } = query;

  const conditions = [];
  const params: any[] = [];
  let paramCount = 1;

  if (user_id) {
    conditions.push(`user_id = $${paramCount++}`);
    params.push(user_id);
  }

  if (event_id) {
    conditions.push(`event_id = $${paramCount++}`);
    params.push(event_id);
  }

  if (status) {
    conditions.push(`status = $${paramCount++}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT * FROM meme_bets
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, limit, offset]
  );

  return result.rows;
}

export default {
  createMemeEvent,
  placeBet,
  settleEvent,
  getEvents,
  getEventById,
  getUserBets,
};
