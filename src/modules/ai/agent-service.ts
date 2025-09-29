import pool from '../../config/database.js';
import {
  MastraAgentConfig,
  AgentTool,
  AgentPromptConfig,
  RAGConfig,
  AIProvider
} from './types.js';

export class AgentService {

  // 创建自定义agent配置
  async createAgent(agentConfig: Omit<MastraAgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<MastraAgentConfig> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 插入agent基本信息
      const agentResult = await client.query(`
        INSERT INTO mastra_agents (
          name, description, ai_provider, model, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at, updated_at
      `, [
        agentConfig.name,
        agentConfig.description || '',
        agentConfig.aiProvider,
        agentConfig.model,
        agentConfig.createdBy
      ]);

      const agentId = agentResult.rows[0].id;

      // 插入prompt配置
      await client.query(`
        INSERT INTO mastra_agent_prompts (
          agent_id, name, instructions, system_prompt, user_prompt
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        agentId,
        agentConfig.promptConfig.name,
        agentConfig.promptConfig.instructions,
        agentConfig.promptConfig.systemPrompt || '',
        agentConfig.promptConfig.userPrompt || ''
      ]);

      // 插入工具配置
      if (agentConfig.tools.length > 0) {
        const toolValues = agentConfig.tools.map((tool, index) =>
          `($1, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, $${index * 4 + 5})`
        ).join(',');

        const toolParams = [agentId];
        agentConfig.tools.forEach(tool => {
          toolParams.push(tool.id, tool.name, tool.description, tool.enabled);
        });

        await client.query(`
          INSERT INTO mastra_agent_tools (agent_id, tool_id, tool_name, tool_description, enabled)
          VALUES ${toolValues}
        `, toolParams);
      }

      // 插入RAG配置
      await client.query(`
        INSERT INTO mastra_agent_rag (
          agent_id, type, enabled, vector_provider, vector_api_key,
          vector_index_name, embedding_provider, embedding_model
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        agentId,
        agentConfig.ragConfig.type,
        agentConfig.ragConfig.enabled,
        agentConfig.ragConfig.vectorStore?.provider || '',
        agentConfig.ragConfig.vectorStore?.apiKey || '',
        agentConfig.ragConfig.vectorStore?.indexName || '',
        agentConfig.ragConfig.embeddingModel?.provider || '',
        agentConfig.ragConfig.embeddingModel?.model || ''
      ]);

      // 插入模型设置
      await client.query(`
        INSERT INTO mastra_agent_settings (
          agent_id, temperature, max_tokens, top_p, top_k,
          presence_penalty, frequency_penalty, memory_enabled,
          memory_thread_id, memory_resource_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        agentId,
        agentConfig.modelSettings.temperature,
        agentConfig.modelSettings.maxTokens,
        agentConfig.modelSettings.topP || null,
        agentConfig.modelSettings.topK || null,
        agentConfig.modelSettings.presencePenalty || null,
        agentConfig.modelSettings.frequencyPenalty || null,
        agentConfig.memory?.enabled || false,
        agentConfig.memory?.threadId || '',
        agentConfig.memory?.resourceId || ''
      ]);

      await client.query('COMMIT');

      return {
        ...agentConfig,
        id: agentId,
        createdAt: agentResult.rows[0].created_at,
        updatedAt: agentResult.rows[0].updated_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 获取agent配置
  async getAgent(agentId: string): Promise<MastraAgentConfig | null> {
    const client = await pool.connect();

    try {
      // 获取agent基本信息
      const agentResult = await client.query(`
        SELECT * FROM mastra_agents WHERE id = $1
      `, [agentId]);

      if (agentResult.rows.length === 0) {
        return null;
      }

      const agent = agentResult.rows[0];

      // 获取prompt配置
      const promptResult = await client.query(`
        SELECT * FROM mastra_agent_prompts WHERE agent_id = $1
      `, [agentId]);

      const promptConfig: AgentPromptConfig = {
        id: promptResult.rows[0]?.id || '',
        name: promptResult.rows[0]?.name || '',
        instructions: promptResult.rows[0]?.instructions || '',
        systemPrompt: promptResult.rows[0]?.system_prompt || '',
        userPrompt: promptResult.rows[0]?.user_prompt || ''
      };

      // 获取工具配置
      const toolsResult = await client.query(`
        SELECT * FROM mastra_agent_tools WHERE agent_id = $1
      `, [agentId]);

      const tools: AgentTool[] = toolsResult.rows.map(tool => ({
        id: tool.tool_id,
        name: tool.tool_name,
        description: tool.tool_description,
        enabled: tool.enabled
      }));

      // 获取RAG配置
      const ragResult = await client.query(`
        SELECT * FROM mastra_agent_rag WHERE agent_id = $1
      `, [agentId]);

      const ragConfig: RAGConfig = {
        type: ragResult.rows[0]?.type || 'none',
        enabled: ragResult.rows[0]?.enabled || false,
        vectorStore: ragResult.rows[0]?.vector_provider ? {
          provider: ragResult.rows[0].vector_provider,
          apiKey: ragResult.rows[0].vector_api_key,
          indexName: ragResult.rows[0].vector_index_name
        } : undefined,
        embeddingModel: ragResult.rows[0]?.embedding_provider ? {
          provider: ragResult.rows[0].embedding_provider,
          model: ragResult.rows[0].embedding_model
        } : undefined
      };

      // 获取模型设置
      const settingsResult = await client.query(`
        SELECT * FROM mastra_agent_settings WHERE agent_id = $1
      `, [agentId]);

      const settings = settingsResult.rows[0];

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        aiProvider: agent.ai_provider as AIProvider,
        model: agent.model,
        promptConfig,
        tools,
        ragConfig,
        modelSettings: {
          temperature: settings?.temperature || 0.7,
          maxTokens: settings?.max_tokens || 1000,
          topP: settings?.top_p || null,
          topK: settings?.top_k || null,
          presencePenalty: settings?.presence_penalty || null,
          frequencyPenalty: settings?.frequency_penalty || null
        },
        memory: settings?.memory_enabled ? {
          enabled: settings.memory_enabled,
          threadId: settings.memory_thread_id || '',
          resourceId: settings.memory_resource_id || ''
        } : undefined,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        createdBy: agent.created_by
      };

    } finally {
      client.release();
    }
  }

  // 获取用户的所有agents
  async getUserAgents(userId: string): Promise<MastraAgentConfig[]> {
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT id FROM mastra_agents WHERE created_by = $1 ORDER BY created_at DESC
      `, [userId]);

      const agents = [];
      for (const row of result.rows) {
        const agent = await this.getAgent(row.id);
        if (agent) {
          agents.push(agent);
        }
      }

      return agents;

    } finally {
      client.release();
    }
  }

  // 更新agent配置
  async updateAgent(agentId: string, updates: Partial<MastraAgentConfig>): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 更新基本信息
      if (updates.name || updates.description || updates.aiProvider || updates.model) {
        await client.query(`
          UPDATE mastra_agents
          SET name = COALESCE($1, name),
              description = COALESCE($2, description),
              ai_provider = COALESCE($3, ai_provider),
              model = COALESCE($4, model),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [updates.name, updates.description, updates.aiProvider, updates.model, agentId]);
      }

      // 更新prompt配置
      if (updates.promptConfig) {
        await client.query(`
          UPDATE mastra_agent_prompts
          SET name = COALESCE($1, name),
              instructions = COALESCE($2, instructions),
              system_prompt = COALESCE($3, system_prompt),
              user_prompt = COALESCE($4, user_prompt)
          WHERE agent_id = $5
        `, [
          updates.promptConfig.name,
          updates.promptConfig.instructions,
          updates.promptConfig.systemPrompt,
          updates.promptConfig.userPrompt,
          agentId
        ]);
      }

      // 更新工具配置（简单替换）
      if (updates.tools) {
        await client.query('DELETE FROM mastra_agent_tools WHERE agent_id = $1', [agentId]);

        if (updates.tools.length > 0) {
          const toolValues = updates.tools.map((tool, index) =>
            `($1, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, $${index * 4 + 5})`
          ).join(',');

          const toolParams: any[] = [agentId];
          updates.tools.forEach(tool => {
            toolParams.push(tool.id, tool.name, tool.description, tool.enabled);
          });

          await client.query(`
            INSERT INTO mastra_agent_tools (agent_id, tool_id, tool_name, tool_description, enabled)
            VALUES ${toolValues}
          `, toolParams);
        }
      }

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 删除agent
  async deleteAgent(agentId: string): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 删除相关表的数据（按外键约束顺序）
      await client.query('DELETE FROM mastra_agent_tools WHERE agent_id = $1', [agentId]);
      await client.query('DELETE FROM mastra_agent_rag WHERE agent_id = $1', [agentId]);
      await client.query('DELETE FROM mastra_agent_settings WHERE agent_id = $1', [agentId]);
      await client.query('DELETE FROM mastra_agent_prompts WHERE agent_id = $1', [agentId]);
      await client.query('DELETE FROM mastra_agents WHERE id = $1', [agentId]);

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 获取可用的工具列表
  async getAvailableTools(): Promise<AgentTool[]> {
    // 这里可以返回预定义的工具列表
    // 在实际应用中，可能从配置文件或数据库中获取
    return [
      {
        id: 'web-search',
        name: '网络搜索',
        description: '搜索互联网上的信息',
        enabled: false
      },
      {
        id: 'weather-tool',
        name: '天气查询',
        description: '查询指定城市的天气信息',
        enabled: false
      },
      {
        id: 'calculator',
        name: '计算器',
        description: '执行数学计算',
        enabled: false
      },
      {
        id: 'date-time',
        name: '日期时间',
        description: '获取当前日期和时间',
        enabled: false
      },
      {
        id: 'code-executor',
        name: '代码执行器',
        description: '执行Python代码片段',
        enabled: false
      }
    ];
  }

  // 获取预定义的Prompt模板
  async getPromptTemplates(): Promise<AgentPromptConfig[]> {
    return [
      {
        id: 'assistant',
        name: '通用助手',
        instructions: '你是一个有用的AI助手，请礼貌和准确地回答用户的问题。',
        systemPrompt: '你是一个专业的AI助手，具有广泛的知识和能力。',
        userPrompt: '请帮我解决以下问题：'
      },
      {
        id: 'developer',
        name: '开发助手',
        instructions: '你是一个专业的软件开发助手，擅长代码编写、调试和技术问题解答。',
        systemPrompt: '你是一个经验丰富的软件工程师，精通多种编程语言和开发框架。',
        userPrompt: '我遇到了一个开发问题：'
      },
      {
        id: 'writer',
        name: '写作助手',
        instructions: '你是一个专业的写作助手，能够帮助用户创作各种类型的文本内容。',
        systemPrompt: '你是一个专业的写作专家，具有优秀的文字表达能力和创意思维。',
        userPrompt: '我需要你帮我写作：'
      },
      {
        id: 'analyst',
        name: '分析助手',
        instructions: '你是一个数据分析专家，能够分析数据、提供洞察和建议。',
        systemPrompt: '你是一个专业的数据分析师，擅长统计分析和商业洞察。',
        userPrompt: '请帮我分析以下数据：'
      }
    ];
  }
}

export const agentService = new AgentService();