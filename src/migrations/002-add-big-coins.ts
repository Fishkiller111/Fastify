import { Client, Pool } from 'pg';
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
  console.log('🚀 开始创建主流币表...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 创建主流币表
    await client.query(`
      CREATE TABLE IF NOT EXISTS big_coins (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        contract_address VARCHAR(100) UNIQUE NOT NULL,
        chain VARCHAR(20) DEFAULT 'BSC' NOT NULL,
        decimals INTEGER DEFAULT 18,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_big_coins_updated_at ON big_coins;
      CREATE TRIGGER update_big_coins_updated_at
      BEFORE UPDATE ON big_coins
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_big_coins_symbol ON big_coins(symbol);
      CREATE INDEX IF NOT EXISTS idx_big_coins_contract ON big_coins(contract_address);
      CREATE INDEX IF NOT EXISTS idx_big_coins_active ON big_coins(is_active);
    `);

    // 插入初始主流币数据（BSC链上的地址）
    await client.query(`
      INSERT INTO big_coins (symbol, name, contract_address, chain, decimals)
      VALUES
        ('BTC', 'Bitcoin', '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'BSC', 18),
        ('ETH', 'Ethereum', '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'BSC', 18),
        ('SOL', 'Solana', '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', 'BSC', 18),
        ('BNB', 'Binance Coin', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'BSC', 18),
        ('USDT', 'Tether USD', '0x55d398326f99059fF775485246999027B3197955', 'BSC', 18),
        ('USDC', 'USD Coin', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'BSC', 18)
      ON CONFLICT (symbol) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('🎉 主流币表创建完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 主流币表创建失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log('🔄 开始回滚主流币表...');

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DROP TABLE IF EXISTS big_coins');

    await client.query('COMMIT');
    console.log('🎉 主流币表回滚完成');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 主流币表回滚失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
