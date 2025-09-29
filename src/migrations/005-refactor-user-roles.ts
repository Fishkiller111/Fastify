import { Pool } from 'pg';
import config from '../config/index.js';

const pool = new Pool({
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
});

export default async function migration005() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 添加role字段到users表
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
    `);

    // 添加权限字段到users表
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT ARRAY['user_access'];
    `);

    // 添加状态字段到users表
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
    `);

    // 添加最后登录时间到users表
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
    `);

    // 删除admins表（如果存在）
    await client.query(`
      DROP TABLE IF EXISTS admins;
    `);

    await client.query('COMMIT');
    console.log('用户表角色重构成功');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('用户表角色重构失败:', err);
    throw err;
  } finally {
    client.release();
  }
}