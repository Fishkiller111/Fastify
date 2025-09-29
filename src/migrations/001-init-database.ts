import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 整合的数据库初始化迁移脚本
async function up() {
  console.log('🚀 开始数据库初始化...');
  
  // 先连接到默认的postgres数据库来创建我们的数据库
  const adminClient = new Client({
    host: config.database.host,
    port: config.database.port,
    database: 'postgres',
    user: config.database.user,
    password: config.database.password,
  });

  try {
    await adminClient.connect();
    
    // 创建数据库（如果不存在）
    const dbName = config.database.database.replace(/[^a-zA-Z0-9_]/g, '_');
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ 数据库 ${dbName} 创建成功`);
  } catch (err: any) {
    if (err.code !== '42P04') {
      console.error('❌ 创建数据库时出错:', err);
      throw err;
    } else {
      console.log(`ℹ️ 数据库 ${config.database.database} 已存在`);
    }
  } finally {
    await adminClient.end();
  }

  // 连接到我们的数据库来创建表
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
    
    // 1. 创建更新时间戳的触发器函数
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    console.log('✅ 触发器函数创建成功');
    
    // 2. 创建用户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20) UNIQUE,
        role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
        permissions TEXT[] DEFAULT ARRAY['user_access'],
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        last_login_at TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users 表创建成功');
    
    // 创建users表触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at 
      BEFORE UPDATE ON users 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ users 表触发器创建成功');
    
    // 创建users表索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `);
    console.log('✅ users 表索引创建成功');
    
    // 3. 创建配置表
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
    console.log('✅ config 表创建成功');
    
    // 创建config表触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_config_updated_at ON config;
      CREATE TRIGGER update_config_updated_at 
      BEFORE UPDATE ON config 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ config 表触发器创建成功');
    
    // 创建config表索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);
    `);
    console.log('✅ config 表索引创建成功');
    
    // 4. 插入默认配置数据
    await client.query(`
      INSERT INTO config (key, value, description) 
      VALUES 
        ('system_name', '{{projectName}}', '系统名称'),
        ('max_login_attempts', '5', '最大登录尝试次数'),
        ('session_timeout', '3600', '会话超时时间（秒）'),
        ('password_min_length', '6', '密码最小长度'),
        ('email_verification_required', 'false', '是否需要邮箱验证'),
        ('phone_verification_required', 'false', '是否需要手机号验证')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ 默认配置数据插入成功');
    
    // 5. 插入默认管理员用户（密码: admin123，实际使用时应该修改）
    await client.query(`
      INSERT INTO users (username, email, password, role, permissions, status)
      SELECT 'admin', 'admin@example.com', '$2b$10$dummy.hash.for.default.admin', 'super_admin',
        ARRAY['user_access', 'user_management', 'admin_management', 'system_config', 'data_export', 'audit_logs'],
        'active'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin');
    `);
    console.log('✅ 默认管理员用户创建成功');
    
    await client.query('COMMIT');
    console.log('🎉 数据库初始化完成');
    
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ 数据库初始化失败:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// 完整回滚迁移的脚本
async function down() {
  console.log('🔄 开始数据库回滚...');
  
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
    
    // 删除所有表
    await client.query('DROP TABLE IF EXISTS config');
    console.log('✅ config 表删除成功');
    
    await client.query('DROP TABLE IF EXISTS users');
    console.log('✅ users 表删除成功');
    
    // 删除触发器函数
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column');
    console.log('✅ 触发器函数删除成功');
    
    await client.query('COMMIT');
    console.log('🎉 数据库回滚完成');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ 数据库回滚失败:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };