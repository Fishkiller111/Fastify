import pool from '../config/database.js';

async function updateMemeEventsTables() {
  const client = await pool.connect();

  try {
    console.log('🔄 开始更新meme_events表结构...');

    await client.query('BEGIN');

    // 删除旧表
    await client.query('DROP TABLE IF EXISTS meme_bets CASCADE');
    await client.query('DROP TABLE IF EXISTS meme_events CASCADE');

    // 重新创建meme_events表
    await client.query(`
      CREATE TABLE meme_events (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('pumpfun', 'bonk')),
        contract_address VARCHAR(100),
        creator_side VARCHAR(3) NOT NULL CHECK (creator_side IN ('yes', 'no')),
        initial_pool_amount NUMERIC(36, 18) NOT NULL,
        yes_pool NUMERIC(36, 18) DEFAULT 0,
        no_pool NUMERIC(36, 18) DEFAULT 0,
        yes_odds NUMERIC(5, 2) DEFAULT 50.00,
        no_odds NUMERIC(5, 2) DEFAULT 50.00,
        total_yes_bets INTEGER DEFAULT 0,
        total_no_bets INTEGER DEFAULT 0,
        is_launched BOOLEAN DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'pending_match' CHECK (status IN ('pending_match', 'active', 'settled', 'cancelled')),
        deadline TIMESTAMP NOT NULL,
        launch_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settled_at TIMESTAMP
      )
    `);

    // 重新创建meme_bets表
    await client.query(`
      CREATE TABLE meme_bets (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES meme_events(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        bet_type VARCHAR(3) NOT NULL CHECK (bet_type IN ('yes', 'no')),
        bet_amount NUMERIC(36, 18) NOT NULL,
        odds_at_bet NUMERIC(5, 2) NOT NULL,
        potential_payout NUMERIC(36, 18),
        actual_payout NUMERIC(36, 18),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'refunded')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');

    console.log('✅ meme_events表结构更新成功!');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 更新表结构失败:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

updateMemeEventsTables();
