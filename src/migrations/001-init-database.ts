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

/**
 * 确保数据库存在的异步函数
 * 如果数据库不存在，则创建一个新的数据库
 * 如果数据库已存在，则不会重复创建
 */
async function ensureDatabaseExists() {
  // 创建一个PostgreSQL客户端连接，用于管理数据库
  const adminClient = new Client({
    host: config.database.host, // 数据库主机地址
    port: config.database.port, // 数据库端口号
    database: "postgres", // 连接到默认的postgres数据库
    user: config.database.user, // 数据库用户名
    password: config.database.password, // 数据库密码
  });

  try {
    await adminClient.connect(); // 尝试连接到数据库
    // 获取数据库名称，并过滤掉特殊字符，只保留字母、数字和下划线
    const dbName = config.database.database.replace(/[^a-zA-Z0-9_]/g, "_");
    // 创建SQL语句，创建指定名称的数据库
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ 数据库 ${dbName} 创建成功`);
  } catch (error: any) {
    // 检查错误代码，42P04表示数据库已存在
    if (error.code === "42P04") {
      console.log(`ℹ️ 数据库 ${config.database.database} 已存在`);
    } else {
      console.error("❌ 创建数据库时出错:", error);
      throw error; // 抛出其他类型的错误
    }
  } finally {
    // 无论成功或失败，最后都关闭数据库连接
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
    -- 会员等级表
      drop table if exists membership_levels;
      create table if not exists membership_levels (
        id serial primary key,
        name varchar(50) not null unique, -- 等级名称
        level integer not null unique, -- 等级数字，用于排序
        min_points integer not null, -- 升级到该等级所需的最小积分
        description text, -- 等级描述
        权益 jsonb, -- 等级权益，以JSON格式存储
        created_at timestamp with time zone default current_timestamp,
        updated_at timestamp with time zone default current_timestamp
      );
    `);

    await client.query(`
      drop trigger if exists update_membership_levels_updated_at on membership_levels;
      create trigger update_membership_levels_updated_at
      before update on membership_levels
      for each row
      execute function update_updated_at_column();
    `);

    await client.query(`
      -- 用户会员信息表
      drop table if exists user_membership;
      create table if not exists user_membership (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        level_id integer references membership_levels(id) on delete set null,
        current_points integer default 0, -- 当前积分
        total_points integer default 0, -- 累计积分
        points_expire_date timestamp with time zone, -- 积分过期日期
        created_at timestamp with time zone default current_timestamp,
        updated_at timestamp with time zone default current_timestamp,
        unique (user_id)
      );
    `);

    await client.query(`
      drop trigger if exists update_user_membership_updated_at on user_membership;
      create trigger update_user_membership_updated_at
      before update on user_membership
      for each row
      execute function update_updated_at_column();
    `);

    await client.query(`
      -- 积分变动记录表
      drop table if exists point_transactions;
      create table if not exists point_transactions (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        points integer not null, -- 积分变动数量（正数为增加，负数为减少）
        type varchar(50) not null, -- 交易类型（如：购买、签到、兑换等）
        source varchar(100), -- 交易来源（如：订单号、活动ID等）
        description text, -- 交易描述
        created_at timestamp with time zone default current_timestamp
      );
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
        ('phone_verification_required', 'false', '是否需要手机号验证'),
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
