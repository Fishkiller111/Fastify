import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  BuyAmountRequest,
  SellAmountRequest,
  CalculateBuyRequest,
  CalculateSellRequest,
} from './amm-types.js';
import * as AMMService from './amm-service.js';

/**
 * AMM (自动做市商) 路由
 * 提供买入/卖出 amount 的接口
 */
async function ammRoutes(fastify: FastifyInstance) {
  // 计算买入预览
  fastify.post('/calculate-buy', {
    schema: {
      description: '计算买入预览（不执行交易）',
      tags: ['AMM'],
      body: {
        type: 'object',
        required: ['event_id', 'side', 'spend_amount'],
        properties: {
          event_id: { type: 'number', description: '事件ID' },
          side: { type: 'string', enum: ['yes', 'no'], description: '买入方向' },
          spend_amount: { type: 'number', description: '愿意花费的金额' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            amount_to_receive: { type: 'number', description: '将获得的份额' },
            average_price: { type: 'string', description: '平均价格' },
            current_odds: { type: 'string', description: '当前赔率' },
            price_impact: { type: 'string', description: '价格影响(%)' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CalculateBuyRequest;
      const result = await AMMService.calculateBuy(body);
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 计算卖出预览
  fastify.post('/calculate-sell', {
    schema: {
      description: '计算卖出预览（不执行交易）',
      tags: ['AMM'],
      body: {
        type: 'object',
        required: ['event_id', 'side', 'amount_to_sell'],
        properties: {
          event_id: { type: 'number', description: '事件ID' },
          side: { type: 'string', enum: ['yes', 'no'], description: '卖出方向' },
          amount_to_sell: { type: 'number', description: '要卖出的份额数量' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            return_amount: { type: 'string', description: '将获得的金额' },
            average_price: { type: 'string', description: '平均价格' },
            current_odds: { type: 'string', description: '当前赔率' },
            price_impact: { type: 'string', description: '价格影响(%)' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CalculateSellRequest;
      const result = await AMMService.calculateSell(body);
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 买入 amount
  fastify.post('/buy', {
    schema: {
      description: '买入 amount 份额',
      tags: ['AMM'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id', 'side', 'spend_amount'],
        properties: {
          event_id: { type: 'number', description: '事件ID' },
          side: { type: 'string', enum: ['yes', 'no'], description: '买入方向' },
          spend_amount: { type: 'number', description: '愿意花费的金额' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            transaction_id: { type: 'number' },
            event_id: { type: 'number' },
            side: { type: 'string' },
            amount_purchased: { type: 'number', description: '购买到的份额' },
            cost: { type: 'string', description: '实际花费' },
            current_odds: { type: 'string', description: '当前赔率' },
            average_price: { type: 'string', description: '平均成交价' },
            position: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                event_id: { type: 'number' },
                user_id: { type: 'number' },
                yes_amount: { type: 'number' },
                no_amount: { type: 'number' },
                total_invested: { type: 'string' },
                total_returned: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const body = request.body as BuyAmountRequest;
      const result = await AMMService.buyAmount(userId, body);
      reply.code(201).send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 卖出 amount
  fastify.post('/sell', {
    schema: {
      description: '卖出 amount 份额',
      tags: ['AMM'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id', 'side', 'amount_to_sell'],
        properties: {
          event_id: { type: 'number', description: '事件ID' },
          side: { type: 'string', enum: ['yes', 'no'], description: '卖出方向' },
          amount_to_sell: { type: 'number', description: '要卖出的份额数量' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            transaction_id: { type: 'number' },
            event_id: { type: 'number' },
            side: { type: 'string' },
            amount_sold: { type: 'number', description: '卖出的份额' },
            return_amount: { type: 'string', description: '收回的金额' },
            current_odds: { type: 'string', description: '当前赔率' },
            average_price: { type: 'string', description: '平均成交价' },
            position: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                event_id: { type: 'number' },
                user_id: { type: 'number' },
                yes_amount: { type: 'number' },
                no_amount: { type: 'number' },
                total_invested: { type: 'string' },
                total_returned: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const body = request.body as SellAmountRequest;
      const result = await AMMService.sellAmount(userId, body);
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取用户持仓
  fastify.get('/positions', {
    schema: {
      description: '获取当前用户的所有持仓（包含事件详情）',
      tags: ['AMM'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              event_id: { type: 'number' },
              user_id: { type: 'number' },
              yes_amount: { type: 'number' },
              no_amount: { type: 'number' },
              total_invested: { type: 'string' },
              total_returned: { type: 'string' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
              event: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: '事件类型 (pumpfun/bonk/Mainstream)' },
                  contract_address: { type: 'string' },
                  token_name: { type: 'string', description: '代币名称' },
                  status: { type: 'string' },
                  yes_pool: { type: 'string' },
                  no_pool: { type: 'string' },
                  yes_odds: { type: 'string' },
                  no_odds: { type: 'string' },
                  deadline: { type: 'string' },
                  settled_at: { type: 'string' },
                  creator_side: { type: 'string' },
                  big_coin: {
                    type: 'object',
                    description: 'Mainstream事件的币种信息',
                    properties: {
                      id: { type: 'number' },
                      symbol: { type: 'string' },
                      name: { type: 'string' },
                      icon_url: { type: 'string' },
                    },
                  },
                  future_price: { type: 'string', description: 'Mainstream事件的目标价格' },
                  current_price: { type: 'string', description: 'Mainstream事件的当前价格' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { limit = 20, offset = 0 } = request.query as any;
      const positions = await AMMService.getUserPositions(userId, limit, offset);
      reply.send(positions);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取事件的持仓人列表（公共）
  fastify.get('/event/:event_id/holders', {
    schema: {
      description: '获取某个事件合约的持仓人及相关信息（公共接口）',
      tags: ['AMM'],
      params: {
        type: 'object',
        required: ['event_id'],
        properties: {
          event_id: { type: 'number', description: '事件ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              user_id: { type: 'number' },
              username: { type: 'string' },
              wallet_address: { type: 'string', nullable: true },
              yes_amount: { type: 'number' },
              no_amount: { type: 'number' },
              total_invested: { type: 'string' },
              total_returned: { type: 'string' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { event_id } = request.params as any;
      const { limit = 100, offset = 0 } = request.query as any;
      const holders = await AMMService.getEventHolders(Number(event_id), Number(limit), Number(offset));
      reply.send(holders);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取交易历史
  fastify.get('/transactions', {
    schema: {
      description: '获取当前用户的交易历史',
      tags: ['AMM'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          event_id: { type: 'number', description: '可选：筛选特定事件的交易' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              event_id: { type: 'number' },
              user_id: { type: 'number' },
              transaction_type: { type: 'string', enum: ['buy', 'sell', 'settle'] },
              side: { type: 'string', enum: ['yes', 'no'] },
              amount_delta: { type: 'number' },
              cost_or_return: { type: 'string' },
              odds_at_transaction: { type: 'string' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { event_id, limit = 50, offset = 0 } = request.query as any;
      const transactions = await AMMService.getTransactions(userId, event_id, limit, offset);
      reply.send(transactions);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default ammRoutes;
