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

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(100) UNIQUE,
      ADD COLUMN IF NOT EXISTS balance NUMERIC(36, 18) DEFAULT 0
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_wallet_address
      ON users(wallet_address)
    `);

    await client.query(`
      INSERT INTO config (key, value, description)
      VALUES ('login_method', 'wallet', '登录方式配置 (email、sms、wallet 或 both)')
      ON CONFLICT (key) DO NOTHING
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

    await client.query('DROP INDEX IF EXISTS idx_users_wallet_address');
    await client.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS wallet_address,
      DROP COLUMN IF EXISTS balance
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

export { up, down };
