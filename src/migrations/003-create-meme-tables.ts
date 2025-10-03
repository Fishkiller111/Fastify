import { Pool } from 'pg';
import config from '../config/index.js';

function createPool() {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });
}

async function up() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建meme事件表
    await client.query(`
      CREATE TABLE IF NOT EXISTS meme_events (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('pumpfun', 'bonk')),
        contract_address VARCHAR(100),
        initial_pool_amount NUMERIC(36, 18) NOT NULL,
        yes_pool NUMERIC(36, 18) DEFAULT 0,
        no_pool NUMERIC(36, 18) DEFAULT 0,
        yes_odds NUMERIC(5, 2) DEFAULT 50.00,
        no_odds NUMERIC(5, 2) DEFAULT 50.00,
        total_yes_bets INTEGER DEFAULT 0,
        total_no_bets INTEGER DEFAULT 0,
        is_launched BOOLEAN DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settled_at TIMESTAMP
      )
    `);

    // 创建投注记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS meme_bets (
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

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_creator
      ON meme_events(creator_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_events_status
      ON meme_events(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_bets_event
      ON meme_bets(event_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meme_bets_user
      ON meme_bets(user_id)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DROP INDEX IF EXISTS idx_meme_bets_user');
    await client.query('DROP INDEX IF EXISTS idx_meme_bets_event');
    await client.query('DROP INDEX IF EXISTS idx_meme_events_status');
    await client.query('DROP INDEX IF EXISTS idx_meme_events_creator');
    
    await client.query('DROP TABLE IF EXISTS meme_bets');
    await client.query('DROP TABLE IF EXISTS meme_events');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
