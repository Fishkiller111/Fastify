import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { AgentService } from './agent-service.js';
import { MastraAgentConfig, AgentTool, AgentPromptConfig } from './types.js';

// 验证JWT token的助手函数
async function verifyToken(request: FastifyRequest): Promise<{ userId: string } | null> {
  try {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }

    const token = authorization.replace('Bearer ', '');
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
    return { userId: decoded.userId };
  } catch (error) {
    return null;
  }
}

// 请求体类型定义
interface CreateAgentRequest {
  name: string;
  description?: string;
  aiProvider: 'openai' | 'claude' | 'openrouter';
  model: string;
  promptConfig: {
    name: string;
    instructions: string;
    systemPrompt?: string;
    userPrompt?: string;
  };
  tools: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
  }>;
  ragConfig: {
    type: 'none' | 'vector' | 'embedding' | 'custom';
    enabled: boolean;
    vectorStore?: {
      provider: string;
      apiKey: string;
      indexName: string;
    };
    embeddingModel?: {
      provider: 'openai' | 'claude' | 'openrouter';
      model: string;
    };
  };
  modelSettings: {
    temperature: number;
    maxTokens: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  };
  memory?: {
    enabled: boolean;
    threadId?: string;
    resourceId?: string;
  };
}

interface UpdateAgentRequest {
  name?: string;
  description?: string;
  aiProvider?: 'openai' | 'claude' | 'openrouter';
  model?: string;
  promptConfig?: {
    name?: string;
    instructions?: string;
    systemPrompt?: string;
    userPrompt?: string;
  };
  tools?: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
  }>;
  modelSettings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  };
  memory?: {
    enabled?: boolean;
    threadId?: string;
    resourceId?: string;
  };
}

