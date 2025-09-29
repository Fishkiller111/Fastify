import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import config from '../config/index.js';

// 扩展FastifyInstance类型以包含authenticate方法和jwt实例
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// 定义JWT用户类型
export interface JwtUser {
  userId: number;
  username: string;
  role: string;
}

/**
 * 注册JWT插件
 * @param fastify Fastify实例
 */
async function jwtPlugin(fastify: FastifyInstance) {
  // 注册JWT插件
  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn
    }
  });

  console.log('JWT plugin registered successfully');

  // 添加装饰器用于验证JWT
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      console.log('=== JWT Authentication Started ===');
      console.log('Authorization header:', request.headers.authorization);

      // 检查Authorization头是否存在
      if (!request.headers.authorization) {
        console.error('No Authorization header found');
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing authorization header'
        });
        return;
      }

      // 检查Bearer格式
      if (!request.headers.authorization.startsWith('Bearer ')) {
        console.error('Invalid authorization header format');
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid authorization header format'
        });
        return;
      }

      // 提取token
      const token = request.headers.authorization.substring(7); // 移除 'Bearer ' 前缀
      console.log('Extracted token:', token);

      // 手动验证JWT token
      const decoded = fastify.jwt.verify(token);
      console.log('JWT token verified successfully. User:', decoded);

      // 将用户信息附加到请求对象
      request.user = decoded;

      console.log('=== JWT Authentication Successful ===');
      // request.user现在包含了JWT解码后的载荷
    } catch (err: any) {
      console.error('JWT verification failed:', err);
      console.error('Error details:', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack
      });
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing token'
      });
    }
  });
}

export default jwtPlugin;