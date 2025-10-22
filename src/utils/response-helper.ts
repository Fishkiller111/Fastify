import { FastifyReply } from 'fastify';
import { encryptData } from './encryption.js';

/**
 * 安全响应助手 - 修复序列化问题
 */

export function sendEncryptedResponse(reply: FastifyReply, data: any, statusCode: number = 200) {
  const enableEncryption =
    process.env.ENABLE_ENCRYPTION === 'true';

  console.log(`[响应助手] 发送加密响应, 启用加密: ${enableEncryption}`);
  console.log(`[响应助手] 原始数据类型: ${typeof data}`);

  if (enableEncryption) {
    try {
      console.log(`[响应助手] 开始加密数据...`);
      const encryptedData = encryptData(data);
      console.log(`[响应助手] ✅ 加密成功`);
      console.log(`[响应助手] 加密后数据字段: ciphertext=${encryptedData.ciphertext.length}字符, iv=${encryptedData.iv}, authTag=${encryptedData.authTag}`);
      
      // 重要：确保响应被正确序列化
      const responseBody = JSON.stringify(encryptedData);
      console.log(`[响应助手] 序列化后大小: ${responseBody.length} 字节`);
      console.log(`[响应助手] 发送加密响应到客户端...`);
      
      // 设置正确的 Content-Type 和发送响应
      reply.type('application/json');
      return reply.code(statusCode).send(responseBody);
    } catch (error: any) {
      console.error(`[响应助手] ❌ 加密失败:`, error.message);
      console.error(`[响应助手] 错误堆栈:`, error.stack);
      return reply.code(statusCode).send(data);
    }
  }

  // 未启用加密，返回原始数据
  console.log(`[响应助手] 加密未启用，发送原始数据`);
  return reply.code(statusCode).send(data);
}

export default {
  sendEncryptedResponse
};