export default async function agentRoutes(fastify: FastifyInstance) {
  const agentService = new AgentService();

  // 创建自定义agent
  fastify.post<{ Body: CreateAgentRequest }>('/agents', {
    schema: {
      description: '创建自定义AI Agent',
      tags: ['AI Agent'],
      body: {
        type: 'object',
        required: ['name', 'aiProvider', 'model', 'promptConfig', 'tools', 'ragConfig', 'modelSettings'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          aiProvider: { type: 'string', enum: ['openai', 'claude', 'openrouter'] },
          model: { type: 'string' },
          promptConfig: {
            type: 'object',
            required: ['name', 'instructions'],
            properties: {
              name: { type: 'string' },
              instructions: { type: 'string' },
              systemPrompt: { type: 'string' },
              userPrompt: { type: 'string' }
            }
          },
          tools: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'description', 'enabled'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                enabled: { type: 'boolean' }
              }
            }
          },
          ragConfig: {
            type: 'object',
            required: ['type', 'enabled'],
            properties: {
              type: { type: 'string', enum: ['none', 'vector', 'embedding', 'custom'] },
              enabled: { type: 'boolean' },
              vectorStore: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  apiKey: { type: 'string' },
                  indexName: { type: 'string' }
                }
              },
              embeddingModel: {
                type: 'object',
                properties: {
                  provider: { type: 'string', enum: ['openai', 'claude', 'openrouter'] },
                  model: { type: 'string' }
                }
              }
            }
          },
          modelSettings: {
            type: 'object',
            required: ['temperature', 'maxTokens'],
            properties: {
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              maxTokens: { type: 'number', minimum: 1, maximum: 10000 },
              topP: { type: 'number', minimum: 0, maximum: 1 },
              topK: { type: 'number', minimum: 1 },
              presencePenalty: { type: 'number', minimum: -1, maximum: 1 },
              frequencyPenalty: { type: 'number', minimum: -1, maximum: 1 }
            }
          },
          memory: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              threadId: { type: 'string' },
              resourceId: { type: 'string' }
            }
          }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                aiProvider: { type: 'string' },
                model: { type: 'string' },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      const user = await verifyToken(request);
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
      (request as any).user = user;
    }
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const agentData = {
        ...request.body,
        promptConfig: {
          id: '', // 将在服务中生成
          ...request.body.promptConfig
        },
        createdBy: user.userId
      };

      const agent = await agentService.createAgent(agentData);

      return reply.code(201).send({
        success: true,
        data: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          aiProvider: agent.aiProvider,
          model: agent.model,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt
        }
      });

    } catch (error) {
      console.error('Create agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to create agent'
      });
    }
  });

  // 获取用户的所有agents
  fastify.get('/agents', {
    schema: {
      description: '获取用户的所有AI Agents',
      tags: ['AI Agent'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  aiProvider: { type: 'string' },
                  model: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      const user = await verifyToken(request);
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
      (request as any).user = user;
    }
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const agents = await agentService.getUserAgents(user.userId);

      const simplifiedAgents = agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        aiProvider: agent.aiProvider,
        model: agent.model,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt
      }));

      return reply.send({
        success: true,
        data: simplifiedAgents
      });

    } catch (error) {
      console.error('Get agents error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to get agents'
      });
    }
  });

  // 获取指定agent的详细配置
  fastify.get<{ Params: { agentId: string } }>('/agents/:agentId', {
    schema: {
      description: '获取指定AI Agent的详细配置',
      tags: ['AI Agent'],
      params: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' }
        }
      }
    },
    preHandler: async (request, reply) => {
      const user = await verifyToken(request);
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
      (request as any).user = user;
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params;
      const agent = await agentService.getAgent(agentId);

      if (!agent) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Agent not found'
        });
      }

      // 检查权限：确保agent属于当前用户
      const user = (request as any).user;
      if (agent.createdBy !== user.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      return reply.send({
        success: true,
        data: agent
      });

    } catch (error) {
      console.error('Get agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to get agent'
      });
    }
  });

  // 更新agent配置
  fastify.put<{
    Params: { agentId: string };
    Body: UpdateAgentRequest;
  }>('/agents/:agentId', {
    schema: {
      description: '更新AI Agent配置',
      tags: ['AI Agent'],
      params: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' }
        }
      }
    },
    preHandler: async (request, reply) => {
      const user = await verifyToken(request);
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
      (request as any).user = user;
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params;
      const user = (request as any).user;

      // 先检查agent是否存在且属于当前用户
      const existingAgent = await agentService.getAgent(agentId);
      if (!existingAgent) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Agent not found'
        });
      }

      if (existingAgent.createdBy !== user.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      const success = await agentService.updateAgent(agentId, request.body as any);

      if (success) {
        const updatedAgent = await agentService.getAgent(agentId);
        return reply.send({
          success: true,
          data: updatedAgent
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to update agent'
        });
      }

    } catch (error) {
      console.error('Update agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to update agent'
      });
    }
  });

  // 删除agent
  fastify.delete<{ Params: { agentId: string } }>('/agents/:agentId', {
    schema: {
      description: '删除AI Agent',
      tags: ['AI Agent'],
      params: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' }
        }
      }
    },
    preHandler: async (request, reply) => {
      const user = await verifyToken(request);
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
      (request as any).user = user;
    }
  }, async (request, reply) => {
    try {
      const { agentId } = request.params;
      const user = (request as any).user;

      // 先检查agent是否存在且属于当前用户
      const existingAgent = await agentService.getAgent(agentId);
      if (!existingAgent) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Agent not found'
        });
      }

      if (existingAgent.createdBy !== user.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      const success = await agentService.deleteAgent(agentId);

      if (success) {
        return reply.send({
          success: true,
          message: 'Agent deleted successfully'
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to delete agent'
        });
      }

    } catch (error) {
      console.error('Delete agent error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to delete agent'
      });
    }
  });

  // 获取可用工具列表
  fastify.get('/agents/tools/available', {
    schema: {
      description: '获取可用的Agent工具列表',
      tags: ['AI Agent']
    }
  }, async (request, reply) => {
    try {
      const tools = await agentService.getAvailableTools();
      return reply.send({
        success: true,
        data: tools
      });
    } catch (error) {
      console.error('Get available tools error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to get available tools'
      });
    }
  });

  // 获取Prompt模板列表
  fastify.get('/agents/prompts/templates', {
    schema: {
      description: '获取预定义的Prompt模板列表',
      tags: ['AI Agent']
    }
  }, async (request, reply) => {
    try {
      const templates = await agentService.getPromptTemplates();
      return reply.send({
        success: true,
        data: templates
      });
    } catch (error) {
      console.error('Get prompt templates error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to get prompt templates'
      });
    }
  });
}