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
    `INSERT INTO big_coins (symbol, name, contract_address, chain, decimals, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [symbol, name, contract_address, chain, decimals, is_active]
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

    // 根据创建者选择的方向分配初始资金池
    const yesPool = data.creator_side === 'yes' ? data.initial_pool_amount : 0;
    const noPool = data.creator_side === 'no' ? data.initial_pool_amount : 0;

    // 计算deadline
    const deadline = calculateDeadline(data.duration);

    // 创建事件(待匹配状态)
    const result = await client.query(
      `INSERT INTO meme_events
       (creator_id, type, contract_address, big_coin_id, creator_side, initial_pool_amount,
        yes_pool, no_pool, status, deadline, future_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_match', $9, $10)
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
      ]
    );

    const event = result.rows[0];

    // 创建创建者的投注记录
    const odds = calculateOdds(parseFloat(event.yes_pool), parseFloat(event.no_pool));
    const oddsAtBet = data.creator_side === 'yes' ? odds.yes_odds : odds.no_odds;

    await client.query(
      `INSERT INTO meme_bets
       (event_id, user_id, bet_type, bet_amount, odds_at_bet, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [event.id, creatorId, data.creator_side, data.initial_pool_amount, oddsAtBet]
    );

    // 记录初始K线数据
    await EventKlineService.recordOddsSnapshot(event.id);

    await client.query('COMMIT');

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

    // 如果是pending_match状态下的第一笔反向投注,转为active状态
    if (event.status === 'pending_match') {
      await client.query(
        "UPDATE meme_events SET status = 'active' WHERE id = $1",
        [data.event_id]
      );
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

    await client.query('COMMIT');

    // 记录K线数据（事务外执行，避免死锁）
    try {
      await EventKlineService.recordOddsSnapshot(data.event_id);
    } catch (klineError) {
      console.error('K线数据记录失败:', klineError);
      // K线记录失败不影响主流程
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
};
