import { FastifyInstance } from 'fastify';
import authRoutes from '../modules/auth/routes.js';
import userRoutes from '../modules/user/routes.js';
import adminUserRoutes from '../modules/user/admin-routes.js';
import verificationRoutes from '../modules/verification/routes.js';
import userProductRoutes from '../modules/product/user-routes.js';
import adminProductRoutes from '../modules/product/admin-routes.js';
import userStoreRoutes from '../modules/store/user-routes.js';
import adminStoreRoutes from '../modules/store/admin-routes.js';
import storageRoutes from '../modules/storage/routes.js';

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

  // 注册用户端商品路由
  fastify.register(userProductRoutes, { prefix: '/api/products' });

  // 注册管理端商品路由
  fastify.register(adminProductRoutes, { prefix: '/api/admin/products' });

  // 注册用户端店铺路由
  fastify.register(userStoreRoutes, { prefix: '/api/stores' });

  // 注册管理端店铺路由
  fastify.register(adminStoreRoutes, { prefix: '/api/admin/stores' });

  // 注册存储管理路由
  fastify.register(storageRoutes, { prefix: '/api/admin/storage' });
}

export default registerRoutes;