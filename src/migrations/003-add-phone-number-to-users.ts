import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 更新用户表的迁移脚本
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
    
    // 添加手机号字段到用户表
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE
    `);
    
    await client.query('COMMIT');
    console.log('用户表更新成功，已添加手机号字段');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('更新用户表时出错:', err);
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
    
    // 删除手机号字段
    await client.query('ALTER TABLE users DROP COLUMN IF EXISTS phone_number');
    
    await client.query('COMMIT');
    console.log('用户表回滚成功，已删除手机号字段');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('回滚用户表时出错:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };