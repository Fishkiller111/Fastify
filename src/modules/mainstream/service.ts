import pool from '../../config/database.js';
import type {
  BigCoin,
  CreateMainstreamEventRequest,
  MainstreamEventResponse,
  GetBigCoinsQuery,
  AddBigCoinRequest,
} from './types.js';
import type { MemeBet, PlaceBetRequest } from '../meme/types.js';
import EventKlineService from '../kline/service.js';

/**
 * 解析duration字符串并返回毫秒数
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(minutes?|hours?|days?|[mhd])$/i);

  if (!match) {
    throw new Error('无效的duration格式,支持格式: "10minutes", "5hours", "1days", "72h", "45m", "2d"');
  }

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const msPerUnit: Record<string, number> = {
    'minute': 60 * 1000,
    'minutes': 60 * 1000,
    'm': 60 * 1000,
    'hour': 60 * 60 * 1000,
    'hours': 60 * 60 * 1000,
    'h': 60 * 60 * 1000,
    'day': 24 * 60 * 60 * 1000,
    'days': 24 * 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
  };

  return value * msPerUnit[unit];
}

/**
 * 计算deadline时间
 */
function calculateDeadline(duration: string): Date {
  const now = new Date();
  const durationMs = parseDuration(duration);
  return new Date(now.getTime() + durationMs);
}

/**
 * 激活事件并处理退款（当反方投注达到 matching_slide 要求时触发）
 * 如果反方超额，按照从最后投注者开始往前退款
 */
