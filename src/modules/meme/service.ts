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

    // 创建事件
    const result = await client.query(
      `INSERT INTO meme_events 
       (creator_id, type, contract_address, initial_pool_amount, yes_pool, no_pool)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        creatorId,
        data.type,
        data.contract_address || null,
        data.initial_pool_amount,
        data.initial_pool_amount / 2,
        data.initial_pool_amount / 2,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
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

    // 检查事件状态
    const eventResult = await client.query(
      `SELECT * FROM meme_events WHERE id = $1 AND status = 'active'`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或已结束');
    }

    const event = eventResult.rows[0];

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

    // 更新池子和计算新赔率
    let newYesPool = parseFloat(event.yes_pool);
    let newNoPool = parseFloat(event.no_pool);
    let totalYesBets = event.total_yes_bets;
    let totalNoBets = event.total_no_bets;

    if (data.bet_type === 'yes') {
      newYesPool += data.bet_amount;
      totalYesBets += 1;
    } else {
      newNoPool += data.bet_amount;
      totalNoBets += 1;
    }

    const { yesOdds, noOdds } = calculateOdds(newYesPool, newNoPool);

    // 当前赔率
    const currentOdds =
      data.bet_type === 'yes' ? parseFloat(event.yes_odds) : parseFloat(event.no_odds);

    // 计算潜在收益
    const potentialPayout = (data.bet_amount * currentOdds) / 100;

    // 更新事件
    await client.query(
      `UPDATE meme_events 
       SET yes_pool = $1, no_pool = $2, 
           yes_odds = $3, no_odds = $4,
           total_yes_bets = $5, total_no_bets = $6
       WHERE id = $7`,
      [newYesPool, newNoPool, yesOdds, noOdds, totalYesBets, totalNoBets, data.event_id]
    );

    // 创建投注记录
    const betResult = await client.query(
      `INSERT INTO meme_bets 
       (event_id, user_id, bet_type, bet_amount, odds_at_bet, potential_payout)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.event_id, userId, data.bet_type, data.bet_amount, currentOdds, potentialPayout]
    );

    await client.query('COMMIT');
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
export async function settleEvent(data: SettleEventRequest): Promise<MemeEvent> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 获取事件信息
    const eventResult = await client.query(
      `SELECT * FROM meme_events WHERE id = $1 AND status = 'active'`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或已结束');
    }

    const event = eventResult.rows[0];

    // 更新事件状态
    await client.query(
      `UPDATE meme_events 
       SET is_launched = $1, status = 'settled', settled_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [data.is_launched, data.event_id]
    );

    // 获取所有投注记录
    const betsResult = await client.query(
      `SELECT * FROM meme_bets WHERE event_id = $1 AND status = 'pending'`,
      [data.event_id]
    );

    // 结算投注
    const winningBetType = data.is_launched ? 'yes' : 'no';

    for (const bet of betsResult.rows) {
      if (bet.bet_type === winningBetType) {
        // 赢家 - 计算收益并返还本金
        const payout = parseFloat(bet.potential_payout) + parseFloat(bet.bet_amount);

        await client.query(
          `UPDATE meme_bets 
           SET status = 'won', actual_payout = $1
           WHERE id = $2`,
          [payout, bet.id]
        );

        // 增加用户余额
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [payout, bet.user_id]
        );
      } else {
        // 输家
        await client.query(
          `UPDATE meme_bets SET status = 'lost' WHERE id = $1`,
          [bet.id]
        );
      }
    }

    // 返还创建者的初始资金（如果有余额）
    const totalPayout = betsResult.rows
      .filter((bet) => bet.bet_type === winningBetType)
      .reduce((sum, bet) => sum + parseFloat(bet.potential_payout) + parseFloat(bet.bet_amount), 0);

    const totalPool = parseFloat(event.yes_pool) + parseFloat(event.no_pool);
    const remainingPool = totalPool - totalPayout;

    if (remainingPool > 0) {
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [remainingPool, event.creator_id]
      );
    }

    await client.query('COMMIT');

    const updatedEvent = await client.query(
      'SELECT * FROM meme_events WHERE id = $1',
      [data.event_id]
    );

    return updatedEvent.rows[0];
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

  let sql = 'SELECT * FROM meme_events WHERE 1=1';
  const params: any[] = [];
  let paramCount = 0;

  if (status) {
    params.push(status);
    sql += ` AND status = $${++paramCount}`;
  }

  if (type) {
    params.push(type);
    sql += ` AND type = $${++paramCount}`;
  }

  params.push(limit, offset);
  sql += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;

  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * 获取单个事件详情
 */
export async function getEventById(eventId: number): Promise<MemeEvent | null> {
  const result = await pool.query('SELECT * FROM meme_events WHERE id = $1', [eventId]);
  return result.rows[0] || null;
}

/**
 * 获取用户投注历史
 */
export async function getUserBets(query: GetUserBetsQuery): Promise<MemeBet[]> {
  const { user_id, event_id, status, limit = 20, offset = 0 } = query;

  let sql = 'SELECT * FROM meme_bets WHERE 1=1';
  const params: any[] = [];
  let paramCount = 0;

  if (user_id) {
    params.push(user_id);
    sql += ` AND user_id = $${++paramCount}`;
  }

  if (event_id) {
    params.push(event_id);
    sql += ` AND event_id = $${++paramCount}`;
  }

  if (status) {
    params.push(status);
    sql += ` AND status = $${++paramCount}`;
  }

  params.push(limit, offset);
  sql += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;

  const result = await pool.query(sql, params);
  return result.rows;
}
