/**
 * AMM (自动做市商) 服务
 *
 * 核心定价机制:
 * - 1 amount 价格 = 1 × odds
 * - 例如: yes_odds = 80% → 1 YES amount = 0.8U
 * - 买入会推高本方 odds，卖出会降低本方 odds
 */

import pool from '../../config/database.js';
import type {
  BuyAmountRequest,
  BuyAmountResponse,
  SellAmountRequest,
  SellAmountResponse,
  CalculateBuyRequest,
  CalculateBuyResponse,
  CalculateSellRequest,
  CalculateSellResponse,
  UserPosition,
  Transaction,
} from './amm-types.js';

/**
 * 计算当前 amount 价格
 * 价格 = odds (例如: 80% → 0.8U)
 */
function calculateAmountPrice(odds: number): number {
  return odds / 100;
}

/**
 * 计算买入能获得多少 amount
 *
 * 简化版 AMM (恒定乘积):
 * - 当前价格 = odds / 100
 * - amount = spend / currentPrice
 *
 * @param spendAmount 花费金额
 * @param currentOdds 当前赔率
 * @returns 购买到的 amount 数量
 */
export function calculateBuyAmount(
  spendAmount: number,
  currentOdds: number
): number {
  const price = calculateAmountPrice(currentOdds);
  return Math.floor(spendAmount / price);
}

/**
 * 计算卖出能获得多少金额
 *
 * @param amountToSell 要卖出的份额
 * @param currentOdds 当前赔率
 * @returns 卖出收益
 */
export function calculateSellReturn(
  amountToSell: number,
  currentOdds: number
): number {
  const price = calculateAmountPrice(currentOdds);
  return amountToSell * price;
}

/**
 * 买入 amount (从用户视角)
 */
