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

    // 创建 mastra_agents 主表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mastra_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT DEFAULT '',
        ai_provider VARCHAR(20) NOT NULL CHECK (ai_provider IN ('openai', 'claude', 'openrouter')),
        model VARCHAR(100) NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agents_created_by ON mastra_agents(created_by);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agents_created_at ON mastra_agents(created_at);
    `);

    // 创建 mastra_agent_prompts 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mastra_agent_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES mastra_agents(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        instructions TEXT NOT NULL,
        system_prompt TEXT DEFAULT '',
        user_prompt TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_prompts_agent_id ON mastra_agent_prompts(agent_id);
    `);

    // 创建 mastra_agent_tools 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mastra_agent_tools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES mastra_agents(id) ON DELETE CASCADE,
        tool_id VARCHAR(50) NOT NULL,
        tool_name VARCHAR(100) NOT NULL,
        tool_description TEXT DEFAULT '',
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_tools_agent_id ON mastra_agent_tools(agent_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_tools_tool_id ON mastra_agent_tools(tool_id);
    `);

    // 创建 mastra_agent_rag 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mastra_agent_rag (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES mastra_agents(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (type IN ('none', 'vector', 'embedding', 'custom')),
        enabled BOOLEAN DEFAULT FALSE,
        vector_provider VARCHAR(50) DEFAULT '',
        vector_api_key VARCHAR(255) DEFAULT '',
        vector_index_name VARCHAR(100) DEFAULT '',
        embedding_provider VARCHAR(20) DEFAULT '' CHECK (embedding_provider IN ('', 'openai', 'claude', 'openrouter')),
        embedding_model VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_rag_agent_id ON mastra_agent_rag(agent_id);
    `);

    // 创建 mastra_agent_settings 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mastra_agent_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES mastra_agents(id) ON DELETE CASCADE,
        temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
        max_tokens INTEGER DEFAULT 1000 CHECK (max_tokens > 0 AND max_tokens <= 10000),
        top_p DECIMAL(3,2) DEFAULT NULL CHECK (top_p IS NULL OR (top_p >= 0 AND top_p <= 1)),
        top_k INTEGER DEFAULT NULL CHECK (top_k IS NULL OR top_k >= 1),
        presence_penalty DECIMAL(3,2) DEFAULT NULL CHECK (presence_penalty IS NULL OR (presence_penalty >= -1 AND presence_penalty <= 1)),
        frequency_penalty DECIMAL(3,2) DEFAULT NULL CHECK (frequency_penalty IS NULL OR (frequency_penalty >= -1 AND frequency_penalty <= 1)),
        memory_enabled BOOLEAN DEFAULT FALSE,
        memory_thread_id VARCHAR(100) DEFAULT '',
        memory_resource_id VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_settings_agent_id ON mastra_agent_settings(agent_id);
    `);

    // 创建触发器函数来自动更新 updated_at 字段
    await client.query(`
      CREATE OR REPLACE FUNCTION update_mastra_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 为相关表创建触发器
    await client.query(`
      CREATE TRIGGER update_mastra_agents_updated_at
        BEFORE UPDATE ON mastra_agents
        FOR EACH ROW EXECUTE FUNCTION update_mastra_updated_at_column();
    `);

    await client.query(`
      CREATE TRIGGER update_mastra_agent_prompts_updated_at
        BEFORE UPDATE ON mastra_agent_prompts
        FOR EACH ROW EXECUTE FUNCTION update_mastra_updated_at_column();
    `);

    await client.query(`
      CREATE TRIGGER update_mastra_agent_rag_updated_at
        BEFORE UPDATE ON mastra_agent_rag
        FOR EACH ROW EXECUTE FUNCTION update_mastra_updated_at_column();
    `);

    await client.query(`
      CREATE TRIGGER update_mastra_agent_settings_updated_at
        BEFORE UPDATE ON mastra_agent_settings
        FOR EACH ROW EXECUTE FUNCTION update_mastra_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ Mastra agent tables created successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating Mastra agent tables:', error);
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
    await client.query('DROP TRIGGER IF EXISTS update_mastra_agent_settings_updated_at ON mastra_agent_settings');
    await client.query('DROP TRIGGER IF EXISTS update_mastra_agent_rag_updated_at ON mastra_agent_rag');
    await client.query('DROP TRIGGER IF EXISTS update_mastra_agent_prompts_updated_at ON mastra_agent_prompts');
    await client.query('DROP TRIGGER IF EXISTS update_mastra_agents_updated_at ON mastra_agents');

    // 删除触发器函数
    await client.query('DROP FUNCTION IF EXISTS update_mastra_updated_at_column()');

    // 按依赖顺序删除表（从子表到父表）
    await client.query('DROP TABLE IF EXISTS mastra_agent_settings');
    await client.query('DROP TABLE IF EXISTS mastra_agent_rag');
    await client.query('DROP TABLE IF EXISTS mastra_agent_tools');
    await client.query('DROP TABLE IF EXISTS mastra_agent_prompts');
    await client.query('DROP TABLE IF EXISTS mastra_agents');

    await client.query('COMMIT');
    console.log('✅ Mastra agent tables dropped successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error dropping Mastra agent tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}