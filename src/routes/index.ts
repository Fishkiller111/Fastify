import { FastifyInstance } from 'fastify';
import authRoutes from '../modules/auth/routes.js';
import userRoutes from '../modules/user/routes.js';
import verificationRoutes from '../modules/verification/routes.js';

/**
 * 注册所有路由
 * @param fastify Fastify实例
 */
async function registerRoutes(fastify: FastifyInstance) {
  // 注册认证路由
  fastify.register(authRoutes, { prefix: '/api/auth' });
  
  // 注册用户路由
  fastify.register(userRoutes, { prefix: '/api/user' });
  
  // 注册验证码路由
  fastify.register(verificationRoutes, { prefix: '/api/verification' });
}

export default registerRoutes;