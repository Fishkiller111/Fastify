import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserService from './service.js';
import { JwtUser } from '../../plugins/jwt.js';
import { UpdateUserRoleRequest } from '../auth/types.js';

// 用户信息已通过auth插件扩展到FastifyRequest中

/**
 * 用户路由
 * @param fastify Fastify实例
 */
async function userRoutes(fastify: FastifyInstance) {
  // 获取当前用户信息路由
  fastify.get('/me', {
    schema: {
      description: '获取当前用户信息',
      tags: ['用户'],
      headers: {
        type: 'object',
        properties: {
          authorization: {
            type: 'string',
            description: 'Bearer token for authentication'
          }
        },
        required: ['authorization']
      },
      response: {
        200: {
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
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.userAuth()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('Received request to /api/user/me');
      const jwtUser = (request as any).user as JwtUser;
      console.log('Fetching user with ID:', jwtUser.userId);

      // 获取用户信息
      const user = await UserService.getUserById(jwtUser.userId);
      
      if (!user) {
        console.log('User not found');
        return reply.code(404).send({ 
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }
      
      console.log('User found:', user);
      reply.send({
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        created_at: user.created_at,
        updated_at: user.updated_at
      });
    } catch (error: any) {
      console.error('Error in /api/user/me:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // 修改用户角色接口（管理员权限）
  fastify.put('/:id/role', {
    schema: {
      description: '修改用户角色',
      tags: ['用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['user', 'admin'] }
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
      const { role } = (request as any).body;

      const updatedUser = await UserService.updateUserRole(id, { role });

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
}

export default userRoutes;