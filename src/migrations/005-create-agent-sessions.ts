import { Pool } from 'pg';
import config from '../config/index.js';

export async function up(): Promise<void> {
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

    // 创建 agent_sessions 表 - 存储会话信息
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES mastra_agents(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT '新对话',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_id ON agent_sessions(agent_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);
    `);

    // 创建 session_messages 表 - 存储会话中的消息
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON session_messages(session_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_created_at ON session_messages(created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_role ON session_messages(role);
    `);

    // 创建触发器来自动更新 updated_at 字段
    await client.query(`
      CREATE TRIGGER update_agent_sessions_updated_at
        BEFORE UPDATE ON agent_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ Agent sessions tables created successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating agent sessions tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function down(): Promise<void> {
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
    await client.query('DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions');

    // 按依赖顺序删除表（从子表到父表）
    await client.query('DROP TABLE IF EXISTS session_messages');
    await client.query('DROP TABLE IF EXISTS agent_sessions');

    await client.query('COMMIT');
    console.log('✅ Agent sessions tables dropped successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error dropping agent sessions tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}