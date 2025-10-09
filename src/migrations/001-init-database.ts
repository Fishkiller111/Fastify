import { Client, Pool } from "pg";
import config from "../config/index.js";

function createPool() {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });
}

async function ensureDatabaseExists() {
  const adminClient = new Client({
    host: config.database.host,
    port: config.database.port,
    database: "postgres",
    user: config.database.user,
    password: config.database.password,
  });

  try {
    await adminClient.connect();
    const dbName = config.database.database.replace(/[^a-zA-Z0-9_]/g, "_");
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ 数据库 ${dbName} 创建成功`);
  } catch (error: any) {
    if (error.code === "42P04") {
      console.log(`ℹ️ 数据库 ${config.database.database} 已存在`);
    } else {
      console.error("❌ 创建数据库时出错:", error);
      throw error;
    }
  } finally {
    await adminClient.end();
  }
}

async function up() {
  console.log("🚀 开始数据库初始化...");
  await ensureDatabaseExists();

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query("DROP TABLE IF EXISTS admins");

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
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `);

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
    await client.query(`
      DROP TRIGGER IF EXISTS update_config_updated_at ON config;
      CREATE TRIGGER update_config_updated_at
      BEFORE UPDATE ON config
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);
    `);

    await client.query(`
      INSERT INTO config (key, value, description)
      VALUES
        ('system_name', '{{projectName}}', '系统名称'),
        ('max_login_attempts', '5', '最大登录尝试次数'),
        ('session_timeout', '3600', '会话超时时间（秒）'),
        ('password_min_length', '6', '密码最小长度'),
        ('email_verification_required', 'false', '是否需要邮箱验证'),
        ('phone_verification_required', 'false', '是否需要手机号验证')
        ('membership_system_enabled', 'true', '是否启用会员系统'),
        ('points_system_enabled', 'true', '是否启用积分系统'),
        ('points_expiry_days', '365', '积分有效期（天）'),
        ('default_points_per_action', '10', '默认每次操作获取的积分'),
        ('max_daily_points', '100', '每日最多获取积分上限')
      ON CONFLICT (key) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO users (username, email, password, role, permissions, status)
      SELECT 'admin', 'admin@example.com', '$2b$10$dummy.hash.for.default.admin', 'super_admin',
        ARRAY['user_access', 'user_management', 'admin_management', 'system_config', 'data_export', 'audit_logs'],
        'active'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin');
    `);

    await client.query("COMMIT");
    console.log("🎉 数据库初始化完成");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ 数据库初始化失败:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  console.log("🔄 开始数据库回滚...");

  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DROP TABLE IF EXISTS config");
    await client.query("DROP TABLE IF EXISTS users");
    await client.query("DROP FUNCTION IF EXISTS update_updated_at_column()");

    await client.query("COMMIT");
    console.log("🎉 数据库回滚完成");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ 数据库回滚失败:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };
