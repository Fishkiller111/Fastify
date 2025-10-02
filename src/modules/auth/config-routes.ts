import { FastifyInstance, FastifyRequest } from 'fastify';
import { LoginMethod, getLoginConfig, setLoginMethod, setAliyunSMSConfig, validateAliyunSMSConfig } from './login-config.js';
import { getConfigByKey, getAllConfigs } from '../config/service.js';

// 设置登录方式请求接口
interface SetLoginMethodRequest {
  Body: {
    method: LoginMethod;
  };
}

// 设置阿里云短信配置请求接口
interface SetAliyunSMSConfigRequest {
  Body: {
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
  };
}

// 登录配置路由
async function loginConfigRoutes(fastify: FastifyInstance) {
  // 获取当前登录配置
  fastify.get('/config', {
    schema: {
      description: '获取当前登录配置',
      tags: ['auth-config'],
      response: {
        200: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['email', 'sms', 'both', 'wallet'] },
            aliCloudAccessKeyId: { type: 'string' },
            aliCloudAccessKeySecret: { type: 'string' },
            aliCloudSignName: { type: 'string' },
            aliCloudTemplateCode: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const config = await getLoginConfig();
      return reply.send(config);
    } catch (error) {
      console.error('获取登录配置时发生错误:', error);
      return reply.status(500).send({
        error: '服务器内部错误'
      });
    }
  });
  
  // 设置登录方式
  fastify.post('/config/method', {
    schema: {
      description: '设置登录方式',
      tags: ['auth-config'],
      body: {
        type: 'object',
        required: ['method'],
        properties: {
          method: { type: 'string', enum: ['email', 'sms', 'both', 'wallet'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<SetLoginMethodRequest>, reply) => {
    try {
      const { method } = request.body;
      
      // 验证登录方式
      if (method !== LoginMethod.EMAIL && method !== LoginMethod.SMS && method !== LoginMethod.BOTH && method !== LoginMethod.WALLET) {
        return reply.status(400).send({
          success: false,
          message: '无效的登录方式'
        });
      }

      // 如果设置为短信登录或两种都需要，检查阿里云配置是否完整
      if (method === LoginMethod.SMS || method === LoginMethod.BOTH) {
        const isConfigValid = await validateAliyunSMSConfig();
        if (!isConfigValid) {
          return reply.status(400).send({
            success: false,
            message: '短信登录配置不完整，请先配置阿里云短信服务'
          });
        }
      }
      
      await setLoginMethod(method);
      
      return reply.send({
        success: true,
        message: `登录方式已设置为: ${method}`
      });
    } catch (error) {
      console.error('设置登录方式时发生错误:', error);
      return reply.status(500).send({
        success: false,
        message: '服务器内部错误'
      });
    }
  });
  
  // 设置阿里云短信配置
  fastify.post('/config/aliyun-sms', {
    schema: {
      description: '设置阿里云短信服务配置',
      tags: ['auth-config'],
      body: {
        type: 'object',
        required: ['accessKeyId', 'accessKeySecret', 'signName', 'templateCode'],
        properties: {
          accessKeyId: { type: 'string' },
          accessKeySecret: { type: 'string' },
          signName: { type: 'string' },
          templateCode: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<SetAliyunSMSConfigRequest>, reply) => {
    try {
      const { accessKeyId, accessKeySecret, signName, templateCode } = request.body;
      
      await setAliyunSMSConfig({
        accessKeyId,
        accessKeySecret,
        signName,
        templateCode
      });
      
      return reply.send({
        success: true,
        message: '阿里云短信服务配置已保存'
      });
    } catch (error) {
      console.error('设置阿里云短信配置时发生错误:', error);
      return reply.status(500).send({
        success: false,
        message: '服务器内部错误'
      });
    }
  });
  
  // 获取所有配置项（仅用于调试）
  fastify.get('/config/all', {
    schema: {
      description: '获取所有配置项（仅用于调试）',
      tags: ['auth-config'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              key: { type: 'string' },
              value: { type: 'string' },
              description: { type: 'string' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const configs = await getAllConfigs();
      return reply.send(configs);
    } catch (error) {
      console.error('获取所有配置时发生错误:', error);
      return reply.status(500).send({
        error: '服务器内部错误'
      });
    }
  });
}

export default loginConfigRoutes;
