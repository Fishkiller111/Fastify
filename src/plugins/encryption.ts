import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { encryptData } from '../utils/encryption.js';

/**
 * 加密响应插件
 * 自动加密指定路由的JSON响应
 */
export default async function encryptionPlugin(fastify: FastifyInstance) {
  // 定义需要加密的路由前缀数组
  const encryptedRoutes = [
    '/api/auth/login/wallet',
    '/api/mainstream/events',
    '/api/meme/events',
    '/api/meme/bets',
    '/api/mainstream/bets',
    '/api/kline/events'
  ];

  /**
   * 检查路由是否需要加密
   */
  function shouldEncryptRoute(path: string): boolean {
    return encryptedRoutes.some((route: string) => path.startsWith(route));
  }

  /**
   * 加密响应钩子
   */
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    try {
      // 检查是否需要加密
      if (!shouldEncryptRoute(request.url)) {
        return payload;
      }

      // 检查是否为JSON响应
      const contentType = reply.getHeader('content-type');
      if (!contentType || !contentType.toString().includes('application/json')) {
        return payload;
      }

      // 检查是否在生产环境启用加密
      const enableEncryption = process.env.NODE_ENV === 'production' ||
                               process.env.ENABLE_ENCRYPTION === 'true';

      if (!enableEncryption) {
        // 开发环境不加密，直接返回
        return payload;
      }

      // 解析响应数据
      let data: any;
      if (typeof payload === 'string') {
        data = JSON.parse(payload);
      } else {
        data = payload;
      }

      // 加密数据
      const encryptedData = encryptData(data);

      // 返回加密后的JSON字符串
      return JSON.stringify(encryptedData);
    } catch (error: any) {
      console.error('[Response Encryption Error]', {
        path: request.url,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // 加密失败时返回原始数据（生产环境应考虑返回错误）
      return payload;
    }
  });
}
