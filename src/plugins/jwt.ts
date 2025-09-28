import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import config from '../config/index.js';

// 扩展FastifyInstance类型以包含authenticate方法和jwt实例
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * 注册JWT插件
 * @param fastify Fastify实例
 */
async function jwtPlugin(fastify: FastifyInstance) {
  // 注册JWT插件
  fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  // 等待插件注册完成
  fastify.addHook('onReady', async () => {
    console.log('JWT plugin registered successfully');
  });

  // 添加装饰器用于验证JWT
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
}

export default jwtPlugin;