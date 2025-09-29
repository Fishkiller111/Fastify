import { FastifyInstance } from 'fastify';
import authRoutes from '../modules/auth/routes.js';
import userRoutes from '../modules/user/routes.js';
import adminUserRoutes from '../modules/user/admin-routes.js';
import verificationRoutes from '../modules/verification/routes.js';
import aiRoutes from '../modules/ai/routes.js';

/**
 * 注册所有路由
 * @param fastify Fastify实例
 */
async function registerRoutes(fastify: FastifyInstance) {
  // 注册用户认证路由
  fastify.register(authRoutes, { prefix: '/api/auth' });

  // 注册用户路由
  fastify.register(userRoutes, { prefix: '/api/user' });

  // 注册管理端用户管理路由
  fastify.register(adminUserRoutes, { prefix: '/api/admin/users' });

  // 注册验证码路由
  fastify.register(verificationRoutes, { prefix: '/api/verification' });

  // 注册AI服务路由
  fastify.register(aiRoutes, { prefix: '/api/ai' });
}

export default registerRoutes;