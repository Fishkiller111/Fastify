import pool from '../../config/database.js';

export interface WaitingEventOverview {
  id: number;
  type: string;
  contract_address?: string | null;
  token_name?: string | null;
  creator_username: string;
  creator_side: 'yes' | 'no';
  status: 'waiting';
  initial_pool_amount: string;
  initial_amount: number;
  matching_slide: number | null;
  pending_match_timeout: number | null;
  yes_pool: string;
  no_pool: string;
  yes_amount: number;
  no_amount: number;
  yes_odds: string;
  no_odds: string;
  created_at: Date;
  deadline: Date;
  // Mainstream extra
  big_coin?: {
    id: number;
    symbol: string;
    name: string;
    icon_url?: string | null;
  } | null;
  predicted_price: string | null; // Mainstream 的预测价格
  // Derived fields for waiting page
  min_required_amount: number | null;
  counter_amount: number | null;
  progress: number | null; // 0-1
  seconds_remaining: number | null;
  waiting_total_seconds: number | null; // pending_match_timeout
  waiting_elapsed_seconds: number | null; // 已等待秒数
  waiting_end_time: string | null; // 匹配截止时间 ISO
}

export async function getWaitingEvents(limit = 50, offset = 0): Promise<WaitingEventOverview[]> {
  const client = await pool.connect();
  try {
    // 先处理已超时但未处理的 pending_match 事件，确保 waiting 列表实时反映状态
    await processTimedOutPendingMatches();

    const sql = `
      SELECT me.*, 
             u.username AS creator_username,
             bc.symbol AS big_coin_symbol, 
             bc.name AS big_coin_name, 
             bc.icon_url AS big_coin_icon_url
      FROM meme_events me
      LEFT JOIN users u ON me.creator_id = u.id
      LEFT JOIN big_coins bc ON me.big_coin_id = bc.id
      WHERE me.status = 'pending_match'
      ORDER BY me.created_at ASC
      LIMIT $1 OFFSET $2
    `;
    const res = await client.query(sql, [limit, offset]);

    const now = Date.now();

    return res.rows.map((e: any) => {
      const initialAmount = e.initial_amount ?? null;
      const matchingSlide: number | null = e.matching_slide != null ? Number(e.matching_slide) : null;
      const creatorSide: 'yes' | 'no' = e.creator_side;
      const counterAmount: number | null = initialAmount != null
        ? (creatorSide === 'yes' ? Number(e.no_amount) : Number(e.yes_amount))
        : null;
      const minRequiredAmount: number | null = (initialAmount != null && matchingSlide != null)
        ? Math.floor(initialAmount * (1 - matchingSlide / 100))
        : null;
      const progress: number | null = (minRequiredAmount && counterAmount != null && minRequiredAmount > 0)
        ? Math.min(1, Number((counterAmount / minRequiredAmount).toFixed(4)))
        : null;

      const createdAtMs = e.created_at ? new Date(e.created_at).getTime() : null;
      const timeoutSec = e.pending_match_timeout != null ? Number(e.pending_match_timeout) : null;
      const secondsRemaining = (createdAtMs != null && timeoutSec != null)
        ? Math.max(0, Math.floor((createdAtMs + timeoutSec * 1000 - now) / 1000))
        : null;
      const elapsedSeconds = (createdAtMs != null)
        ? Math.max(0, Math.floor((now - createdAtMs) / 1000))
        : null;
      const waitingEndTime = (createdAtMs != null && timeoutSec != null)
        ? new Date(createdAtMs + timeoutSec * 1000).toISOString()
        : null;

      return {
        id: e.id,
        type: e.type,
        contract_address: e.contract_address,
        token_name: e.token_name ?? null,
        creator_username: e.creator_username || '',
        creator_side: creatorSide,
        status: 'waiting',
        initial_pool_amount: e.initial_pool_amount,
        initial_amount: e.initial_amount,
        matching_slide: matchingSlide,
        pending_match_timeout: timeoutSec,
        yes_pool: e.yes_pool,
        no_pool: e.no_pool,
        yes_amount: e.yes_amount,
        no_amount: e.no_amount,
        yes_odds: e.yes_odds,
        no_odds: e.no_odds,
        created_at: e.created_at,
        deadline: e.deadline,
        big_coin: e.type === 'Mainstream' ? {
          id: e.big_coin_id,
          symbol: e.big_coin_symbol,
          name: e.big_coin_name,
          icon_url: e.big_coin_icon_url,
        } : null,
        predicted_price: e.type === 'Mainstream' ? (e.future_price ?? null) : null,
        min_required_amount: minRequiredAmount,
        counter_amount: counterAmount,
        progress,
        seconds_remaining: secondsRemaining,
        waiting_total_seconds: timeoutSec,
        waiting_elapsed_seconds: elapsedSeconds,
        waiting_end_time: waitingEndTime,
      };
    });
  } finally {
    client.release();
  }
}

export async function processTimedOutPendingMatches(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id FROM meme_events 
       WHERE status = 'pending_match'
         AND (EXTRACT(EPOCH FROM (NOW() - created_at)) >= pending_match_timeout)`
    );

    if (res.rows.length === 0) return;

    // 逐个处理，使用已有的超时处理逻辑
    const { handlePendingMatchTimeout } = await import('../meme/auto-settle.js');
    for (const row of res.rows) {
      try {
        await handlePendingMatchTimeout(row.id);
      } catch (e) {
        console.error('处理 pending_match 超时失败:', e);
      }
    }
  } finally {
    client.release();
  }
}

export default { getWaitingEvents, processTimedOutPendingMatches };
