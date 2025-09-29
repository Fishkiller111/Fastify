import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { aiService } from './service.js';
import { aiConfigService } from './config-service.js';
import { AIRequest, ChatMessage, AIProvider } from './types.js';

// JWT令牌验证中间件
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        message: '需要提供Bearer token'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret) as any;

    if (!decoded.userId) {
      return reply.status(401).send({
        success: false,
        message: '无效的令牌格式'
      });
    }

    // 将用户信息添加到请求对象
    (request as any).user = { userId: decoded.userId };
  } catch (error: any) {
    return reply.status(401).send({
      success: false,
      message: '令牌验证失败'
    });
  }
}

// 聊天请求接口
interface ChatRequestBody {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// 简单补全请求接口
interface CompleteRequestBody {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

// 配置更新请求接口
interface UpdateProviderBody {
  provider: AIProvider;
}

interface UpdateOpenAIConfigBody {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface UpdateClaudeConfigBody {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface UpdateOpenRouterConfigBody {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface UpdateAIParamsBody {
  maxTokens?: number;
  temperature?: number;
}

// AI路由注册
export default async function aiRoutes(fastify: FastifyInstance) {
  // 聊天接口
  fastify.post<{ Body: ChatRequestBody }>('/chat', {
    preHandler: authenticate,
    schema: {
      description: 'AI聊天对话',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                content: { type: 'string' }
              }
            }
          },
          maxTokens: { type: 'number', minimum: 1, maximum: 4096 },
          temperature: { type: 'number', minimum: 0, maximum: 2 },
          model: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                model: { type: 'string' },
                provider: { type: 'string' },
                usage: {
                  type: 'object',
                  properties: {
                    promptTokens: { type: 'number' },
                    completionTokens: { type: 'number' },
                    totalTokens: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { messages, maxTokens, temperature, model } = request.body;

      // 验证消息格式
      if (!Array.isArray(messages) || messages.length === 0) {
        return reply.status(400).send({
          success: false,
          message: '消息列表不能为空'
        });
      }

      const aiRequest: AIRequest = {
        messages,
        maxTokens,
        temperature,
        model
      };

      const response = await aiService.chat(aiRequest);

      return reply.send({
        success: true,
        data: response
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 简单文本补全接口
  fastify.post<{ Body: CompleteRequestBody }>('/complete', {
    preHandler: authenticate,
    schema: {
      description: 'AI文本补全',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          maxTokens: { type: 'number', minimum: 1, maximum: 4096 },
          temperature: { type: 'number', minimum: 0, maximum: 2 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                content: { type: 'string' }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { prompt, maxTokens, temperature } = request.body;

      const content = await aiService.complete(prompt, { maxTokens, temperature });

      return reply.send({
        success: true,
        data: { content }
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 获取AI状态信息
  fastify.get('/status', {
    preHandler: authenticate,
    schema: {
      description: '获取当前AI状态信息',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                model: { type: 'string' },
                baseUrl: { type: 'string' },
                maxTokens: { type: 'number' },
                temperature: { type: 'number' },
                status: { type: 'string' },
                timestamp: { type: 'string' }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const config = await aiConfigService.getAIConfig();
      const provider = config.provider;

      let currentConfig: any = {};
      switch (provider) {
        case 'openai':
          currentConfig = config.openai;
          break;
        case 'claude':
          currentConfig = config.claude;
          break;
        case 'openrouter':
          currentConfig = config.openrouter;
          break;
      }

      const status = {
        provider,
        model: currentConfig.model,
        baseUrl: currentConfig.baseUrl,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        status: '运行中',
        timestamp: new Date().toISOString()
      };

      console.log(`📊 AI状态查询 - 提供商: ${provider.toUpperCase()} | 模型: ${currentConfig.model}`);

      return reply.send({
        success: true,
        data: status
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 测试AI连接
  fastify.get('/test', {
    preHandler: authenticate,
    schema: {
      description: '测试AI服务连接',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                provider: { type: 'string' },
                model: { type: 'string' },
                error: { type: 'string' }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const testResult = await aiService.testConnection();

      return reply.send({
        success: true,
        data: testResult
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 获取AI配置
  fastify.get('/config', {
    preHandler: authenticate,
    schema: {
      description: '获取AI配置',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                maxTokens: { type: 'number' },
                temperature: { type: 'number' },
                openai: {
                  type: 'object',
                  properties: {
                    model: { type: 'string' },
                    baseUrl: { type: 'string' }
                  }
                },
                claude: {
                  type: 'object',
                  properties: {
                    model: { type: 'string' },
                    baseUrl: { type: 'string' }
                  }
                },
                openrouter: {
                  type: 'object',
                  properties: {
                    model: { type: 'string' },
                    baseUrl: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const config = await aiConfigService.getAIConfig();

      // 不返回API密钥等敏感信息
      const safeConfig = {
        provider: config.provider,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        openai: {
          model: config.openai.model,
          baseUrl: config.openai.baseUrl
        },
        claude: {
          model: config.claude.model,
          baseUrl: config.claude.baseUrl
        },
        openrouter: {
          model: config.openrouter.model,
          baseUrl: config.openrouter.baseUrl
        }
      };

      return reply.send({
        success: true,
        data: safeConfig
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 设置AI提供商
  fastify.put<{ Body: UpdateProviderBody }>('/config/provider', {
    preHandler: authenticate,
    schema: {
      description: '设置AI提供商',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', enum: ['openai', 'claude', 'openrouter'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { provider } = request.body;
      await aiConfigService.setProvider(provider);

      return reply.send({
        success: true,
        message: '提供商设置成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 设置OpenAI配置
  fastify.put<{ Body: UpdateOpenAIConfigBody }>('/config/openai', {
    preHandler: authenticate,
    schema: {
      description: '设置OpenAI配置',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          model: { type: 'string' },
          baseUrl: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await aiConfigService.setOpenAIConfig(request.body);

      return reply.send({
        success: true,
        message: 'OpenAI配置更新成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 设置Claude配置
  fastify.put<{ Body: UpdateClaudeConfigBody }>('/config/claude', {
    preHandler: authenticate,
    schema: {
      description: '设置Claude配置',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          model: { type: 'string' },
          baseUrl: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await aiConfigService.setClaudeConfig(request.body);

      return reply.send({
        success: true,
        message: 'Claude配置更新成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 设置OpenRouter配置
  fastify.put<{ Body: UpdateOpenRouterConfigBody }>('/config/openrouter', {
    preHandler: authenticate,
    schema: {
      description: '设置OpenRouter配置',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          model: { type: 'string' },
          baseUrl: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await aiConfigService.setOpenRouterConfig(request.body);

      return reply.send({
        success: true,
        message: 'OpenRouter配置更新成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // 设置AI通用参数
  fastify.put<{ Body: UpdateAIParamsBody }>('/config/params', {
    preHandler: authenticate,
    schema: {
      description: '设置AI通用参数',
      tags: ['AI'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          maxTokens: { type: 'number', minimum: 1, maximum: 4096 },
          temperature: { type: 'number', minimum: 0, maximum: 2 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await aiConfigService.setAIParams(request.body);

      return reply.send({
        success: true,
        message: 'AI参数更新成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
}