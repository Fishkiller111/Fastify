import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 创建用户表的迁移脚本
async function up() {
  // 先连接到默认的postgres数据库来创建我们的数据库
  const adminClient = new Client({
    host: config.database.host,
    port: config.database.port,
    database: 'postgres', // 连接到默认数据库
    user: config.database.user,
    password: config.database.password,
  });

  try {
    await adminClient.connect();
    
    // 创建数据库（如果不存在）
    const dbName = config.database.database.replace(/[^a-zA-Z0-9_]/g, '_'); // 确保数据库名称有效
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`数据库 ${dbName} 创建成功`);
  } catch (err: any) {
    if (err.code !== '42P04') { // 42P04 是数据库已存在的错误代码
      console.error('创建数据库时出错:', err);
      throw err;
    } else {
      console.log(`数据库 ${config.database.database} 已存在`);
    }
  } finally {
    await adminClient.end();
  }

  // 现在连接到我们的数据库来创建表
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
    
    // 创建用户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建更新时间戳的触发器函数
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $ language 'plpgsql';
    `);
    
    // 创建触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at 
      BEFORE UPDATE ON users 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await client.query('COMMIT');
    console.log('数据库迁移成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('数据库迁移失败:', err);
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
    
    // 删除触发器
    await client.query('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
    
    // 删除触发器函数
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column');
    
    // 删除用户表
    await client.query('DROP TABLE IF EXISTS users');
    
    await client.query('COMMIT');
    console.log('数据库回滚成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('数据库回滚失败:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };