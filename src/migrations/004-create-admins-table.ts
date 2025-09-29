import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    // 创建管理员表
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'moderator')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        permissions TEXT[], -- JSON array of permissions
        created_by INTEGER REFERENCES admins(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);
    `);

    // 创建updated_at触发器
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
    `);

    await client.query(`
      CREATE TRIGGER update_admins_updated_at
        BEFORE UPDATE ON admins
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // 插入默认超级管理员（如果不存在）
    await client.query(`
      INSERT INTO admins (username, email, password_hash, role, permissions)
      SELECT 'superadmin', 'admin@example.com', '$2b$10$dummy.hash.for.default.admin', 'super_admin',
        ARRAY['user_management', 'admin_management', 'system_config', 'data_export', 'audit_logs']
      WHERE NOT EXISTS (SELECT 1 FROM admins WHERE role = 'super_admin');
    `);

    console.log('✅ 管理员表创建成功');
  } catch (error) {
    console.error('❌ 管理员表创建失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('DROP TRIGGER IF EXISTS update_admins_updated_at ON admins');
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column()');
    await client.query('DROP TABLE IF EXISTS admins');
    console.log('✅ 管理员表删除成功');
  } catch (error) {
    console.error('❌ 管理员表删除失败:', error);
    throw error;
  } finally {
    client.release();
  }
}