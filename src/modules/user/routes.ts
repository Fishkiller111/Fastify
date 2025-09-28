import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserService from './service.js';
import { JwtUser } from '../../plugins/jwt.js';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

// 扩展FastifyRequest类型以包含用户信息
interface RequestWithUser extends FastifyRequest {
  user: string | object | Buffer | JwtUser;
}

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
    preHandler: async (request: RequestWithUser, reply: FastifyReply) => {
      try {
        console.log('=== JWT Authentication Started ===');
        console.log('Authorization header:', request.headers.authorization);

        // 检查Authorization头是否存在
        if (!request.headers.authorization) {
          console.error('No Authorization header found');
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Missing authorization header'
          });
        }

        // 检查Bearer格式
        if (!request.headers.authorization.startsWith('Bearer ')) {
          console.error('Invalid authorization header format');
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid authorization header format'
          });
        }

        // 提取token
        const token = request.headers.authorization.substring(7); // 移除 'Bearer ' 前缀
        console.log('Extracted token:', token);

        // 手动验证JWT token
        const decoded = jwt.verify(token, config.jwt.secret) as JwtUser;
        console.log('JWT token verified successfully. User:', decoded);

        // 将用户信息附加到请求对象
        request.user = decoded;

        console.log('=== JWT Authentication Successful ===');
      } catch (err: any) {
        console.error('JWT verification failed:', err);
        console.error('Error details:', {
          name: err?.name,
          message: err?.message
        });
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing token'
        });
      }
    }
  }, async (request: RequestWithUser, reply: FastifyReply) => {
    try {
      console.log('Received request to /api/user/me');
      // 检查用户是否已认证
      if (!request.user) {
        console.log('User not authenticated');
        return reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
      }
      
      // 检查用户信息是否为对象类型
      if (typeof request.user !== 'object' || request.user === null) {
        console.log('Invalid token payload');
        return reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token payload'
        });
      }
      
      // 从JWT载荷中获取用户ID
      const userPayload = request.user as JwtUser;
      const userId = userPayload.userId;
      
      // 检查用户ID是否存在
      if (!userId) {
        console.log('Invalid token payload: missing userId');
        return reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token payload: missing userId'
        });
      }
      
      console.log('Fetching user with ID:', userId);
      // 获取用户信息
      const user = await UserService.getUserById(userId);
      
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
}

export default userRoutes;