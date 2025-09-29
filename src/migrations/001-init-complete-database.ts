import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 完整的数据库初始化迁移脚本 - 包含所有表和配置
async function up() {
  console.log('🚀 开始完整数据库初始化...');

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

    // =================================================================
    // 1. 创建通用触发器函数
    // =================================================================
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    console.log('✅ 通用触发器函数创建成功');

    // =================================================================
    // 2. 创建用户表 (users)
    // =================================================================
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

    // 创建users表触发器和索引
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
    console.log('✅ users 表触发器和索引创建成功');

    // =================================================================
    // 3. 创建配置表 (config)
    // =================================================================
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

    // 创建config表触发器和索引
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
    console.log('✅ config 表触发器和索引创建成功');

    // =================================================================
    // 4. 创建 Mastra Agent 相关表
    // =================================================================

    // 4.1 创建 mastra_agents 主表
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
    console.log('✅ mastra_agents 表创建成功');

    // 4.2 创建 mastra_agent_prompts 表
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
    console.log('✅ mastra_agent_prompts 表创建成功');

    // 4.3 创建 mastra_agent_tools 表
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
    console.log('✅ mastra_agent_tools 表创建成功');

    // 4.4 创建 mastra_agent_rag 表
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
    console.log('✅ mastra_agent_rag 表创建成功');

    // 4.5 创建 mastra_agent_settings 表
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
    console.log('✅ mastra_agent_settings 表创建成功');

    // =================================================================
    // 5. 创建 Agent Sessions 相关表
    // =================================================================

    // 5.1 创建 agent_sessions 表
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
    console.log('✅ agent_sessions 表创建成功');

    // 5.2 创建 session_messages 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ session_messages 表创建成功');

    // =================================================================
    // 6. 创建所有索引
    // =================================================================

    // Mastra agents 索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mastra_agents_created_by ON mastra_agents(created_by);
      CREATE INDEX IF NOT EXISTS idx_mastra_agents_created_at ON mastra_agents(created_at);
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_prompts_agent_id ON mastra_agent_prompts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_tools_agent_id ON mastra_agent_tools(agent_id);
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_tools_tool_id ON mastra_agent_tools(tool_id);
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_rag_agent_id ON mastra_agent_rag(agent_id);
      CREATE INDEX IF NOT EXISTS idx_mastra_agent_settings_agent_id ON mastra_agent_settings(agent_id);
    `);
    console.log('✅ Mastra agent 表索引创建成功');

    // Sessions 索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_id ON agent_sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON session_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_messages_created_at ON session_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_session_messages_role ON session_messages(role);
    `);
    console.log('✅ Sessions 表索引创建成功');

    // =================================================================
    // 7. 创建所有触发器
    // =================================================================

    // Mastra agent 相关表触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_mastra_agents_updated_at ON mastra_agents;
      CREATE TRIGGER update_mastra_agents_updated_at
        BEFORE UPDATE ON mastra_agents
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_mastra_agent_prompts_updated_at ON mastra_agent_prompts;
      CREATE TRIGGER update_mastra_agent_prompts_updated_at
        BEFORE UPDATE ON mastra_agent_prompts
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_mastra_agent_rag_updated_at ON mastra_agent_rag;
      CREATE TRIGGER update_mastra_agent_rag_updated_at
        BEFORE UPDATE ON mastra_agent_rag
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_mastra_agent_settings_updated_at ON mastra_agent_settings;
      CREATE TRIGGER update_mastra_agent_settings_updated_at
        BEFORE UPDATE ON mastra_agent_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Mastra agent 表触发器创建成功');

    // Sessions 相关表触发器
    await client.query(`
      DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
      CREATE TRIGGER update_agent_sessions_updated_at
        BEFORE UPDATE ON agent_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_session_messages_updated_at ON session_messages;
      CREATE TRIGGER update_session_messages_updated_at
        BEFORE UPDATE ON session_messages
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Sessions 表触发器创建成功');

    // =================================================================
    // 8. 插入默认配置数据
    // =================================================================

    // 8.1 基础系统配置
    await client.query(`
      INSERT INTO config (key, value, description)
      VALUES
        ('system_name', 'Fastify AI API', '系统名称'),
        ('max_login_attempts', '5', '最大登录尝试次数'),
        ('session_timeout', '3600', '会话超时时间（秒）'),
        ('password_min_length', '6', '密码最小长度'),
        ('email_verification_required', 'false', '是否需要邮箱验证'),
        ('phone_verification_required', 'false', '是否需要手机号验证')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ 基础系统配置插入成功');

    // 8.2 AI配置数据
    const aiConfigs = [
      {
        key: 'ai_provider',
        value: 'openai',
        description: '当前使用的AI服务提供商 (openai, claude, openrouter)'
      },
      {
        key: 'openai_api_key',
        value: '',
        description: 'OpenAI API密钥'
      },
      {
        key: 'openai_base_url',
        value: 'https://api.openai.com/v1',
        description: 'OpenAI API基础URL'
      },
      {
        key: 'openai_model',
        value: 'gpt-3.5-turbo',
        description: 'OpenAI使用的模型'
      },
      {
        key: 'claude_api_key',
        value: '',
        description: 'Claude API密钥'
      },
      {
        key: 'claude_base_url',
        value: 'https://api.anthropic.com',
        description: 'Claude API基础URL'
      },
      {
        key: 'claude_model',
        value: 'claude-3-sonnet-20240229',
        description: 'Claude使用的模型'
      },
      {
        key: 'openrouter_api_key',
        value: '',
        description: 'OpenRouter API密钥'
      },
      {
        key: 'openrouter_base_url',
        value: 'https://openrouter.ai/api/v1',
        description: 'OpenRouter API基础URL'
      },
      {
        key: 'openrouter_model',
        value: 'anthropic/claude-3-sonnet',
        description: 'OpenRouter使用的模型'
      },
      {
        key: 'ai_max_tokens',
        value: '1000',
        description: 'AI响应的最大token数'
      },
      {
        key: 'ai_temperature',
        value: '0.7',
        description: 'AI响应的温度设置'
      }
    ];

    for (const aiConfig of aiConfigs) {
      await client.query(
        `INSERT INTO config (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [aiConfig.key, aiConfig.value, aiConfig.description]
      );
    }
    console.log('✅ AI配置数据插入成功');

    // 8.3 插入默认管理员用户（密码: admin123，实际使用时应该修改）
    await client.query(`
      INSERT INTO users (username, email, password, role, permissions, status)
      SELECT 'admin', 'admin@example.com', '$2b$10$dummy.hash.for.default.admin', 'super_admin',
        ARRAY['user_access', 'user_management', 'admin_management', 'system_config', 'data_export', 'audit_logs'],
        'active'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin');
    `);
    console.log('✅ 默认管理员用户创建成功');

    await client.query('COMMIT');
    console.log('🎉 完整数据库初始化成功');

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

    // 按照依赖关系删除表（从子表到父表）
    await client.query('DROP TABLE IF EXISTS session_messages');
    await client.query('DROP TABLE IF EXISTS agent_sessions');
    console.log('✅ Sessions 相关表删除成功');

    await client.query('DROP TABLE IF EXISTS mastra_agent_settings');
    await client.query('DROP TABLE IF EXISTS mastra_agent_rag');
    await client.query('DROP TABLE IF EXISTS mastra_agent_tools');
    await client.query('DROP TABLE IF EXISTS mastra_agent_prompts');
    await client.query('DROP TABLE IF EXISTS mastra_agents');
    console.log('✅ Mastra agent 相关表删除成功');

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