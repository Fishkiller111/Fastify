import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import OrderService from './service.js';
import type { CreateRechargeOrderRequest, GatewayNotifyRequest } from './types.js';

/**
 * 充值订单相关路由
 */
export default async function orderRoutes(fastify: FastifyInstance) {
  /**
   * 创建充值订单
   * 前端：POST /api/order/create
   */
  fastify.post(
    '/create',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '创建充值订单（本地订单 + 支付网关 create-transaction）',
        tags: ['Order', 'Recharge'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: {
              type: 'number',
              description: '充值金额，单位 CNY，保留两位小数',
            },
            description: {
              type: 'string',
              description: '订单描述或商品名称',
            },
            trade_type: {
              type: 'string',
              description: '支付通道类型，例如 usdt.trc20，默认为配置值',
            },
            timeout: {
              type: 'integer',
              description: '订单超时时间（秒），最低 60 秒，不传则使用默认配置',
              minimum: 60,
            },
          },
        },
        response: {
          201: {
            description: '创建成功，返回收银台地址等信息',
            type: 'object',
            properties: {
              order_id: { type: 'string', description: '商户订单号' },
              trade_id: { type: 'string', description: '支付网关交易ID' },
              amount: { type: 'string', description: '请求支付金额（CNY）' },
              actual_amount: {
                type: 'string',
                description: '实际支付金额（USDT / TRX）',
              },
              payment_url: {
                type: 'string',
                description: '收银台地址，前端可直接跳转或嵌入 iframe',
              },
              expiration_time: {
                type: 'number',
                description: '订单有效期（秒）',
              },
              status: {
                type: 'string',
                description: '本地订单状态（初始为 unpaid）',
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: CreateRechargeOrderRequest }>,
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
        if (body.amount <= 0) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: '充值金额必须大于 0',
          });
        }

        const result = await OrderService.createRechargeOrder(userId, body);
        return reply.code(201).send(result);
      } catch (error: any) {
        console.error('创建充值订单失败:', error);
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error?.message || '创建充值订单失败',
        });
      }
    },
  );

  /**
   * 支付网关回调接口（notify_url）
   * BEpusdt 在支付状态变化时回调此接口
   * 建议将 PAYMENT_NOTIFY_URL 配置为此路由的完整 URL，例如：https://your-domain.com/api/order/notify
   */
  fastify.post(
    '/notify',
    {
      schema: {
        description: '支付网关回调通知（BEpusdt notify_url）',
        tags: ['Order', 'Recharge'],
        body: {
          type: 'object',
          required: ['trade_id', 'order_id', 'amount', 'actual_amount', 'token', 'signature', 'status'],
          properties: {
            trade_id: { type: 'string' },
            order_id: { type: 'string' },
            amount: { type: 'number', description: '请求支付金额（CNY）' },
            actual_amount: { type: 'number', description: '实际支付金额（USDT / TRX）' },
            token: { type: 'string', description: '收款地址' },
            block_transaction_id: { type: 'string' },
            signature: { type: 'string' },
            status: {
              type: 'integer',
              description: '1:等待支付  2:支付成功  3:支付超时',
              enum: [1, 2, 3],
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: GatewayNotifyRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        await OrderService.handleGatewayNotify(request.body);
        // 按照 docs 要求，支付成功回调时返回 200 且正文为 "ok" 即视为成功
        return reply.code(200).type('text/plain').send('ok');
      } catch (error: any) {
        console.error('处理支付回调失败:', error);

        const message = error?.message || '处理支付回调失败';
        const statusCode =
          message === 'INVALID_SIGNATURE' ? 400 :
          message === 'ORDER_NOT_FOUND' ? 404 : 400;

        return reply.code(statusCode).send({
          statusCode,
          error: 'Bad Request',
          message,
        });
      }
    },
  );

  /**
   * 订单状态查询
   * GET /api/order/status?order_id=...
   * 用于 redirect_url 页面根据 order_id 查询当前订单状态
   */
  fastify.get(
    '/status',
    {
      preHandler: (fastify as any).userAuth(),
      schema: {
        description: '查询当前用户的充值订单状态',
        tags: ['Order', 'Recharge'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['order_id'],
          properties: {
            order_id: { type: 'string', description: '商户订单号' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              order_id: { type: 'string' },
              trade_id: { type: 'string', nullable: true },
              amount_cny: { type: 'string' },
              actual_amount: { type: 'string', nullable: true },
              status: { type: 'string' },
              payment_url: { type: 'string', nullable: true },
              timeout_seconds: { type: 'number', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
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

        const result = await OrderService.getOrderStatus(userId, String(order_id));
        return reply.code(200).send(result);
      } catch (error: any) {
        console.error('查询订单状态失败:', error);

        const message = error?.message || '查询订单状态失败';
        let statusCode = 400;
        if (message === 'ORDER_NOT_FOUND') statusCode = 404;
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
