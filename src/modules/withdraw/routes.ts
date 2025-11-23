import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import WithdrawService from './service.js';
import type {
  CreateWithdrawApplyRequest,
  WithdrawGatewayNotifyRequest,
} from './types.js';

/**
 * 提现相关路由
 *
 * 最终路径：
 * - 用户申请提现：POST /api/user/withdraw/apply
 * - 提现结果回调：POST /api/user/withdraw/notify
 * - 查询提现状态：GET  /api/user/withdraw/status?order_id=...
 * - 取消提现：    POST /api/user/withdraw/cancel
 */
export default async function withdrawRoutes(fastify: FastifyInstance) {
  /**
   * 用户发起提现申请
   * 前端：POST /api/user/withdraw/apply
   * 说明：抽成比例由后台配置决定，前端只需要传入用户期望扣减的总金额 amount
   */
  fastify.post(
    '/apply',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description:
          '用户发起提现申请（本地记录 + 调用 BEpusdt /api/v1/withdraw/create，抽成比例由后台配置决定）',
        tags: ['Withdraw'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: {
              type: 'number',
              description: '提现金额（代币数量，例如 10.5 USDT）',
            },
            trade_type: {
              type: 'string',
              description: '提现代币类型，例如 usdt.polygon，不传则使用默认配置',
            },
            address: {
              type: 'string',
              description: '提现收款地址，如不传则使用用户绑定的钱包地址',
            },
            timeout: {
              type: 'integer',
              description: '提现单过期时间（秒），不传则使用默认配置',
              minimum: 60,
            },
            daily_limit: {
              type: 'number',
              description: '（可选）覆盖该用户今日提现限额（代币数量），<=0 则使用网关默认',
            },
          },
        },
        response: {
          201: {
            description: '提现申请创建成功',
            type: 'object',
            properties: {
              order_id: { type: 'string', description: '商户提现订单号' },
              withdraw_id: { type: 'string', description: 'BEpusdt 提现ID（WithdrawId）' },
              amount: { type: 'string', description: '用户最终实际到账金额（代币数量）' },
              trade_type: { type: 'string', description: '提现代币类型' },
              address: { type: 'string', description: '用户收款地址' },
              status: { type: 'string', description: '本地提现状态，初始为 pending' },
              expired_at: { type: 'number', description: '订单过期时间（时间戳秒）' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: CreateWithdrawApplyRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = (request as any).user.userId as number;
        if (!userId) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: '用户未登录',
          });
        }

        const body = request.body;
        if (!body || body.amount <= 0) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: '提现金额必须大于 0',
          });
        }

        const result = await WithdrawService.applyWithdraw(userId, body);
        return reply.code(201).send(result);
      } catch (error: any) {
        console.error('创建提现申请失败:', error);
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error?.message || '创建提现申请失败',
        });
      }
    },
  );

  /**
   * 提现结果回调接口（notify_url）
   * BEpusdt 在提现完成或失败时回调此接口
   */
  fastify.post(
    '/notify',
    {
      schema: {
        description: 'BEpusdt 提现结果回调（notify_url）',
        tags: ['Withdraw'],
        body: {
          type: 'object',
          required: ['trade_id', 'order_id', 'actual_amount', 'token', 'signature', 'status'],
          properties: {
            trade_id: { type: 'string' },
            order_id: { type: 'string' },
            amount: { type: 'number', description: '回调中通常为 0' },
            actual_amount: {
              oneOf: [
                { type: 'number' },
                { type: 'string' },
              ],
              description: '实际提现代币数量',
            },
            token: { type: 'string', description: '用户收款地址' },
            block_transaction_id: {
              type: 'string',
              description: '链上交易哈希',
            },
            signature: { type: 'string' },
            status: {
              type: 'integer',
              description: '2: 提现成功，3: 提现失败/取消',
              enum: [2, 3],
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: WithdrawGatewayNotifyRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        await WithdrawService.handleGatewayNotify(request.body);
        // 与充值回调保持一致：HTTP 200 + 文本 "ok" 视为成功
        return reply.code(200).type('text/plain').send('ok');
      } catch (error: any) {
        console.error('处理提现回调失败:', error);

        const message = error?.message || '处理提现回调失败';
        const statusCode =
          message === 'INVALID_SIGNATURE' ? 400 :
          message === 'WITHDRAW_ORDER_NOT_FOUND' ? 404 : 400;

        return reply.code(statusCode).send({
          statusCode,
          error: 'Bad Request',
          message,
        });
      }
    },
  );

  /**
   * 查询当前用户的提现状态
   * GET /api/user/withdraw/status?order_id=...
   */
  fastify.get(
    '/status',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '查询当前用户的提现订单状态（基于本地 withdraw_orders 表）',
        tags: ['Withdraw'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['order_id'],
          properties: {
            order_id: { type: 'string', description: '商户提现订单号' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user.userId as number;
        const { order_id } = request.query as any;

        if (!order_id) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'order_id 为必填参数',
          });
        }

        const result = await WithdrawService.getWithdrawStatus(userId, {
          order_id: String(order_id),
        });
        return reply.code(200).send(result);
      } catch (error: any) {
        console.error('查询提现状态失败:', error);

        const message = error?.message || '查询提现状态失败';
        let statusCode = 400;
        if (message === 'WITHDRAW_ORDER_NOT_FOUND') statusCode = 404;
        else if (message === 'FORBIDDEN') statusCode = 403;

        return reply.code(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Bad Request',
          message,
        });
      }
    },
  );

  /**
   * 取消提现订单
   * 前端：POST /api/user/withdraw/cancel
   */
  fastify.post(
    '/cancel',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '取消当前用户的 pending 提现订单（本地标记为 cancelled，并调用 BEpusdt 撤销）',
        tags: ['Withdraw'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['order_id'],
          properties: {
            order_id: { type: 'string', description: '商户提现订单号' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user.userId as number;
        const { order_id } = (request.body as any) ?? {};

        if (!order_id) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'order_id 为必填参数',
          });
        }

        const result = await WithdrawService.cancelWithdraw(userId, String(order_id));
        return reply.code(200).send(result);
      } catch (error: any) {
        console.error('取消提现订单失败:', error);

        const message = error?.message || '取消提现订单失败';
        let statusCode = 400;
        if (message === 'WITHDRAW_ORDER_NOT_FOUND') statusCode = 404;
        else if (message === 'FORBIDDEN') statusCode = 403;

        return reply.code(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Bad Request',
          message,
        });
      }
    },
  );
}
