import { FastifyInstance, FastifyRequest } from 'fastify';
import VerificationCodeService from '../verification/service.js';

// 发送验证码请求接口
interface SendCodeRequest {
  Body: {
    phoneNumber: string;
  };
}

// 验证验证码请求接口
interface VerifyCodeRequest {
  Body: {
    phoneNumber: string;
    code: string;
  };
}

// 验证码路由
async function verificationRoutes(fastify: FastifyInstance) {
  const verificationService = VerificationCodeService;
  
  // 发送验证码
  fastify.post('/send-code', {
    schema: {
      description: '发送手机验证码',
      tags: ['verification'],
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: { type: 'string', description: '手机号码' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<SendCodeRequest>, reply) => {
    try {
      const { phoneNumber } = request.body;
      
      // 简单验证手机号格式
      if (!phoneNumber || phoneNumber.length !== 11 || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
        return reply.status(400).send({
          success: false,
          message: '手机号格式不正确'
        });
      }
      
      const result = await verificationService.sendCode(phoneNumber);
      
      if (result) {
        return reply.send({
          success: true,
          message: '验证码发送成功'
        });
      } else {
        return reply.status(500).send({
          success: false,
          message: '验证码发送失败'
        });
      }
    } catch (error) {
      console.error('发送验证码时发生错误:', error);
      return reply.status(500).send({
        success: false,
        message: '服务器内部错误'
      });
    }
  });
  
  // 验证验证码
  fastify.post('/verify-code', {
    schema: {
      description: '验证手机验证码',
      tags: ['verification'],
      body: {
        type: 'object',
        required: ['phoneNumber', 'code'],
        properties: {
          phoneNumber: { type: 'string', description: '手机号码' },
          code: { type: 'string', description: '验证码' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            valid: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<VerifyCodeRequest>, reply) => {
    try {
      const { phoneNumber, code } = request.body;
      
      // 简单验证手机号格式
      if (!phoneNumber || phoneNumber.length !== 11 || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
        return reply.status(400).send({
          success: false,
          message: '手机号格式不正确'
        });
      }
      
      // 验证验证码
      const isValid = await verificationService.verifyCode(phoneNumber, code);
      
      return reply.send({
        success: true,
        message: isValid ? '验证码正确' : '验证码错误或已过期',
        valid: isValid
      });
    } catch (error) {
      console.error('验证验证码时发生错误:', error);
      return reply.status(500).send({
        success: false,
        message: '服务器内部错误'
      });
    }
  });
}

export default verificationRoutes;