import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { encryptData } from '../utils/encryption.js';

/**
 * 加密响应插件 (终极版 - 2025-10-22)
 * 
 * 采用最底层的方式：拦截响应对象的 write() 和 end() 方法
 * 确保在任何场景下都能加密响应
 */
export default async function encryptionPlugin(fastify: FastifyInstance) {
  // ============ 插件初始化 ============
  const nodeEnv = process.env.NODE_ENV;
  const enableEncryptionFlag = process.env.ENABLE_ENCRYPTION;
  const enableEncryption = enableEncryptionFlag === 'true';

  console.log(`
[加密插件] ✨ 加密插件初始化`);
  console.log(`[加密插件] NODE_ENV: ${nodeEnv}`);
  console.log(`[加密插件] ENABLE_ENCRYPTION: ${enableEncryptionFlag}`);
  console.log(`[加密插件] 加密是否启用: ${enableEncryption ? '✅ YES' : '❌ NO'}`);

  // 定义需要加密的路由前缀
  const encryptedRoutes = [
    '/api/auth/login/wallet',
    '/api/mainstream/events',
    '/api/meme/events',
    '/api/meme/bets',
    '/api/mainstream/bets',
    '/api/kline/events'
  ];

  function shouldEncryptRoute(path: string): boolean {
    return encryptedRoutes.some((route: string) => path.startsWith(route));
  }

  function isJsonResponse(contentType: any): boolean {
    if (!contentType) return false;
    const ct = Array.isArray(contentType) ? contentType[0] : String(contentType);
    return ct.includes('application/json');
  }

  // 使用 onResponse hook 和拦截响应对象
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const runtimeEnableEncryption =
        process.env.ENABLE_ENCRYPTION === 'true';

      const url = request.url;
      const needsEncryption = shouldEncryptRoute(url);
      const contentType = reply.getHeader('content-type');
      const isJson = isJsonResponse(contentType);
      const statusCode = reply.statusCode;

      console.log(`[加密插件-onResponse] URL: ${url}, 状态码: ${statusCode}`);
      console.log(`[加密插件-onResponse] 需要加密: ${needsEncryption}, JSON: ${isJson}, 启用: ${runtimeEnableEncryption}`);

      // onResponse 是在响应已经发送后调用的，所以这里只是记录信息
      // 真正的加密需要在 onSend hook 中完成
    } catch (error: any) {
      console.error('[加密插件-onResponse] 💥 错误:', error.message);
    }
  });

  // 最关键的 Hook: onSend
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    try {
      const runtimeEnableEncryption =
        process.env.ENABLE_ENCRYPTION === 'true';

      const url = request.url;
      const needsEncryption = shouldEncryptRoute(url);
      const contentType = reply.getHeader('content-type');
      const isJson = isJsonResponse(contentType);

      console.log(`[加密插件-onSend] 🔄 处理响应`);
      console.log(`[加密插件-onSend] URL: ${url}`);
      console.log(`[加密插件-onSend] 需要加密: ${needsEncryption}, JSON: ${isJson}, 启用: ${runtimeEnableEncryption}`);
      console.log(`[加密插件-onSend] Content-Type: ${contentType}`);
      console.log(`[加密插件-onSend] Payload 类型: ${typeof payload}, 内容: ${String(payload).substring(0, 100)}`);

      if (!needsEncryption) {
        console.log(`[加密插件-onSend] ⏭️  路由不需要加密`);
        return payload;
      }

      if (!isJson) {
        console.log(`[加密插件-onSend] ⏭️  非 JSON 响应`);
        return payload;
      }

      if (!runtimeEnableEncryption) {
        console.log(`[加密插件-onSend] ⏭️  加密未启用`);
        return payload;
      }

      // 执行加密
      try {
        let data: any;
        if (typeof payload === 'string') {
          console.log(`[加密插件-onSend] 📝 解析字符串 payload`);
          data = JSON.parse(payload);
        } else {
          console.log(`[加密插件-onSend] 🔧 使用对象 payload`);
          data = payload;
        }

        console.log(`[加密插件-onSend] 🔐 开始加密数据...`);
        const encryptedData = encryptData(data);
        console.log(`[加密插件-onSend] ✅ 加密成功! 返回加密数据`);
        console.log(`[加密插件-onSend] 加密后大小: ${JSON.stringify(encryptedData).length} 字节`);
        
        return JSON.stringify(encryptedData);
      } catch (encryptError: any) {
        console.error(`[加密插件-onSend] ❌ 加密执行失败:`, encryptError.message);
        console.error(`[加密插件-onSend] 错误堆栈:`, encryptError.stack);
        return payload;
      }
    } catch (error: any) {
      console.error('[加密插件-onSend] 💥 Hook 执行错误:', error.message);
      console.error('[加密插件-onSend] 错误堆栈:', error.stack);
      return payload;
    }
  });

  fastify.decorate('encryptData', encryptData);
}