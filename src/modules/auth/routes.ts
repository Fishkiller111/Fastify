import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegisterRequest, LoginRequest, SMSRegisterRequest, SMSLoginRequest, WalletLoginRequest, CreateUserRequest } from './types.js';
import AuthService from './service.js';
import { getLoginConfig, LoginMethod } from './login-config.js';
import loginConfigRoutes from './config-routes.js';
import UserService from '../user/service.js';
import { sendEncryptedResponse } from '../../utils/response-helper.js';

/**
 * 认证路由
 * @param fastify Fastify实例
 */
async function authRoutes(fastify: FastifyInstance) {
  // 注册登录配置路由
  fastify.register(loginConfigRoutes);
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
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
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
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
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
                wallet_address: { type: 'string', nullable: true },
                balance: { type: 'string', nullable: true },
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
                wallet_address: { type: 'string', nullable: true },
                balance: { type: 'string', nullable: true },
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

  // 登录路由（钱包方式）
  fastify.post('/login/wallet', {
    schema: {
      description: '用户登录（钱包方式）',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['walletAddress'],
        properties: {
          walletAddress: { type: 'string' },
          referralCode: { type: 'string' }
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
                phone_number: { type: 'string', nullable: true },
                wallet_address: { type: 'string' },
                balance: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: WalletLoginRequest }>, reply: FastifyReply) => {
    try {
      const { user, token } = await AuthService.loginWithWallet(request.body);
      sendEncryptedResponse(reply, { user, token });
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
        required: [],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' },
          phoneNumber: { type: 'string' },
          code: { type: 'string' },
          walletAddress: { type: 'string' },
          balance: { type: 'string' }
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
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: RegisterRequest | SMSRegisterRequest | WalletLoginRequest }>, reply: FastifyReply) => {
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
                wallet_address: { type: 'string', nullable: true },
                balance: { type: 'string', nullable: true },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginRequest | SMSLoginRequest | WalletLoginRequest }>, reply: FastifyReply) => {
    try {
      const { user, token } = await AuthService.login(request.body);
      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 管理员注册接口（无需鉴权）
  fastify.post('/admin/register', {
    schema: {
      description: '管理员注册',
      tags: ['管理员认证'],
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' },
          phone_number: { type: 'string' }
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
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            },
            status: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateUserRequest }>, reply: FastifyReply) => {
    try {
      const admin = await UserService.createAdmin(request.body);
      reply.code(201).send(admin);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 管理员登录接口（与普通登录功能相同，仅用于区分）
  fastify.post('/admin/login', {
    schema: {
      description: '管理员登录',
      tags: ['管理员认证'],
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
                phone_number: { type: 'string' },
                wallet_address: { type: 'string', nullable: true },
                balance: { type: 'string', nullable: true },
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
                status: { type: 'string' },
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

      // 验证用户是否为管理员
      if (user.role !== 'admin') {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only administrators can use this login endpoint'
        });
      }

      reply.send({ user, token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default authRoutes;
