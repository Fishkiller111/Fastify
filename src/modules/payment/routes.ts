import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PaymentModule } from './index.js';
import { PaymentMethod, PaymentParams } from './types.js';
import { JwtUser } from '../../plugins/jwt.js';

async function paymentRoutes(fastify: FastifyInstance) {
  // 获取支付配置路由
  fastify.get('/config', {
    schema: {
      description: '获取支付配置',
      tags: ['支付'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string' },
              enabled: { type: 'boolean' },
              appId: { type: 'string' }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.userAuth()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await PaymentModule.getConfig();
      reply.send(config);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 获取启用的支付方式路由
  fastify.get('/methods', {
    schema: {
      description: '获取启用的支付方式',
      tags: ['支付'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const methods = await PaymentModule.getEnabledMethods();
      reply.send(methods);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 发起支付路由
  fastify.post('/pay', {
    schema: {
      description: '发起支付',
      tags: ['支付'],
      body: {
        type: 'object',
        required: ['method', 'orderId', 'amount', 'description'],
        properties: {
          method: { type: 'string', enum: ['wechat', 'alipay'] },
          orderId: { type: 'string' },
          amount: { type: 'number' },
          description: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            transactionId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.userAuth()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { method, orderId, amount, description } = (request as any).body;
      const jwtUser = (request as any).user as JwtUser;
      
      const params: PaymentParams = {
        orderId,
        amount,
        description,
        userId: jwtUser.userId
      };
      
      const result = await PaymentModule.pay(method as PaymentMethod, params);
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 查询支付状态路由
  fastify.get('/status/:transactionId', {
    schema: {
      description: '查询支付状态',
      tags: ['支付'],
      params: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' }
        },
        required: ['transactionId']
      },
      querystring: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['wechat', 'alipay'] }
        },
        required: ['method']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            transactionId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.userAuth()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { transactionId } = (request as any).params;
      const { method } = (request as any).query;
      
      const result = await PaymentModule.queryStatus(method as PaymentMethod, transactionId);
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}

export default paymentRoutes;