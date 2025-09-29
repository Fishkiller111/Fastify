import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SafeUser, CreateUserRequest, UpdateUserRequest, UserListQuery, PaginatedResponse } from '../auth/types.js';
import userService from './service.js';

/**
 * 管理端用户路由
 */
async function adminUserRoutes(fastify: FastifyInstance) {

  // 获取用户列表
  fastify.get('/', {
    schema: {
      description: '获取用户列表',
      tags: ['管理端用户管理'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
          search: { type: 'string' },
          sortBy: { type: 'string', enum: ['id', 'username', 'email', 'created_at'], default: 'created_at' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  username: { type: 'string' },
                  email: { type: 'string' },
                  phone_number: { type: 'string' },
                  role: { type: 'string' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  status: { type: 'string' },
                  last_login_at: { type: 'string' },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' }
              }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await userService.getUserList((request as any).query);
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 获取单个用户信息
  fastify.get('/:id', {
    schema: {
      description: '获取用户详细信息',
      tags: ['管理端用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string' },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            },
            status: { type: 'string' },
            last_login_at: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      const user = await userService.getSafeUserById(id);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }

      reply.send(user);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 创建用户
  fastify.post('/', {
    schema: {
      description: '创建新用户',
      tags: ['管理端用户管理'],
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
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            },
            status: { type: 'string' },
            last_login_at: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await userService.createUser((request as any).body);
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 更新用户信息
  fastify.put('/:id', {
    schema: {
      description: '更新用户信息',
      tags: ['管理端用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string' },
          phone_number: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string' },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            },
            status: { type: 'string' },
            last_login_at: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      const updatedUser = await userService.updateUser(id, (request as any).body);

      if (!updatedUser) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }

      reply.send(updatedUser);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 删除用户
  fastify.delete('/:id', {
    schema: {
      description: '删除用户',
      tags: ['管理端用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      const success = await userService.deleteUser(id);

      if (!success) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }

      reply.send({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}

export default adminUserRoutes;