import { FastifyInstance } from 'fastify';
import authRoutes from '../modules/auth/routes.js';
import userRoutes from '../modules/user/routes.js';
import adminUserRoutes from '../modules/user/admin-routes.js';
import verificationRoutes from '../modules/verification/routes.js';
import klineRoutes from '../modules/kline/routes.js';
import memeRoutes from '../modules/meme/routes.js';
import mainstreamRoutes from '../modules/mainstream/routes.js';
import { klineWebSocketRoute } from '../modules/kline/websocket.js';

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

  // 注册 K线数据路由
  fastify.register(klineRoutes, { prefix: '/api/kline' });

  // 注册 Meme事件合约路由
  fastify.register(memeRoutes, { prefix: '/api/meme' });

  // 注册主流币事件合约路由
  fastify.register(mainstreamRoutes, { prefix: '/api/mainstream' });

  // 注册 K线WebSocket路由
  fastify.register(klineWebSocketRoute);
}

export default registerRoutes;