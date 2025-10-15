import pool from '../config/database.js';

export async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kline_buy_records (
        id SERIAL PRIMARY KEY,
        bet_id INTEGER NOT NULL UNIQUE REFERENCES meme_bets(id) ON DELETE CASCADE,
        event_id INTEGER NOT NULL REFERENCES meme_events(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bet_type VARCHAR(3) NOT NULL CHECK (bet_type IN ('yes', 'no')),
        bet_amount NUMERIC(36, 18) NOT NULL,
        yes_odds_at_bet NUMERIC(5, 2) NOT NULL,
        no_odds_at_bet NUMERIC(5, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kline_buy_records_event_user
      ON kline_buy_records(event_id, user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kline_buy_records_user
      ON kline_buy_records(user_id)
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 009: kline_buy_records table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 009 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DROP TABLE IF EXISTS kline_buy_records CASCADE');

    await client.query('COMMIT');
    console.log('✅ Migration 009: kline_buy_records table dropped successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 009 rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
