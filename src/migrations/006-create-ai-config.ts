import { Pool, Client } from 'pg';
import config from '../config/index.js';

// 创建AI配置数据的迁移脚本
async function up() {
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

    // 插入AI配置项
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

    // 插入配置，使用ON CONFLICT DO NOTHING避免重复插入
    for (const aiConfig of aiConfigs) {
      await client.query(
        `INSERT INTO config (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [aiConfig.key, aiConfig.value, aiConfig.description]
      );
    }

    await client.query('COMMIT');
    console.log('AI配置项创建成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('创建AI配置项时出错:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// 回滚迁移的脚本
async function down() {
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

    // 删除AI相关配置项
    const aiConfigKeys = [
      'ai_provider',
      'openai_api_key',
      'openai_base_url',
      'openai_model',
      'claude_api_key',
      'claude_base_url',
      'claude_model',
      'openrouter_api_key',
      'openrouter_base_url',
      'openrouter_model',
      'ai_max_tokens',
      'ai_temperature'
    ];

    for (const key of aiConfigKeys) {
      await client.query('DELETE FROM config WHERE key = $1', [key]);
    }

    await client.query('COMMIT');
    console.log('AI配置项回滚成功');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('AI配置项回滚失败:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export { up, down };