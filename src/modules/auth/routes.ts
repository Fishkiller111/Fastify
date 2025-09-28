import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegisterRequest, LoginRequest } from './types.js';
import AuthService from './service.js';

/**
 * 认证路由
 * @param fastify Fastify实例
 */
async function authRoutes(fastify: FastifyInstance) {
  // 注册路由
  fastify.post('/register', {
    schema: {
      description: '用户注册',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
    try {
      const user = await AuthService.register(request.body);
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 登录路由
  fastify.post('/login', {
    schema: {
      description: '用户登录',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                username: { type: 'string' },
                email: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    try {
      const { user, token } = await AuthService.login(request.body);
      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default authRoutes;