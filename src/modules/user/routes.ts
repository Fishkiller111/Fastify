import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserService from './service.js';
import { JwtUser } from '../../plugins/jwt.js';

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
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查用户是否已认证
      if (!request.user) {
        return reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
      }
      
      // 从JWT载荷中获取用户ID
      const userId = (request.user as JwtUser).userId;
      
      // 检查用户ID是否存在
      if (!userId) {
        return reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token payload'
        });
      }
      
      // 获取用户信息
      const user = await UserService.getUserById(userId);
      
      if (!user) {
        return reply.code(404).send({ 
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }
      
      reply.send({
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        created_at: user.created_at,
        updated_at: user.updated_at
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}

export default userRoutes;