import { FastifyInstance } from 'fastify';
import { SafeUser, CreateUserRequest, UpdateUserRequest, UserListQuery, PaginatedResponse } from '../auth/types.js';
import userService from './service.js';

/**
 * 管理端用户路由
 */
async function adminUserRoutes(fastify: FastifyInstance) {

  // 获取用户列表
  fastify.get<{
    Querystring: UserListQuery,
    Reply: PaginatedResponse<SafeUser> | { success: false, message: string }
  }>('/users', {
    schema: {
      description: '获取用户列表',
      tags: ['管理端 - 用户管理'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1, description: '页码' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10, description: '每页条数' },
          search: { type: 'string', description: '搜索关键词（用户名、邮箱、手机号）' },
          sortBy: {
            type: 'string',
            enum: ['id', 'username', 'email', 'created_at'],
            default: 'created_at',
            description: '排序字段'
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: '排序方向'
          }
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
                  id: { type: 'integer' },
                  username: { type: 'string' },
                  email: { type: 'string' },
                  phone_number: { type: ['string', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await userService.getUserList(request.query);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '获取用户列表失败'
      });
    }
  });

  // 获取用户详情
  fastify.get<{
    Params: { id: string },
    Reply: SafeUser | { success: false, message: string }
  }>('/users/:id', {
    schema: {
      description: '获取用户详情',
      tags: ['管理端 - 用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[1-9]\\d*$', description: '用户ID' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        404: {
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
      const userId = parseInt(request.params.id);
      const user = await userService.getSafeUserById(userId);

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: '用户不存在'
        });
      }

      return reply.send(user);
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '获取用户详情失败'
      });
    }
  });

  // 创建用户
  fastify.post<{
    Body: CreateUserRequest,
    Reply: SafeUser | { success: false, message: string }
  }>('/users', {
    schema: {
      description: '创建用户',
      tags: ['管理端 - 用户管理'],
      body: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 2,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_\\u4e00-\\u9fa5]+$',
            description: '用户名（2-50个字符，支持中文、英文、数字、下划线）'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 100,
            description: '邮箱地址'
          },
          password: {
            type: 'string',
            minLength: 6,
            maxLength: 50,
            description: '密码（6-50个字符）'
          },
          phone_number: {
            type: 'string',
            pattern: '^[1-9]\\d{10}$',
            description: '手机号（11位数字）'
          }
        },
        required: ['username', 'email', 'password']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        400: {
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
      const user = await userService.createUser(request.body);
      return reply.status(201).send(user);
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        message: error.message || '创建用户失败'
      });
    }
  });

  // 更新用户
  fastify.put<{
    Params: { id: string },
    Body: UpdateUserRequest,
    Reply: SafeUser | { success: false, message: string }
  }>('/users/:id', {
    schema: {
      description: '更新用户',
      tags: ['管理端 - 用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[1-9]\\d*$', description: '用户ID' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 2,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_\\u4e00-\\u9fa5]+$',
            description: '用户名（2-50个字符，支持中文、英文、数字、下划线）'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 100,
            description: '邮箱地址'
          },
          password: {
            type: 'string',
            minLength: 6,
            maxLength: 50,
            description: '密码（6-50个字符）'
          },
          phone_number: {
            type: ['string', 'null'],
            pattern: '^[1-9]\\d{10}$',
            description: '手机号（11位数字，传null可清空）'
          }
        },
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        404: {
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
      const userId = parseInt(request.params.id);
      const user = await userService.updateUser(userId, request.body);

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: '用户不存在'
        });
      }

      return reply.send(user);
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        message: error.message || '更新用户失败'
      });
    }
  });

  // 删除用户
  fastify.delete<{
    Params: { id: string },
    Reply: { success: boolean, message: string }
  }>('/users/:id', {
    schema: {
      description: '删除用户',
      tags: ['管理端 - 用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[1-9]\\d*$', description: '用户ID' }
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
        },
        404: {
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
      const userId = parseInt(request.params.id);
      const deleted = await userService.deleteUser(userId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          message: '用户不存在'
        });
      }

      return reply.send({
        success: true,
        message: '用户删除成功'
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '删除用户失败'
      });
    }
  });

  // 检查用户名是否存在
  fastify.get<{
    Querystring: { username: string, excludeId?: string },
    Reply: { exists: boolean } | { success: false, message: string }
  }>('/users/check/username', {
    schema: {
      description: '检查用户名是否存在',
      tags: ['管理端 - 用户管理'],
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string', description: '用户名' },
          excludeId: { type: 'string', description: '排除的用户ID（更新时使用）' }
        },
        required: ['username']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, excludeId } = request.query;
      const exists = await userService.isUsernameExists(username, excludeId ? parseInt(excludeId) : undefined);

      return reply.send({ exists });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '检查用户名失败'
      });
    }
  });

  // 检查邮箱是否存在
  fastify.get<{
    Querystring: { email: string, excludeId?: string },
    Reply: { exists: boolean } | { success: false, message: string }
  }>('/users/check/email', {
    schema: {
      description: '检查邮箱是否存在',
      tags: ['管理端 - 用户管理'],
      querystring: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', description: '邮箱' },
          excludeId: { type: 'string', description: '排除的用户ID（更新时使用）' }
        },
        required: ['email']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, excludeId } = request.query;
      const exists = await userService.isEmailExists(email, excludeId ? parseInt(excludeId) : undefined);

      return reply.send({ exists });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '检查邮箱失败'
      });
    }
  });

  // 检查手机号是否存在
  fastify.get<{
    Querystring: { phone_number: string, excludeId?: string },
    Reply: { exists: boolean } | { success: false, message: string }
  }>('/users/check/phone', {
    schema: {
      description: '检查手机号是否存在',
      tags: ['管理端 - 用户管理'],
      querystring: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', description: '手机号' },
          excludeId: { type: 'string', description: '排除的用户ID（更新时使用）' }
        },
        required: ['phone_number']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { phone_number, excludeId } = request.query;
      const exists = await userService.isPhoneNumberExists(phone_number, excludeId ? parseInt(excludeId) : undefined);

      return reply.send({ exists });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: '检查手机号失败'
      });
    }
  });
}

export default adminUserRoutes;