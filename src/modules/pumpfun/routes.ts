/**
 * PumpFun 代币创建路由
 */

import { FastifyInstance } from 'fastify';
import { PumpFunService } from './service.js';
import type { CreateTokenRequest } from './types.js';

export default async function pumpfunRoutes(fastify: FastifyInstance) {
  /**
   * 创建 PumpFun 代币
   * POST /api/pumpfun/create
   */
  fastify.post(
    '/create',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '创建 PumpFun 代币',
        tags: ['PumpFun'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['walletPrivateKey', 'tokenMetadata', 'initialBuyAmount'],
          properties: {
            walletPrivateKey: {
              type: 'string',
              description: '钱包私钥 (Base58 编码)',
            },
            tokenMetadata: {
              type: 'object',
              required: ['name', 'symbol', 'description'],
              properties: {
                name: { type: 'string', description: '代币名称' },
                symbol: { type: 'string', description: '代币符号' },
                description: { type: 'string', description: '代币描述' },
                twitter: { type: 'string', description: 'Twitter 链接' },
                telegram: { type: 'string', description: 'Telegram 链接' },
                website: { type: 'string', description: '网站链接' },
                showName: { type: 'boolean', description: '是否显示名称', default: true },
              },
            },
            imageUrl: {
              type: 'string',
              description: '代币图片 URL',
            },
            initialBuyAmount: {
              type: 'number',
              description: '初始购买金额 (SOL)',
              minimum: 0.001,
            },
            slippage: {
              type: 'number',
              description: '滑点容忍度 (%)',
              default: 10,
              minimum: 0,
              maximum: 100,
            },
            priorityFee: {
              type: 'number',
              description: '优先费用 (SOL)',
              default: 0.0005,
              minimum: 0,
            },
          },
        },
        response: {
          200: {
            description: '成功响应',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              signature: { type: 'string' },
              txUrl: { type: 'string' },
              mintAddress: { type: 'string' },
              error: { type: 'string' },
            },
          },
          400: {
            description: '请求参数错误',
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: '未授权',
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as CreateTokenRequest;

        // 验证私钥格式
        if (!PumpFunService.validatePrivateKey(body.walletPrivateKey)) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: '无效的钱包私钥格式',
          });
        }

        // 验证初始购买金额
        if (body.initialBuyAmount < 0.001) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: '初始购买金额必须至少为 0.001 SOL',
          });
        }

        // 创建代币
        const result = await PumpFunService.createToken(body);

        if (result.success) {
          return reply.code(200).send(result);
        } else {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Token Creation Failed',
            message: result.error || '代币创建失败',
          });
        }
      } catch (error) {
        console.error('创建代币错误:', error);
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error instanceof Error ? error.message : '服务器内部错误',
        });
      }
    }
  );

  /**
   * 验证钱包私钥
   * POST /api/pumpfun/validate-key
   */
  fastify.post(
    '/validate-key',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '验证钱包私钥格式',
        tags: ['PumpFun'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['privateKey'],
          properties: {
            privateKey: {
              type: 'string',
              description: '钱包私钥 (Base58 编码)',
            },
          },
        },
        response: {
          200: {
            description: '验证结果',
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { privateKey } = request.body as { privateKey: string };

        const isValid = PumpFunService.validatePrivateKey(privateKey);

        return reply.code(200).send({
          valid: isValid,
          message: isValid ? '私钥格式有效' : '私钥格式无效',
        });
      } catch (error) {
        console.error('验证私钥错误:', error);
        return reply.code(200).send({
          valid: false,
          message: '验证失败',
        });
      }
    }
  );
}
