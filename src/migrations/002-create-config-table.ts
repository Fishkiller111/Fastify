import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 创建配置表的迁移脚本
async function up() {
  // 连接到我们的数据库
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 创建配置表
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建更新时间戳的触发器函数（如果不存在）
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    // 创建触发器（如果不存在）
    await client.query(`
      DROP TRIGGER IF EXISTS update_config_updated_at ON config;
      CREATE TRIGGER update_config_updated_at 
      BEFORE UPDATE ON config 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await client.query('COMMIT');
    console.log('config表创建成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('创建config表时出错:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// 回滚迁移的脚本
async function down() {
  // 连接到我们的数据库
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 删除配置表
    await client.query('DROP TABLE IF EXISTS config');
    
    await client.query('COMMIT');
    console.log('config表回滚成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('config表回滚失败:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };