import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserService from './service.js';

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
          authorization: { type: 'string' }
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
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 在实际应用中，这里需要从JWT载荷中获取用户ID
      // 为简化起见，我们返回一个模拟的用户对象
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      reply.send(user);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}

export default userRoutes;