import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegisterRequest, LoginRequest, SMSRegisterRequest, SMSLoginRequest } from './types.js';
import AuthService from './service.js';
import { getLoginConfig, LoginMethod } from './login-config.js';

/**
 * 认证路由
 * @param fastify Fastify实例
 */
async function authRoutes(fastify: FastifyInstance) {
  // 注册路由（邮箱方式）
  fastify.post('/register/email', {
    schema: {
      description: '用户注册（邮箱方式）',
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
      const user = await AuthService.registerWithEmail(request.body);
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
  
  // 注册路由（短信方式）
  fastify.post('/register/sms', {
    schema: {
      description: '用户注册（短信方式）',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['username', 'phoneNumber', 'code'],
        properties: {
          username: { type: 'string' },
          phoneNumber: { type: 'string' },
          code: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: SMSRegisterRequest }>, reply: FastifyReply) => {
    try {
      const user = await AuthService.registerWithSMS(request.body);
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 登录路由（邮箱方式）
  fastify.post('/login/email', {
    schema: {
      description: '用户登录（邮箱方式）',
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
      const { user, token } = await AuthService.loginWithEmail(request.body);
      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
  
  // 登录路由（短信方式）
  fastify.post('/login/sms', {
    schema: {
      description: '用户登录（短信方式）',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['phoneNumber', 'code'],
        properties: {
          phoneNumber: { type: 'string' },
          code: { type: 'string' }
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
                phone_number: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: SMSLoginRequest }>, reply: FastifyReply) => {
    try {
      const { user, token } = await AuthService.loginWithSMS(request.body);
      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
  
  // 通用注册路由（根据配置选择登录方式）
  fastify.post('/register', {
    schema: {
      description: '用户注册（根据配置选择登录方式）',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' },
          phoneNumber: { type: 'string' },
          code: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: RegisterRequest | SMSRegisterRequest }>, reply: FastifyReply) => {
    try {
      const user = await AuthService.register(request.body);
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 通用登录路由（根据配置选择登录方式）
  fastify.post('/login', {
    schema: {
      description: '用户登录（根据配置选择登录方式）',
      tags: ['认证'],
      body: {
        type: 'object',
        required: [],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
          phoneNumber: { type: 'string' },
          code: { type: 'string' }
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
                phone_number: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginRequest | SMSLoginRequest }>, reply: FastifyReply) => {
    try {
      const { user, token } = await AuthService.login(request.body);
      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default authRoutes;