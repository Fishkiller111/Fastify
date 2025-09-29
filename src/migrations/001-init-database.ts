import { Client } from 'pg';
import config from '../config/index.js';

export const up = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    // 创建数据库（如果不存在）
    const dbName = config.database.database;
    const { rows } = await client.query(`
      SELECT 1 FROM pg_database WHERE datname = $1
    `, [dbName]);

    if (rows.length === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`数据库 ${dbName} 创建成功`);
    } else {
      console.log(`数据库 ${dbName} 已存在`);
    }

    // 创建updated_at触发器函数（全局共用）
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 1. 检查并创建/更新配置表
    const configTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'config'
      );
    `);

    if (configTableExists.rows[0].exists) {
      // 如果表存在，检查列结构并更新
      const configColumns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'config' AND table_schema = 'public';
      `);

      const columnNames = configColumns.rows.map((row: any) => row.column_name);

      // 如果使用的是旧的列名（key而不是config_key），则重命名
      if (columnNames.includes('key') && !columnNames.includes('config_key')) {
        await client.query('ALTER TABLE config RENAME COLUMN key TO config_key');
      }
      if (columnNames.includes('value') && !columnNames.includes('config_value')) {
        await client.query('ALTER TABLE config RENAME COLUMN value TO config_value');
      }
      if (columnNames.includes('type') && !columnNames.includes('config_type')) {
        await client.query('ALTER TABLE config RENAME COLUMN type TO config_type');
      }

      // 添加缺失的列
      if (!columnNames.includes('description')) {
        await client.query('ALTER TABLE config ADD COLUMN description TEXT');
      }
      if (!columnNames.includes('is_public')) {
        await client.query('ALTER TABLE config ADD COLUMN is_public BOOLEAN DEFAULT false');
      }
    } else {
      // 创建新表
      await client.query(`
        CREATE TABLE config (
          id SERIAL PRIMARY KEY,
          config_key VARCHAR(100) UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          config_type VARCHAR(20) DEFAULT 'string' CHECK (config_type IN ('string', 'number', 'boolean', 'json')),
          description TEXT,
          is_public BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    // 创建索引（如果不存在）
    await client.query('CREATE INDEX IF NOT EXISTS idx_config_key ON config(config_key)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_config_is_public ON config(is_public)');

    // 创建触发器（如果不存在）
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_config_updated_at') THEN
          CREATE TRIGGER update_config_updated_at
            BEFORE UPDATE ON config
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    // 2. 创建用户表（包含手机号和用户角色）
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'merchant', 'admin')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
        email_verified BOOLEAN DEFAULT false,
        phone_verified BOOLEAN DEFAULT false,
        profile_picture VARCHAR(500),
        date_of_birth DATE,
        gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
        address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
          CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    // 3. 创建管理员表
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'moderator')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        permissions TEXT[],
        created_by INTEGER REFERENCES admins(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE
      );

      CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
      CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
      CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_admins_updated_at') THEN
          CREATE TRIGGER update_admins_updated_at
            BEFORE UPDATE ON admins
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    // 4. 创建店铺表
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        owner_name VARCHAR(50) NOT NULL,
        contact_phone VARCHAR(20),
        contact_email VARCHAR(100),
        address TEXT,
        logo_url VARCHAR(500),
        cover_image_url VARCHAR(500),
        business_hours VARCHAR(200),
        business_license VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
        is_active BOOLEAN DEFAULT true,
        rating DECIMAL(2,1) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
        total_sales INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
      CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active);
      CREATE INDEX IF NOT EXISTS idx_stores_rating ON stores(rating);
      CREATE INDEX IF NOT EXISTS idx_stores_owner_name ON stores(owner_name);

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_stores_updated_at') THEN
          CREATE TRIGGER update_stores_updated_at
            BEFORE UPDATE ON stores
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    // 5. 检查并创建/更新商品表（包含店铺关联）
    const productsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'products'
      );
    `);

    if (productsTableExists.rows[0].exists) {
      // 如果表存在，检查列结构并更新
      const productsColumns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'products' AND table_schema = 'public';
      `);

      const columnNames = productsColumns.rows.map((row: any) => row.column_name);

      // 添加缺失的列
      if (!columnNames.includes('store_id')) {
        await client.query('ALTER TABLE products ADD COLUMN store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE');
      }
    } else {
      // 创建新表
      await client.query(`
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          category VARCHAR(100),
          image_url VARCHAR(500),
          store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    // 创建索引（如果不存在）
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id)');

    // 创建触发器（如果不存在）
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
          CREATE TRIGGER update_products_updated_at
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    // 插入默认数据

    // 插入默认超级管理员
    await client.query(`
      INSERT INTO admins (username, email, password_hash, role, permissions)
      SELECT 'superadmin', 'admin@example.com', '$2b$10$dummy.hash.for.default.admin', 'super_admin',
        ARRAY['user_management', 'admin_management', 'system_config', 'data_export', 'audit_logs']
      WHERE NOT EXISTS (SELECT 1 FROM admins WHERE role = 'super_admin');
    `);

    // 插入一些默认配置 - 仅插入基本数据
    await client.query(`
      INSERT INTO config (config_key, config_value)
      VALUES
        ('site_name', 'Fastify Fast Market'),
        ('site_description', '基于Fastify的快速电商平台'),
        ('default_page_size', '10'),
        ('max_page_size', '100'),
        ('email_verification_required', 'true'),
        ('phone_verification_required', 'false')
      ON CONFLICT (config_key) DO NOTHING;
    `);

    // 插入默认存储配置 - 阿里云OSS（未配置状态）
    await client.query(`
      INSERT INTO config (config_key, config_value, description)
      VALUES
        ('storage_aliyun_oss_status', 'inactive', '阿里云OSS存储状态'),
        ('storage_aliyun_oss_is_default', 'false', '是否为默认存储'),
        ('storage_aliyun_oss_access_key_id', '', '阿里云OSS访问密钥ID'),
        ('storage_aliyun_oss_access_key_secret', '', '阿里云OSS访问密钥密码'),
        ('storage_aliyun_oss_region', 'oss-cn-hangzhou', 'OSS区域'),
        ('storage_aliyun_oss_bucket', '', 'OSS存储桶名称'),
        ('storage_aliyun_oss_endpoint', '', 'OSS自定义域名'),
        ('storage_aliyun_oss_internal', 'false', '是否使用内网访问'),
        ('storage_aliyun_oss_secure', 'true', '是否使用HTTPS'),
        ('storage_aliyun_oss_timeout', '60000', '请求超时时间(毫秒)')
      ON CONFLICT (config_key) DO NOTHING;
    `);

    // 插入默认存储配置 - 本地存储（默认启用）
    await client.query(`
      INSERT INTO config (config_key, config_value, description)
      VALUES
        ('storage_local_status', 'active', '本地存储状态'),
        ('storage_local_is_default', 'true', '是否为默认存储'),
        ('storage_local_upload_path', './uploads', '本地存储上传路径'),
        ('storage_local_max_file_size', '52428800', '最大文件大小(字节) - 50MB'),
        ('storage_local_allowed_file_types', '[]', '允许的文件类型(JSON数组)'),
        ('storage_local_enable_compression', 'true', '是否启用压缩'),
        ('storage_local_compress_quality', '80', '压缩质量(1-100)')
      ON CONFLICT (config_key) DO NOTHING;
    `);

    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  } finally {
    await client.end();
  }
};

export const down = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    // 按依赖关系倒序删除表
    await client.query('DROP TABLE IF EXISTS products CASCADE');
    await client.query('DROP TABLE IF EXISTS stores CASCADE');
    await client.query('DROP TABLE IF EXISTS admins CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TABLE IF EXISTS config CASCADE');
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

    console.log('✅ 数据库重置完成');
  } catch (error) {
    console.error('❌ 数据库重置失败:', error);
    throw error;
  } finally {
    await client.end();
  }
};