export async function buyAmount(
  userId: number,
  data: BuyAmountRequest
): Promise<BuyAmountResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 获取事件当前状态
    const eventResult = await client.query(
      `SELECT id, type, status, yes_pool, no_pool, yes_amount, no_amount, yes_odds, no_odds
       FROM meme_events
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或未激活');
    }

    const event = eventResult.rows[0];
    const currentOdds =
      data.side === 'yes'
        ? parseFloat(event.yes_odds)
        : parseFloat(event.no_odds);

    // 2. 计算能买入多少 amount
    const amountToBuy = calculateBuyAmount(data.spend_amount, currentOdds);

    if (amountToBuy <= 0) {
      throw new Error('购买金额太小，无法购买份额');
    }

    // 3. 更新事件池子和 amount
    const yesPoolDelta = data.side === 'yes' ? data.spend_amount : 0;
    const noPoolDelta = data.side === 'no' ? data.spend_amount : 0;
    const yesAmountDelta = data.side === 'yes' ? amountToBuy : 0;
    const noAmountDelta = data.side === 'no' ? amountToBuy : 0;

    await client.query(
      `UPDATE meme_events
       SET yes_pool = yes_pool + $1,
           no_pool = no_pool + $2,
           yes_amount = yes_amount + $3,
           no_amount = no_amount + $4
       WHERE id = $5`,
      [yesPoolDelta, noPoolDelta, yesAmountDelta, noAmountDelta, data.event_id]
    );

    // 4. 重新计算 odds
    const updatedEvent = await client.query(
      `SELECT yes_pool, no_pool FROM meme_events WHERE id = $1`,
      [data.event_id]
    );
    const { yes_pool, no_pool } = updatedEvent.rows[0];
    const totalPool = parseFloat(yes_pool) + parseFloat(no_pool);
    const newYesOdds = (parseFloat(yes_pool) / totalPool) * 100;
    const newNoOdds = (parseFloat(no_pool) / totalPool) * 100;

    await client.query(
      `UPDATE meme_events
       SET yes_odds = $1, no_odds = $2
       WHERE id = $3`,
      [newYesOdds.toFixed(2), newNoOdds.toFixed(2), data.event_id]
    );

    // 5. 扣除用户余额
    await client.query(
      `UPDATE users SET balance = balance - $1 WHERE id = $2`,
      [data.spend_amount, userId]
    );

    // 6. 创建交易记录
    const transactionResult = await client.query(
      `INSERT INTO transactions
       (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
       VALUES ($1, $2, 'buy', $3, $4, $5, $6)
       RETURNING *`,
      [
        data.event_id,
        userId,
        data.side,
        amountToBuy,
        data.spend_amount,
        currentOdds,
      ]
    );

    // 7. 更新或创建用户持仓
    const positionResult = await client.query(
      `INSERT INTO user_positions (event_id, user_id, yes_amount, no_amount, total_invested)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, user_id)
       DO UPDATE SET
         yes_amount = user_positions.yes_amount + $3,
         no_amount = user_positions.no_amount + $4,
         total_invested = user_positions.total_invested + $5,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        data.event_id,
        userId,
        yesAmountDelta,
        noAmountDelta,
        data.spend_amount,
      ]
    );

    await client.query('COMMIT');

    const position = positionResult.rows[0];
    const transaction = transactionResult.rows[0];

    return {
      transaction_id: transaction.id,
      event_id: data.event_id,
      side: data.side,
      amount_purchased: amountToBuy,
      cost: data.spend_amount.toString(),
      current_odds: (data.side === 'yes' ? newYesOdds : newNoOdds).toFixed(2),
      average_price: (data.spend_amount / amountToBuy).toFixed(4),
      position: {
        id: position.id,
        event_id: position.event_id,
        user_id: position.user_id,
        yes_amount: position.yes_amount,
        no_amount: position.no_amount,
        total_invested: position.total_invested,
        total_returned: position.total_returned,
        created_at: position.created_at,
        updated_at: position.updated_at,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 卖出 amount (从用户视角)
 */
export async function sellAmount(
  userId: number,
  data: SellAmountRequest
): Promise<SellAmountResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 检查用户持仓
    const positionResult = await client.query(
      `SELECT * FROM user_positions
       WHERE event_id = $1 AND user_id = $2
       FOR UPDATE`,
      [data.event_id, userId]
    );

    if (positionResult.rows.length === 0) {
      throw new Error('未找到持仓记录');
    }

    const position = positionResult.rows[0];
    const currentHolding =
      data.side === 'yes' ? position.yes_amount : position.no_amount;

    if (currentHolding < data.amount_to_sell) {
      throw new Error(
        `持仓不足: 当前持有 ${currentHolding}, 尝试卖出 ${data.amount_to_sell}`
      );
    }

    // 2. 获取事件当前赔率
    const eventResult = await client.query(
      `SELECT yes_odds, no_odds, yes_pool, no_pool, yes_amount, no_amount
       FROM meme_events
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在或未激活');
    }

    const event = eventResult.rows[0];
    const currentOdds =
      data.side === 'yes'
        ? parseFloat(event.yes_odds)
        : parseFloat(event.no_odds);

    // 3. 计算卖出收益
    const returnAmount = calculateSellReturn(data.amount_to_sell, currentOdds);

    // 4. 更新事件池子和 amount (减少)
    const yesPoolDelta = data.side === 'yes' ? -returnAmount : 0;
    const noPoolDelta = data.side === 'no' ? -returnAmount : 0;
    const yesAmountDelta = data.side === 'yes' ? -data.amount_to_sell : 0;
    const noAmountDelta = data.side === 'no' ? -data.amount_to_sell : 0;

    await client.query(
      `UPDATE meme_events
       SET yes_pool = yes_pool + $1,
           no_pool = no_pool + $2,
           yes_amount = yes_amount + $3,
           no_amount = no_amount + $4
       WHERE id = $5`,
      [yesPoolDelta, noPoolDelta, yesAmountDelta, noAmountDelta, data.event_id]
    );

    // 5. 重新计算 odds
    const updatedEvent = await client.query(
      `SELECT yes_pool, no_pool FROM meme_events WHERE id = $1`,
      [data.event_id]
    );
    const { yes_pool, no_pool } = updatedEvent.rows[0];
    const totalPool = parseFloat(yes_pool) + parseFloat(no_pool);
    const newYesOdds = (parseFloat(yes_pool) / totalPool) * 100;
    const newNoOdds = (parseFloat(no_pool) / totalPool) * 100;

    await client.query(
      `UPDATE meme_events
       SET yes_odds = $1, no_odds = $2
       WHERE id = $3`,
      [newYesOdds.toFixed(2), newNoOdds.toFixed(2), data.event_id]
    );

    // 6. 增加用户余额
    await client.query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2`,
      [returnAmount, userId]
    );

    // 7. 创建交易记录
    const transactionResult = await client.query(
      `INSERT INTO transactions
       (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
       VALUES ($1, $2, 'sell', $3, $4, $5, $6)
       RETURNING *`,
      [
        data.event_id,
        userId,
        data.side,
        -data.amount_to_sell,
        returnAmount,
        currentOdds,
      ]
    );

    // 8. 更新用户持仓
    const updatedPosition = await client.query(
      `UPDATE user_positions
       SET yes_amount = yes_amount + $1,
           no_amount = no_amount + $2,
           total_returned = total_returned + $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $4 AND user_id = $5
       RETURNING *`,
      [yesAmountDelta, noAmountDelta, returnAmount, data.event_id, userId]
    );

    await client.query('COMMIT');

    const newPosition = updatedPosition.rows[0];
    const transaction = transactionResult.rows[0];

    return {
      transaction_id: transaction.id,
      event_id: data.event_id,
      side: data.side,
      amount_sold: data.amount_to_sell,
      return_amount: returnAmount.toFixed(18),
      current_odds: (data.side === 'yes' ? newYesOdds : newNoOdds).toFixed(2),
      average_price: (returnAmount / data.amount_to_sell).toFixed(4),
      position: {
        id: newPosition.id,
        event_id: newPosition.event_id,
        user_id: newPosition.user_id,
        yes_amount: newPosition.yes_amount,
        no_amount: newPosition.no_amount,
        total_invested: newPosition.total_invested,
        total_returned: newPosition.total_returned,
        created_at: newPosition.created_at,
        updated_at: newPosition.updated_at,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 计算买入预览 (不执行交易)
 */
export async function calculateBuy(
  data: CalculateBuyRequest
): Promise<CalculateBuyResponse> {
  const client = await pool.connect();

  try {
    const eventResult = await client.query(
      `SELECT yes_odds, no_odds FROM meme_events WHERE id = $1`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在');
    }

    const event = eventResult.rows[0];
    const currentOdds =
      data.side === 'yes'
        ? parseFloat(event.yes_odds)
        : parseFloat(event.no_odds);

    const amountToReceive = calculateBuyAmount(data.spend_amount, currentOdds);
    const averagePrice = data.spend_amount / amountToReceive;

    return {
      amount_to_receive: amountToReceive,
      average_price: averagePrice.toFixed(4),
      current_odds: currentOdds.toFixed(2),
      price_impact: '0.00', // 简化版暂不计算价格影响
    };
  } finally {
    client.release();
  }
}

/**
 * 计算卖出预览 (不执行交易)
 */
export async function calculateSell(
  data: CalculateSellRequest
): Promise<CalculateSellResponse> {
  const client = await pool.connect();

  try {
    const eventResult = await client.query(
      `SELECT yes_odds, no_odds FROM meme_events WHERE id = $1`,
      [data.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('事件不存在');
    }

    const event = eventResult.rows[0];
    const currentOdds =
      data.side === 'yes'
        ? parseFloat(event.yes_odds)
        : parseFloat(event.no_odds);

    const returnAmount = calculateSellReturn(data.amount_to_sell, currentOdds);
    const averagePrice = returnAmount / data.amount_to_sell;

    return {
      return_amount: returnAmount.toFixed(18),
      average_price: averagePrice.toFixed(4),
      current_odds: currentOdds.toFixed(2),
      price_impact: '0.00', // 简化版暂不计算价格影响
    };
  } finally {
    client.release();
  }
}

/**
 * 获取用户持仓
 */
export async function getUserPosition(
  userId: number,
  eventId: number
): Promise<UserPosition | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM user_positions WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      event_id: row.event_id,
      user_id: row.user_id,
      yes_amount: row.yes_amount,
      no_amount: row.no_amount,
      total_invested: row.total_invested,
      total_returned: row.total_returned,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } finally {
    client.release();
  }
}

/**
 * 获取用户所有持仓（包含事件详情）
 */
export async function getUserPositions(
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT
         up.*,
         me.type as event_type,
         me.contract_address,
         me.token_name,
         me.status as event_status,
         me.yes_pool,
         me.no_pool,
         me.yes_odds,
         me.no_odds,
         me.deadline,
         me.settled_at,
         me.creator_side,
         me.big_coin_id,
         me.future_price,
         me.current_price,
         bc.symbol as big_coin_symbol,
         bc.name as big_coin_name,
         bc.icon_url as big_coin_icon_url
       FROM user_positions up
       INNER JOIN meme_events me ON up.event_id = me.id
       LEFT JOIN big_coins bc ON me.big_coin_id = bc.id
       WHERE up.user_id = $1
       ORDER BY up.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows.map((row) => ({
      // 持仓信息
      id: row.id,
      event_id: row.event_id,
      user_id: row.user_id,
      yes_amount: row.yes_amount,
      no_amount: row.no_amount,
      total_invested: row.total_invested,
      total_returned: row.total_returned,
      created_at: row.created_at,
      updated_at: row.updated_at,

      // 事件信息
      event: {
        type: row.event_type,
        contract_address: row.contract_address,
        token_name: row.token_name,
        status: row.event_status,
        yes_pool: row.yes_pool,
        no_pool: row.no_pool,
        yes_odds: row.yes_odds,
        no_odds: row.no_odds,
        deadline: row.deadline,
        settled_at: row.settled_at,
        creator_side: row.creator_side,

        // Mainstream 专用字段
        ...(row.event_type === 'Mainstream' && {
          big_coin: {
            id: row.big_coin_id,
            symbol: row.big_coin_symbol,
            name: row.big_coin_name,
            icon_url: row.big_coin_icon_url,
          },
          future_price: row.future_price,
          current_price: row.current_price,
        }),
      },
    }));
  } finally {
    client.release();
  }
}

/**
 * 结算时强制卖出所有持仓
 * 在事件结算前调用，按当前赔率强制卖出所有用户的持仓
 *
 * @param client 数据库客户端 (需要在事务中调用)
 * @param eventId 事件ID
 * @returns 结算的持仓数量
 */
export async function settleAllPositions(
  client: any,
  eventId: number
): Promise<number> {
  // 1. 获取事件当前赔率
  const eventResult = await client.query(
    `SELECT yes_odds, no_odds FROM meme_events WHERE id = $1`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    throw new Error('事件不存在');
  }

  const event = eventResult.rows[0];
  const yesOdds = parseFloat(event.yes_odds);
  const noOdds = parseFloat(event.no_odds);

  // 2. 获取所有持仓
  const positionsResult = await client.query(
    `SELECT * FROM user_positions
     WHERE event_id = $1
     AND (yes_amount > 0 OR no_amount > 0)`,
    [eventId]
  );

  console.log(`\n🔄 开始结算 ${positionsResult.rows.length} 个用户持仓...`);

  let settledCount = 0;

  // 3. 逐个结算持仓
  for (const position of positionsResult.rows) {
    let totalReturn = 0;

    // 3.1 卖出 YES 持仓
    if (position.yes_amount > 0) {
      const yesReturn = calculateSellReturn(position.yes_amount, yesOdds);
      totalReturn += yesReturn;

      // 创建卖出交易记录
      await client.query(
        `INSERT INTO transactions
         (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
         VALUES ($1, $2, 'settle', 'yes', $3, $4, $5)`,
        [eventId, position.user_id, -position.yes_amount, yesReturn, yesOdds]
      );

      console.log(
        `   用户 ${position.user_id}: 卖出 ${position.yes_amount} YES @ ${yesOdds}% = ${yesReturn.toFixed(4)}U`
      );
    }

    // 3.2 卖出 NO 持仓
    if (position.no_amount > 0) {
      const noReturn = calculateSellReturn(position.no_amount, noOdds);
      totalReturn += noReturn;

      // 创建卖出交易记录
      await client.query(
        `INSERT INTO transactions
         (event_id, user_id, transaction_type, side, amount_delta, cost_or_return, odds_at_transaction)
         VALUES ($1, $2, 'settle', 'no', $3, $4, $5)`,
        [eventId, position.user_id, -position.no_amount, noReturn, noOdds]
      );

      console.log(
        `   用户 ${position.user_id}: 卖出 ${position.no_amount} NO @ ${noOdds}% = ${noReturn.toFixed(4)}U`
      );
    }

    // 3.3 增加用户余额
    await client.query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2`,
      [totalReturn, position.user_id]
    );

    // 3.4 更新持仓为已清空
    await client.query(
      `UPDATE user_positions
       SET yes_amount = 0,
           no_amount = 0,
           total_returned = total_returned + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [totalReturn, position.id]
    );

    settledCount++;
  }

  console.log(`✅ 完成 ${settledCount} 个持仓的结算\n`);

  return settledCount;
}

/**
 * 获取交易历史
 */
export async function getTransactions(
  userId: number,
  eventId?: number,
  limit: number = 50,
  offset: number = 0
): Promise<Transaction[]> {
  const client = await pool.connect();

  try {
    const query = eventId
      ? `SELECT * FROM transactions
         WHERE user_id = $1 AND event_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`
      : `SELECT * FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`;

    const params = eventId
      ? [userId, eventId, limit, offset]
      : [userId, limit, offset];

    const result = await client.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      user_id: row.user_id,
      transaction_type: row.transaction_type,
      side: row.side,
      amount_delta: row.amount_delta,
      cost_or_return: row.cost_or_return,
      odds_at_transaction: row.odds_at_transaction,
      created_at: row.created_at,
    }));
  } finally {
    client.release();
  }
}

/**
 * 获取某事件的全部持仓（持仓人列表，公共接口使用）
 */
export async function getEventHolders(
  eventId: number,
  limit: number = 100,
  offset: number = 0
): Promise<
  Array<{
    user_id: number;
    username: string;
    wallet_address: string | null;
    yes_amount: number;
    no_amount: number;
    total_invested: string;
    total_returned: string;
    created_at: Date;
    updated_at: Date;
  }>
> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
         up.user_id,
         u.username,
         u.wallet_address,
         up.yes_amount,
         up.no_amount,
         up.total_invested,
         up.total_returned,
         up.created_at,
         up.updated_at
       FROM user_positions up
       INNER JOIN users u ON up.user_id = u.id
       WHERE up.event_id = $1
         AND (up.yes_amount > 0 OR up.no_amount > 0)
       ORDER BY (up.yes_amount + up.no_amount) DESC, up.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );

    return result.rows.map((row) => ({
      user_id: row.user_id,
      username: row.username,
      wallet_address: row.wallet_address ?? null,
      yes_amount: parseInt(row.yes_amount),
      no_amount: parseInt(row.no_amount),
      total_invested: row.total_invested,
      total_returned: row.total_returned,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } finally {
    client.release();
  }
}
