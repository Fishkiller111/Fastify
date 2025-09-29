import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { sessionService } from './session-service.js';
import { agentService } from './agent-service.js';
import { mastraService } from './mastra-service.js';
import type {
  CreateSessionRequest,
  UpdateSessionRequest,
  SendMessageRequest,
  StreamChunk,
  MastraAgentConfig
} from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId?: number;
}

// JWT验证中间件
async function verifyJWT(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: '缺少或无效的Authorization头' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    request.userId = decoded.userId;
  } catch (error) {
    return reply.code(401).send({ error: 'Token无效或已过期' });
  }
}

export default async function sessionRoutes(fastify: FastifyInstance) {
  // 创建新会话
  fastify.post('/sessions', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '创建新的Agent会话',
      description: '为指定的Agent创建一个新的聊天会话',
      body: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' },
          title: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            agentId: { type: 'string' },
            userId: { type: 'number' },
            title: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const body = request.body as CreateSessionRequest;

      const session = await sessionService.createSession(userId, body);

      reply.code(201).send({
        id: session.id,
        agentId: session.agentId,
        userId: session.userId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString()
      });
    } catch (error: any) {
      if (error.message === 'Agent不存在或无权限访问') {
        reply.code(400).send({ error: error.message });
      } else {
        reply.code(500).send({ error: '创建会话失败' });
      }
    }
  });

  // 获取用户的所有会话
  fastify.get('/sessions', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '获取用户的所有会话',
      description: '获取当前用户的所有Agent会话列表，可按Agent ID筛选',
      querystring: {
        type: 'object',
        properties: {
          agentId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              agentId: { type: 'string' },
              userId: { type: 'number' },
              title: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { agentId } = request.query as { agentId?: string };

      const sessions = await sessionService.getUserSessions(userId, agentId);

      reply.send(sessions.map(session => ({
        id: session.id,
        agentId: session.agentId,
        userId: session.userId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString()
      })));
    } catch (error) {
      reply.code(500).send({ error: '获取会话列表失败' });
    }
  });

  // 获取单个会话详情
  fastify.get('/sessions/:sessionId', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '获取会话详情',
      description: '获取指定会话的详细信息',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            agentId: { type: 'string' },
            userId: { type: 'number' },
            title: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { sessionId } = request.params as { sessionId: string };

      const session = await sessionService.getSession(sessionId, userId);

      if (!session) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      reply.send({
        id: session.id,
        agentId: session.agentId,
        userId: session.userId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString()
      });
    } catch (error) {
      reply.code(500).send({ error: '获取会话详情失败' });
    }
  });

  // 更新会话
  fastify.put('/sessions/:sessionId', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '更新会话信息',
      description: '更新指定会话的标题或状态',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['active', 'archived', 'deleted'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            agentId: { type: 'string' },
            userId: { type: 'number' },
            title: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as UpdateSessionRequest;

      const session = await sessionService.updateSession(sessionId, userId, body);

      if (!session) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      reply.send({
        id: session.id,
        agentId: session.agentId,
        userId: session.userId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString()
      });
    } catch (error) {
      reply.code(500).send({ error: '更新会话失败' });
    }
  });

  // 删除会话
  fastify.delete('/sessions/:sessionId', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '删除会话',
      description: '软删除指定的会话（标记为已删除状态）',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' }
        }
      },
      response: {
        204: {},
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { sessionId } = request.params as { sessionId: string };

      const deleted = await sessionService.deleteSession(sessionId, userId);

      if (!deleted) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      reply.code(204).send();
    } catch (error) {
      reply.code(500).send({ error: '删除会话失败' });
    }
  });

  // 获取会话的消息历史
  fastify.get('/sessions/:sessionId/messages', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: '获取会话消息历史',
      description: '获取指定会话的聊天消息记录，支持分页',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              sessionId: { type: 'string' },
              role: { type: 'string' },
              content: { type: 'string' },
              metadata: { type: 'object' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { sessionId } = request.params as { sessionId: string };
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

      const messages = await sessionService.getSessionMessages(sessionId, userId, limit, offset);

      reply.send(messages.map(message => ({
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString()
      })));
    } catch (error: any) {
      if (error.message === '会话不存在或无权限访问') {
        reply.code(404).send({ error: error.message });
      } else {
        reply.code(500).send({ error: '获取消息历史失败' });
      }
    }
  });

  // Streaming聊天接口
  fastify.post('/sessions/:sessionId/chat', {
    preHandler: verifyJWT,
    schema: {
      tags: ['ai-session'],
      summary: 'Streaming聊天接口',
      description: '与Agent进行实时流式对话，返回Server-Sent Events格式的响应',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          metadata: { type: 'object' }
        }
      },
      response: {
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as SendMessageRequest;

      // 验证会话是否存在且属于该用户
      const session = await sessionService.getSession(sessionId, userId);
      if (!session) {
        return reply.code(404).send({ error: '会话不存在' });
      }

      // 获取agent配置
      const agent = await agentService.getAgent(session.agentId);
      if (!agent) {
        return reply.code(404).send({ error: 'Agent不存在' });
      }

      // 设置streaming响应头
      reply.type('text/plain; charset=utf-8');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      reply.header('Access-Control-Allow-Origin', '*');

      // 保存用户消息到数据库
      await sessionService.addMessage(sessionId, userId, {
        ...body,
        role: 'user'
      });

      // 开始streaming响应
      reply.hijack();

      const stream = reply.raw;

      // 发送初始化消息
      const initChunk: StreamChunk = {
        id: `msg_${Date.now()}`,
        type: 'message',
        content: '正在处理您的消息...',
        metadata: { status: 'processing' }
      };
      stream.write(`data: ${JSON.stringify(initChunk)}\n\n`);

      try {
        // 使用Mastra服务进行实际的Agent交互
        const mastraAgent = await mastraService.createAgent(agent);
        const streamIterator = await mastraService.streamChat(mastraAgent, body.content, {
          sessionId,
          temperature: agent.modelSettings.temperature,
          maxTokens: agent.modelSettings.maxTokens
        });

        let finalContent = '';
        let finalMetadata: any = {};

        // 处理streaming响应
        for await (const chunk of streamIterator) {
          stream.write(`data: ${JSON.stringify(chunk)}\n\n`);

          // 记录最终内容和元数据
          if (chunk.type === 'done') {
            finalContent = chunk.content || '';
            finalMetadata = chunk.metadata || {};
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error || 'Agent响应错误');
          }
        }

        // 保存助手消息到数据库
        if (finalContent) {
          await sessionService.addMessage(sessionId, userId, {
            content: finalContent,
            role: 'assistant',
            metadata: finalMetadata
          });
        }

      } catch (error: any) {
        console.error('Agent response error:', error);

        const errorChunk: StreamChunk = {
          id: `error_${Date.now()}`,
          type: 'error',
          error: '抱歉，处理您的消息时出现了错误。请稍后重试。',
          metadata: { error: error.message }
        };
        stream.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      }

      // 结束stream
      stream.end();

    } catch (error: any) {
      if (error.message === '会话不存在或无权限访问') {
        reply.code(404).send({ error: error.message });
      } else {
        reply.code(500).send({ error: '发送消息失败' });
      }
    }
  });
}