async function activateEventAfterMatching(
  client: any,
  eventId: number,
  creatorSide: string,
  requiredAmount: number,
  initialPoolAmount: number
): Promise<void> {
  // 获取当前事件状态
  const eventResult = await client.query(
    `SELECT yes_pool, no_pool, creator_id FROM meme_events WHERE id = $1`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    return;
  }

  const event = eventResult.rows[0];
  const creatorId = event.creator_id;
  const currentYesPool = parseFloat(event.yes_pool);
  const currentNoPool = parseFloat(event.no_pool);

  // 确定创建者方和反方
  const creatorPool = creatorSide === 'yes' ? currentYesPool : currentNoPool;
  const counterPool = creatorSide === 'yes' ? currentNoPool : currentYesPool;

  console.log(`
  ✅ 匹配成功！即将激活主流币事件 ${eventId}
  创建者方: ${creatorSide}, 初始金额: ${initialPoolAmount}
  反方累计: ${counterPool} / 需求: ${requiredAmount}
  `);

  // 处理超额退款
  const excess = counterPool - requiredAmount;
  
  if (excess > 0) {
    console.log(`💰 反方超额: ${excess}, 需要进行退款处理`);
    
    // 获取反方投注者，按时间倒序
    const counterSide = creatorSide === 'yes' ? 'no' : 'yes';
    const betsResult = await client.query(
      `SELECT id, user_id, bet_amount FROM meme_bets 
       WHERE event_id = $1 AND bet_type = $2 
       ORDER BY created_at DESC`,
      [eventId, counterSide]
    );

    let remainingExcess = excess;
    const bets = betsResult.rows;

    // 从最后一个投注者开始往前退款
    for (let i = 0; i < bets.length && remainingExcess > 0; i++) {
      const bet = bets[i];
      const betAmount = parseFloat(bet.bet_amount);
      const refundAmount = Math.min(betAmount, remainingExcess);

      // 退款给用户
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [refundAmount, bet.user_id]
      );

      // 更新投注状态为已退款
      await client.query(
        'UPDATE meme_bets SET status = $1 WHERE id = $2',
        ['refunded', bet.id]
      );

      // 记录退款到退款记录表
      await client.query(
        `INSERT INTO refund_records (bet_id, event_id, user_id, refund_type, refund_reason, refund_amount, original_bet_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          bet.id,
          eventId,
          bet.user_id,
          'excess_matching',
          'Excess refund from matching slide activation',
          refundAmount,
          betAmount,
          'completed'
        ]
      );

      console.log(`💸 用户 ${bet.user_id} 获得退款: ${refundAmount}`);
      remainingExcess -= refundAmount;
    }

    // 调整反方池子为required_amount
    if (creatorSide === 'yes') {
      await client.query(
        `UPDATE meme_events SET no_pool = $1 WHERE id = $2`,
        [requiredAmount, eventId]
      );
    } else {
      await client.query(
        `UPDATE meme_events SET yes_pool = $1 WHERE id = $2`,
        [requiredAmount, eventId]
      );
    }
  }

  // 调整创建者方的池子为required_amount（保持平衡）
  const creatorExcess = creatorPool - requiredAmount;
  if (creatorExcess > 0) {
    console.log(`💰 创建者超额: ${creatorExcess}, 退款给创建者`);
    
    // 获取创建者的投注记录ID
    const creatorBetResult = await client.query(
      `SELECT id FROM meme_bets WHERE event_id = $1 AND user_id = $2 AND bet_type = $3 LIMIT 1`,
      [eventId, creatorId, creatorSide]
    );

    // 退款给创建者
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [creatorExcess, creatorId]
    );

    // 记录创建者的退款
    if (creatorBetResult.rows.length > 0) {
      const creatorBetId = creatorBetResult.rows[0].id;
      const creatorBetAmount = creatorPool;

      // 更新创建者投注状态为已部分退款
      await client.query(
        'UPDATE meme_bets SET status = $1 WHERE id = $2',
        ['refunded', creatorBetId]
      );

      // 记录创建者的退款
      await client.query(
        `INSERT INTO refund_records (bet_id, event_id, user_id, refund_type, refund_reason, refund_amount, original_bet_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          creatorBetId,
          eventId,
          creatorId,
          'excess_matching',
          'Creator excess refund from matching slide activation',
          creatorExcess,
          creatorBetAmount,
          'completed'
        ]
      );
    }

    // 调整创建者方的池子
    if (creatorSide === 'yes') {
      await client.query(
        `UPDATE meme_events SET yes_pool = $1 WHERE id = $2`,
        [requiredAmount, eventId]
      );
    } else {
      await client.query(
        `UPDATE meme_events SET no_pool = $1 WHERE id = $2`,
        [requiredAmount, eventId]
      );
    }
  }

  // 重新计算赔率
  const updatedEventResult = await client.query(
    `SELECT yes_pool, no_pool FROM meme_events WHERE id = $1`,
    [eventId]
  );

  if (updatedEventResult.rows.length > 0) {
    const updatedEvent = updatedEventResult.rows[0];
    const newYesPool = parseFloat(updatedEvent.yes_pool);
    const newNoPool = parseFloat(updatedEvent.no_pool);
    const newOdds = calculateOdds(newYesPool, newNoPool);

    console.log(`📊 赔率已更新: YES=${newOdds.yes_odds}%, NO=${newOdds.no_odds}%`);

    // 更新事件的赔率
    await client.query(
      `UPDATE meme_events SET yes_odds = $1, no_odds = $2 WHERE id = $3`,
      [newOdds.yes_odds, newOdds.no_odds, eventId]
    );
  }

  // 更新事件状态为active
  await client.query(
    `UPDATE meme_events
     SET status = 'active', launch_time = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [eventId]
  );
}



/**
 * 计算赔率
 */
function calculateOdds(yesPool: number, noPool: number): { yes_odds: number; no_odds: number } {
  const totalPool = yesPool + noPool;

  if (totalPool === 0) {
    return { yes_odds: 50, no_odds: 50 };
  }

  const yes_odds = (noPool / totalPool) * 100;
  const no_odds = (yesPool / totalPool) * 100;

  return {
    yes_odds: parseFloat(yes_odds.toFixed(2)),
    no_odds: parseFloat(no_odds.toFixed(2)),
  };
}

/**
 * 获取所有主流币列表
 */
export async function getBigCoins(query: GetBigCoinsQuery = {}): Promise<BigCoin[]> {
  const { is_active, chain, limit = 100, offset = 0 } = query;

  let sql = 'SELECT * FROM big_coins WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (is_active !== undefined) {
    sql += ` AND is_active = $${paramIndex++}`;
    params.push(is_active);
  }

  if (chain) {
    sql += ` AND chain = $${paramIndex++}`;
    params.push(chain);
  }

  sql += ` ORDER BY id ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * 根据合约地址获取主流币信息
 */
export async function getBigCoinByAddress(contractAddress: string): Promise<BigCoin | null> {
  const result = await pool.query(
    'SELECT * FROM big_coins WHERE contract_address = $1 AND is_active = true',
    [contractAddress]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 根据ID获取主流币信息
 */
export async function getBigCoinById(coinId: number): Promise<BigCoin | null> {
  const result = await pool.query(
    'SELECT * FROM big_coins WHERE id = $1 AND is_active = true',
    [coinId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 添加新的主流币
 */
export async function addBigCoin(data: AddBigCoinRequest): Promise<BigCoin> {
  const {
    symbol,
    name,
    contract_address,
    chain = 'BSC',
    decimals = 18,
    is_active = true,
    icon_url,
  } = data;

  // 检查合约地址是否已存在
  const existing = await pool.query(
    'SELECT id FROM big_coins WHERE contract_address = $1',
    [contract_address]
  );

  if (existing.rows.length > 0) {
    throw new Error('该合约地址已存在');
  }

  // 检查币种代号是否已存在
  const existingSymbol = await pool.query(
    'SELECT id FROM big_coins WHERE symbol = $1',
    [symbol]
  );

  if (existingSymbol.rows.length > 0) {
    throw new Error('该币种代号已存在');
  }

  const result = await pool.query(
    `INSERT INTO big_coins (symbol, name, contract_address, chain, decimals, is_active, icon_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [symbol, name, contract_address, chain, decimals, is_active, icon_url]
  );

  return result.rows[0];
}

/**
 * 创建主流币事件合约
 */
export async function createMainstreamEvent(
  creatorId: number,
  data: CreateMainstreamEventRequest
): Promise<MainstreamEventResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 验证主流币ID
    const bigCoin = await getBigCoinById(data.big_coin_id);
    if (!bigCoin) {
      throw new Error('无效的主流币ID或该币种未激活');
    }

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

    // 验证并设置匹配滑动值（创建者保留的百分比）
    let matchingSlide = data.matching_slide || 50;
    if (matchingSlide < 1 || matchingSlide > 100) {
      throw new Error('matching_slide 必须在1-100之间');
    }

    // 验证并设置待匹配超时时间
    let pendingMatchTimeout = data.pending_match_timeout || 3600;
    if (pendingMatchTimeout < 1 || pendingMatchTimeout > 604800) {
      throw new Error('pending_match_timeout 必须在1-604800秒之间');
    }

    // 根据创建者选择的方向分配初始资金池
    const yesPool = data.creator_side === 'yes' ? data.initial_pool_amount : 0;
    const noPool = data.creator_side === 'no' ? data.initial_pool_amount : 0;

    // 计算deadline
    const deadline = calculateDeadline(data.duration);

    // 创建事件(待匹配状态)
    const result = await client.query(
      `INSERT INTO meme_events
       (creator_id, type, contract_address, big_coin_id, creator_side, initial_pool_amount,
        yes_pool, no_pool, status, deadline, future_price, matching_slide, pending_match_timeout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_match', $9, $10, $11, $12)
       RETURNING *`,
      [
        creatorId,
        data.type,
        bigCoin.contract_address,
        bigCoin.id,
        data.creator_side,
        data.initial_pool_amount,
        yesPool,
        noPool,
        deadline,
        data.future_price,
        matchingSlide,
        pendingMatchTimeout,
      ]
    );

    const event = result.rows[0];

    // 创建创建者的投注记录
    const odds = calculateOdds(parseFloat(event.yes_pool), parseFloat(event.no_pool));
    const oddsAtBet = data.creator_side === 'yes' ? odds.yes_odds : odds.no_odds;

    const betResult = await client.query(
      `INSERT INTO meme_bets
       (event_id, user_id, bet_type, bet_amount, odds_at_bet, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [event.id, creatorId, data.creator_side, data.initial_pool_amount, oddsAtBet]
    );

    const betId = betResult.rows[0].id;

    // 记录初始K线数据
    await EventKlineService.recordOddsSnapshot(event.id);

    await client.query('COMMIT');

    // 记录佣金（如果创建者有邀请人）
    try {
      const { ReferralService } = await import('../referral/service.js');
      await ReferralService.recordCommission(creatorId, betId, data.initial_pool_amount);
    } catch (commissionError) {
      console.error('佣金记录失败:', commissionError);
      // 佣金记录失败不影响创建流程
    }

    // 返回完整事件信息
    return {
      id: event.id,
      creator_id: event.creator_id,
      type: event.type,
      contract_address: event.contract_address,
      big_coin_id: event.big_coin_id,
      big_coin: {
        symbol: bigCoin.symbol,
        name: bigCoin.name,
        chain: bigCoin.chain,
      },
      creator_side: event.creator_side,
      initial_pool_amount: event.initial_pool_amount,
      yes_pool: event.yes_pool,
      no_pool: event.no_pool,
      yes_odds: odds.yes_odds.toString(),
      no_odds: odds.no_odds.toString(),
      total_yes_bets: event.total_yes_bets,
      total_no_bets: event.total_no_bets,
      status: event.status,
      deadline: event.deadline,
      matching_slide: event.matching_slide,
      pending_match_timeout: event.pending_match_timeout,
      created_at: event.created_at,
      settled_at: event.settled_at,
      future_price: event.future_price,
      current_price: event.current_price,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取主流币事件列表
 */
export async function getMainstreamEvents(
  limit: number = 20,
  offset: number = 0
): Promise<MainstreamEventResponse[]> {
  const result = await pool.query(
    `SELECT
      me.*,
      bc.symbol,
      bc.name as coin_name,
      bc.chain
     FROM meme_events me
     INNER JOIN big_coins bc ON me.big_coin_id = bc.id
     WHERE me.type = 'Mainstream'
     ORDER BY me.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows.map((row) => ({
    id: row.id,
    creator_id: row.creator_id,
    type: row.type,
    contract_address: row.contract_address,
    big_coin_id: row.big_coin_id,
    big_coin: {
      symbol: row.symbol,
      name: row.coin_name,
      chain: row.chain,
    },
    creator_side: row.creator_side,
    initial_pool_amount: row.initial_pool_amount,
    yes_pool: row.yes_pool,
    no_pool: row.no_pool,
    yes_odds: row.yes_odds,
    no_odds: row.no_odds,
    total_yes_bets: row.total_yes_bets,
    total_no_bets: row.total_no_bets,
    status: row.status,
    deadline: row.deadline,
    matching_slide: row.matching_slide,
    pending_match_timeout: row.pending_match_timeout,
    created_at: row.created_at,
    settled_at: row.settled_at,
    future_price: row.future_price,
    current_price: row.current_price,
  }));
}

/**
 * 获取单个主流币事件详情
 */
export async function getMainstreamEventById(eventId: number): Promise<MainstreamEventResponse | null> {
  const result = await pool.query(
    `SELECT
      me.*,
      bc.symbol,
      bc.name as coin_name,
      bc.chain
     FROM meme_events me
     INNER JOIN big_coins bc ON me.big_coin_id = bc.id
     WHERE me.id = $1 AND me.type = 'Mainstream'`,
    [eventId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    creator_id: row.creator_id,
    type: row.type,
    contract_address: row.contract_address,
    big_coin_id: row.big_coin_id,
    big_coin: {
      symbol: row.symbol,
      name: row.coin_name,
      chain: row.chain,
    },
    creator_side: row.creator_side,
    initial_pool_amount: row.initial_pool_amount,
    yes_pool: row.yes_pool,
    no_pool: row.no_pool,
    yes_odds: row.yes_odds,
    no_odds: row.no_odds,
    total_yes_bets: row.total_yes_bets,
    total_no_bets: row.total_no_bets,
    status: row.status,
    deadline: row.deadline,
    matching_slide: row.matching_slide,
    pending_match_timeout: row.pending_match_timeout,
    created_at: row.created_at,
    settled_at: row.settled_at,
    future_price: row.future_price,
    current_price: row.current_price,
  };
}

/**
 * 对主流币事件进行投注（复用 meme 模块的投注逻辑）
 */
export async function placeMainstreamBet(
  userId: number,
  data: PlaceBetRequest
): Promise<MemeBet> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 验证事件是否为主流币事件
    const eventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1 AND type = $2 FOR UPDATE',
      [data.event_id, 'Mainstream']
    );

    if (eventResult.rows.length === 0) {
      throw new Error('主流币事件不存在');
    }

    const event = eventResult.rows[0];

    // 其余投注逻辑与 meme 事件相同
    // 检查事件状态
    if (event.status === 'settled' || event.status === 'cancelled') {
      throw new Error('该事件已结束,无法投注');
    }

    if (new Date() > new Date(event.deadline)) {
      throw new Error('该事件已过期');
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

    // pending_match状态下,只允许与创建者相反方向的投注
    if (event.status === 'pending_match' && data.bet_type === event.creator_side) {
      throw new Error('当前只能投注与创建者相反的方向');
    }

    // 扣除用户余额
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [data.bet_amount, userId]
    );

    // 更新事件资金池
    const yesPoolDelta = data.bet_type === 'yes' ? data.bet_amount : 0;
    const noPoolDelta = data.bet_type === 'no' ? data.bet_amount : 0;

    await client.query(
      `UPDATE meme_events
       SET yes_pool = yes_pool + $1,
           no_pool = no_pool + $2,
           total_yes_bets = total_yes_bets + $3,
           total_no_bets = total_no_bets + $4
       WHERE id = $5`,
      [
        yesPoolDelta,
        noPoolDelta,
        data.bet_type === 'yes' ? 1 : 0,
        data.bet_type === 'no' ? 1 : 0,
        data.event_id,
      ]
    );

    // 获取更新后的事件数据
    const updatedEventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1',
      [data.event_id]
    );
    const updatedEvent = updatedEventResult.rows[0];

    // 计算新赔率
    const odds = calculateOdds(
      parseFloat(updatedEvent.yes_pool),
      parseFloat(updatedEvent.no_pool)
    );

    // 更新赔率
    await client.query(
      'UPDATE meme_events SET yes_odds = $1, no_odds = $2 WHERE id = $3',
      [odds.yes_odds, odds.no_odds, data.event_id]
    );

    // 如果是pending_match状态，检查是否满足matching_slide条件，触发激活
    if (event.status === 'pending_match') {
      // 获取matching_slide和initial_pool_amount用于计算
      const requiredAmount = parseFloat(updatedEvent.initial_pool_amount) *
                             (1 - parseFloat(updatedEvent.matching_slide) / 100);

      // 获取反方累计投注金额
      const counterSide = updatedEvent.creator_side === 'yes' ? 'no' : 'yes';
      const counterPool = counterSide === 'yes'
        ? parseFloat(updatedEvent.yes_pool)
        : parseFloat(updatedEvent.no_pool);

      // 检查是否达到匹配条件
      if (counterPool >= requiredAmount) {
        // 满足匹配条件，调用激活函数处理退款和状态转换
        await activateEventAfterMatching(
          client,
          data.event_id,
          updatedEvent.creator_side,
          requiredAmount,
          parseFloat(updatedEvent.initial_pool_amount)
        );
      }
    }

    // 记录投注
    const oddsAtBet = data.bet_type === 'yes' ? odds.yes_odds : odds.no_odds;
    const betResult = await client.query(
      `INSERT INTO meme_bets
       (event_id, user_id, bet_type, bet_amount, odds_at_bet, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [data.event_id, userId, data.bet_type, data.bet_amount, oddsAtBet]
    );

    const betRow = betResult.rows[0];
    const betId = betRow.id;

    await client.query('COMMIT');

    // 记录K线数据（事务外执行，避免死锁）
    try {
      await EventKlineService.recordOddsSnapshot(data.event_id);
    } catch (klineError) {
      console.error('K线数据记录失败:', klineError);
      // K线记录失败不影响主流程
    }

    // 记录买入点（事务外执行，避免影响下注流程）
    try {
      await EventKlineService.recordBuyPoint({
        bet_id: betRow.id,
        event_id: betRow.event_id,
        user_id: betRow.user_id,
        bet_type: betRow.bet_type,
        bet_amount: parseFloat(betRow.bet_amount),
        yes_odds_at_bet: odds.yes_odds,
        no_odds_at_bet: odds.no_odds,
      });
    } catch (buyPointError) {
      console.error('K线买入点记录失败:', buyPointError);
    }

    // 记录佣金（如果用户有邀请人）
    try {
      const { ReferralService } = await import('../referral/service.js');
      await ReferralService.recordCommission(userId, betId, data.bet_amount);
    } catch (commissionError) {
      console.error('佣金记录失败:', commissionError);
      // 佣金记录失败不影响下注流程
    }

    return betResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 从DexScreener API获取BSC链上的代币价格
 */
async function fetchBSCTokenPrice(contractAddress: string): Promise<number | null> {
  console.log(`\n🔍 ========== 开始查询 BSC 代币价格 (DexScreener) ==========`);
  console.log(`   Token 地址: ${contractAddress}`);

  try {
    const https = await import('https');
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const data: string = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    });

    const response = JSON.parse(data);

    if (!response.pairs || response.pairs.length === 0) {
      console.log(`   ⚠️ 未找到交易对信息`);
      return null;
    }

    // 筛选BSC链上的交易对
    const bscPairs = response.pairs.filter((pair: any) =>
      pair.chainId === 'bsc' || pair.chainId === 'binance'
    );

    if (bscPairs.length === 0) {
      console.log(`   ⚠️ 未找到 BSC 链上的交易对`);
      return null;
    }

    // 获取第一个BSC交易对的USD价格
    const priceUsd = parseFloat(bscPairs[0].priceUsd);

    if (isNaN(priceUsd)) {
      console.log(`   ⚠️ 价格数据无效`);
      return null;
    }

    console.log(`   ✅ 查询成功，当前价格: $${priceUsd}`);
    return priceUsd;
  } catch (error: any) {
    console.error(`   ❌ 查询失败:`, error.message);
    return null;
  }
}

/**
 * 结算主流币事件
 */
export async function settleMainstreamEvent(eventId: number): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 获取事件信息
    const eventResult = await client.query(
      'SELECT * FROM meme_events WHERE id = $1 AND type = $2 AND status = $3',
      [eventId, 'Mainstream', 'active']
    );

    if (eventResult.rows.length === 0) {
      throw new Error('主流币事件不存在或状态不正确');
    }

    const event = eventResult.rows[0];

    // 检查是否到达deadline
    if (new Date() < new Date(event.deadline)) {
      throw new Error('未到结算时间');
    }

    if (!event.contract_address) {
      throw new Error('缺少合约地址，无法查询价格');
    }

    if (!event.future_price) {
      throw new Error('缺少目标价格，无法判断结果');
    }

    // 查询当前BSC链上的币价
    console.log(`\n📊 开始查询 BSC 链上的代币价格...`);
    const currentPrice = await fetchBSCTokenPrice(event.contract_address);

    if (currentPrice === null) {
      throw new Error('无法获取当前币价，结算失败');
    }

    console.log(`\n📈 价格对比:`);
    console.log(`   目标价格 (future_price): $${event.future_price}`);
    console.log(`   当前价格 (current_price): $${currentPrice}`);

    // 判断是否达到目标价格
    const isReached = currentPrice >= parseFloat(event.future_price);
    console.log(`   结果: ${isReached ? '✅ 达到目标价格' : '❌ 未达到目标价格'}`);

    // 确定获胜方 (yes = 达到目标价格, no = 未达到目标价格)
    const winnerSide = isReached ? 'yes' : 'no';

    // 更新事件状态和价格
    await client.query(
      `UPDATE meme_events
       SET status = 'settled', current_price = $1, settled_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [currentPrice, eventId]
    );

    // 获取所有获胜的投注
    const winningBets = await client.query(
      'SELECT * FROM meme_bets WHERE event_id = $1 AND bet_type = $2 AND status = $3',
      [eventId, winnerSide, 'pending']
    );

    console.log(`\n💰 开始分配奖金给获胜者 (${winnerSide} 方)...`);
    console.log(`   获胜投注数量: ${winningBets.rows.length}`);

    // 分配奖金给获胜者
    for (const bet of winningBets.rows) {
      const betAmount = parseFloat(bet.bet_amount);
      const oddsAtBet = parseFloat(bet.odds_at_bet);

      // 赔付 = 本金 × (1 + 赔率/100)
      const payout = (betAmount * (1 + oddsAtBet / 100)).toFixed(2);

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

      console.log(`   用户 ${bet.user_id}: 投注 $${betAmount}, 赔付 $${payout}`);

      // 结算对应的佣金
      try {
        const { ReferralService } = await import('../referral/service.js');
        await ReferralService.settleCommission(bet.id);
      } catch (commissionError) {
        console.error(`   佣金结算失败 (bet_id: ${bet.id}):`, commissionError);
        // 佣金结算失败不影响主流程
      }
    }

    // 更新失败的投注
    const loserSide = winnerSide === 'yes' ? 'no' : 'yes';
    await client.query(
      'UPDATE meme_bets SET status = $1 WHERE event_id = $2 AND bet_type = $3 AND status = $4',
      ['lost', eventId, loserSide, 'pending']
    );

    console.log(`\n✅ 主流币事件结算完成`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 删除已结算的Mainstream事件及其关联数据
 * 级联删除: meme_bets, klines
 */
export async function deleteSettledMainstreamEvents(): Promise<{ deletedCount: number; message: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. 查询所有已结算的主流币事件ID
    const settledEventsResult = await client.query(
      `SELECT id FROM meme_events WHERE status = 'settled' AND type = 'Mainstream'`
    );

    const eventIds = settledEventsResult.rows.map(row => row.id);

    if (eventIds.length === 0) {
      await client.query('COMMIT');
      return {
        deletedCount: 0,
        message: '没有找到已结算的主流币事件'
      };
    }

    // 2. 删除相关的投注记录
    await client.query(
      `DELETE FROM meme_bets WHERE event_id = ANY($1)`,
      [eventIds]
    );

    // 3. 删除相关的K线数据
    await client.query(
      `DELETE FROM klines WHERE event_id = ANY($1)`,
      [eventIds]
    );

    // 4. 删除事件记录
    await client.query(
      `DELETE FROM meme_events WHERE id = ANY($1)`,
      [eventIds]
    );

    await client.query('COMMIT');

    return {
      deletedCount: eventIds.length,
      message: `成功删除 ${eventIds.length} 个已结算的主流币事件及其关联数据`
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('删除已结算主流币事件失败:', error);
    throw new Error('删除已结算主流币事件失败: ' + error.message);
  } finally {
    client.release();
  }
}

export default {
  getBigCoins,
  getBigCoinByAddress,
  getBigCoinById,
  addBigCoin,
  createMainstreamEvent,
  getMainstreamEvents,
  getMainstreamEventById,
  placeMainstreamBet,
  settleMainstreamEvent,
  deleteSettledMainstreamEvents,
};
