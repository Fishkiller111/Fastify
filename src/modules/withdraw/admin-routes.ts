import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getConfigByKey, setConfig } from '../config/service.js';

interface SetWithdrawFeeConfigRequest {
  Body: {
    // 抽成比例，百分比 0-100，例如 5 表示 5% 抽成
    fee_rate_percent: number;
  };
}

/**
 * 提现配置管理（管理端）
 * 路由前缀在 routes/index.ts 中注册为 /api/admin/withdraw
 */
async function withdrawAdminRoutes(fastify: FastifyInstance) {
  // 获取当前提现抽成配置
  fastify.get('/config', {
    schema: {
      description: '获取提现抽成配置（fee_rate_percent，百分比 0-100）',
      tags: ['withdraw-config'],
      response: {
        200: {
          type: 'object',
          properties: {
            fee_rate_percent: { type: 'number' },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: fastify.adminAuth(['user_management']),
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const item = await getConfigByKey('withdraw_fee_rate_percent');
      const raw = item?.value ?? '0';
      const num = Number(raw);
      const fee = Number.isFinite(num) && num > 0 ? num : 0;
      return reply.send({ fee_rate_percent: fee });
    } catch (error: any) {
      console.error('获取提现抽成配置失败:', error);
      return reply.code(500).send({ error: '获取提现抽成配置失败' });
    }
  });

  // 设置提现抽成配置
  fastify.post('/config', {
    schema: {
      description: '设置提现抽成配置（fee_rate_percent，百分比 0-100）',
      tags: ['withdraw-config'],
      body: {
        type: 'object',
        required: ['fee_rate_percent'],
        properties: {
          fee_rate_percent: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: '抽成比例，百分比 0-100，例如 5 表示 5% 抽成',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            fee_rate_percent: { type: 'number' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: fastify.adminAuth(['user_management']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fee_rate_percent } = (request.body as any) as { fee_rate_percent: number };
      if (!Number.isFinite(fee_rate_percent) || fee_rate_percent < 0 || fee_rate_percent >= 100) {
        return reply.code(400).send({
          success: false,
          message: 'fee_rate_percent 必须在 0-100 之间',
        });
      }

      await setConfig({
        key: 'withdraw_fee_rate_percent',
        value: String(fee_rate_percent),
        description: '提现抽成比例（百分比 0-100）',
      });

      return reply.send({ success: true, fee_rate_percent });
    } catch (error: any) {
      console.error('设置提现抽成配置失败:', error);
      return reply.code(500).send({
        success: false,
        message: '设置提现抽成配置失败',
      });
    }
  });
}

export default withdrawAdminRoutes;
