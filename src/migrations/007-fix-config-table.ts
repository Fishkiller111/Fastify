import { Client } from 'pg';
import config from '../config/index.js';

// 修复config表结构并插入AI配置
export async function up(): Promise<void> {
  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
  });

  try {
    await client.connect();

    console.log('🔧 修复config表结构...');

    // 检查config表是否存在key列
    const checkKeyColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'config' AND column_name = 'key'
    `);

    if (checkKeyColumn.rows.length === 0) {
      console.log('🔧 添加key列到config表...');

      // 删除旧的config表
      await client.query('DROP TABLE IF EXISTS config CASCADE');

      // 重新创建config表
      await client.query(`
        CREATE TABLE IF NOT EXISTS config (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value TEXT,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建更新时间触发器
      await client.query(`
        CREATE TRIGGER update_config_updated_at
        BEFORE UPDATE ON config
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
      `);

      console.log('✅ config表结构修复完成');
    }

    // 插入AI配置数据
    const aiConfigs = [
      { key: 'ai_provider', value: 'openai', description: 'AI服务提供商' },
      { key: 'openai_api_key', value: 'your-openai-api-key', description: 'OpenAI API密钥' },
      { key: 'openai_base_url', value: 'https://api.openai.com/v1', description: 'OpenAI API基础URL' },
      { key: 'openai_model', value: 'gpt-3.5-turbo', description: 'OpenAI模型名称' },
      { key: 'claude_api_key', value: 'your-claude-api-key', description: 'Claude API密钥' },
      { key: 'claude_base_url', value: 'https://api.anthropic.com', description: 'Claude API基础URL' },
      { key: 'claude_model', value: 'claude-3-haiku-20240307', description: 'Claude模型名称' },
      { key: 'openrouter_api_key', value: 'your-openrouter-api-key', description: 'OpenRouter API密钥' },
      { key: 'openrouter_base_url', value: 'https://openrouter.ai/api/v1', description: 'OpenRouter API基础URL' },
      { key: 'openrouter_model', value: 'openai/gpt-3.5-turbo', description: 'OpenRouter模型名称' },
      { key: 'ai_max_tokens', value: '1000', description: 'AI响应最大token数' },
      { key: 'ai_temperature', value: '0.7', description: 'AI创造性温度参数' }
    ];

    for (const cfg of aiConfigs) {
      await client.query(
        `INSERT INTO config (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         updated_at = CURRENT_TIMESTAMP`,
        [cfg.key, cfg.value, cfg.description]
      );
    }

    console.log('✅ AI配置数据插入完成');

  } catch (error) {
    console.error('❌ 修复config表失败:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// 回滚函数
export async function down(): Promise<void> {
  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
  });

  try {
    await client.connect();

    console.log('🔄 回滚config表修复...');

    // 删除AI配置
    const aiConfigKeys = [
      'ai_provider', 'openai_api_key', 'openai_base_url', 'openai_model',
      'claude_api_key', 'claude_base_url', 'claude_model',
      'openrouter_api_key', 'openrouter_base_url', 'openrouter_model',
      'ai_max_tokens', 'ai_temperature'
    ];

    for (const key of aiConfigKeys) {
      await client.query('DELETE FROM config WHERE key = $1', [key]);
    }

    console.log('✅ config表回滚完成');

  } catch (error) {
    console.error('❌ 回滚config表失败:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => {
    console.log('✅ config表修复完成');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ config表修复失败:', error);
    process.exit(1);
  });
}