import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EventKlineQueryParams, KlineInterval } from './types.js';
import EventKlineService from './service.js';
import { sendEncryptedResponse } from '../../utils/response-helper.js';

/**
 * 事件赔率K线路由
 */
async function klineRoutes(fastify: FastifyInstance) {
  // 获取事件历史K线数据
  fastify.get('/events/:eventId', {
    schema: {
      description: '获取事件赔率K线数据',
      tags: ['K线'],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'number' },
        },
      },
      querystring: {
        type: 'object',
        required: ['interval'],
        properties: {
          interval: {
            type: 'string',
            enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
          },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          limit: { type: 'number' },
          source: {
            type: 'string',
            enum: ['pumpfun', 'bonk'],
            description: '来源页面：pumpfun或bonk，用于前端确定颜色方案'
          },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              event_id: { type: 'number' },
              interval: { type: 'string' },
              timestamp: { type: 'number' },
              yes_odds_open: { type: 'number' },
              yes_odds_high: { type: 'number' },
              yes_odds_low: { type: 'number' },
              yes_odds_close: { type: 'number' },
              no_odds_open: { type: 'number' },
              no_odds_high: { type: 'number' },
              no_odds_low: { type: 'number' },
              no_odds_close: { type: 'number' },
              yes_pool: { type: 'number' },
              no_pool: { type: 'number' },
              total_bets: { type: 'number' },
              source: { type: 'string', description: '来源页面标识' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const query = request.query as Omit<EventKlineQueryParams, 'event_id'> & { source?: string };

      const klines = await EventKlineService.getHistoricalKlines({
        event_id: eventId,
        ...query,
      });

      // 将source参数附加到每个K线数据项中，方便前端使用
      const klinesWithSource = klines.map(kline => ({
        ...kline,
        source: query.source || 'pumpfun' // 默认为pumpfun
      }));

      reply.send(klinesWithSource);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取事件当前实时赔率
  fastify.get('/events/:eventId/current', {
    schema: {
      description: '获取事件当前实时赔率',
      tags: ['K线'],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'number' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['pumpfun', 'bonk'],
            description: '来源页面：pumpfun或bonk，用于前端确定颜色方案'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            event_id: { type: 'number' },
            yes_odds: { type: 'number' },
            no_odds: { type: 'number' },
            yes_pool: { type: 'number' },
            no_pool: { type: 'number' },
            timestamp: { type: 'number' },
            source: { type: 'string', description: '来源页面标识' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const query = request.query as { source?: string };
      const currentOdds = await EventKlineService.getCurrentOdds(eventId);

      if (!currentOdds) {
        return reply.code(404).send({ error: '事件不存在' });
      }

      reply.send({
        ...currentOdds,
        source: query.source || 'pumpfun' // 默认为pumpfun
      });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取当前用户在事件下的买入记录
  fastify.get('/events/:eventId/buy-records', {
    schema: {
      description: '获取当前用户在指定事件下的买入记录',
      tags: ['K线'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              bet_type: { type: 'string', enum: ['yes', 'no'] },
              bet_amount: { type: 'number' },
              yes_odds_at_bet: { type: 'number' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const userId = (request as any).user.userId;
      const records = await EventKlineService.getUserBuyPoints(eventId, userId);

      reply.send(
        records.map(record => ({
          bet_type: record.bet_type,
          bet_amount: record.bet_amount,
          yes_odds_at_bet: record.yes_odds_at_bet,
          created_at: record.created_at,
        }))
      );
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // WebSocket使用文档
  fastify.get('/websocket-docs', {
    schema: {
      description: 'WebSocket实时K线使用文档',
      tags: ['K线'],
      response: {
        200: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' },
            description: { type: 'string' },
            protocol: { type: 'string' },
            connection_example: { type: 'string' },
            message_format: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                data: {
                  type: 'object',
                  properties: {
                    event_id: { type: 'number' },
                    yes_odds: { type: 'number' },
                    no_odds: { type: 'number' },
                    yes_pool: { type: 'number' },
                    no_pool: { type: 'number' },
                    timestamp: { type: 'number' },
                  },
                },
              },
            },
            features: { type: 'array', items: { type: 'string' } },
            javascript_example: { type: 'string' },
            test_page: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      endpoint: 'ws://localhost:3000/ws/kline/events/:eventId',
      description: 'WebSocket实时K线数据推送接口',
      protocol: 'WebSocket',
      connection_example: 'ws://localhost:3000/ws/kline/events/1?interval=1m&source=pumpfun',
      message_types: {
        historical: {
          description: '连接建立时推送历史赔率变化点',
          example: {
            type: 'historical',
            data: [
              {
                event_id: 1,
                yes_odds: 55.50,
                no_odds: 44.50,
                yes_pool: 1000.00,
                no_pool: 800.00,
                timestamp: 1699999999999,
                source: 'pumpfun'
              }
            ]
          }
        },
        current: {
          description: '连接建立时推送当前实时赔率',
          example: {
            type: 'current',
            data: {
              event_id: 1,
              yes_odds: 55.50,
              no_odds: 44.50,
              yes_pool: 1000.00,
              no_pool: 800.00,
              timestamp: 1699999999999,
              source: 'pumpfun'
            }
          }
        },
        odds_update: {
          description: '下注后自动推送赔率更新',
          example: {
            type: 'odds_update',
            data: {
              event_id: 1,
              yes_odds: 56.20,
              no_odds: 43.80,
              yes_pool: 1100.00,
              no_pool: 850.00,
              timestamp: 1700000000000,
              source: 'pumpfun'
            }
          }
        },
        bet_placed: {
          description: '用户下注时推送下注记录',
          example: {
            type: 'bet_placed',
            data: {
              user_id: 123,
              bet_type: 'yes',
              bet_amount: '100.00',
              odds_at_bet: '1.85',
              potential_payout: '185.00',
              timestamp: '2025-10-11T08:30:45.123Z'
            }
          }
        }
      },
      features: [
        '连接建立时推送历史赔率变化点（折线图数据）',
        '连接建立时推送当前实时赔率',
        '用户下注时实时推送下注记录',
        '下注后自动广播赔率更新',
        '支持多客户端同时订阅',
        '断线自动清理资源',
        '支持 ping/pong 心跳保持连接'
      ],
      javascript_example: `
const ws = new WebSocket('ws://localhost:3000/ws/kline/events/1?interval=1m&source=pumpfun');

ws.onopen = () => {
  console.log('WebSocket已连接');

  // 发送心跳
  setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000);
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch(message.type) {
    case 'historical':
      console.log('历史数据:', message.data);
      // 绘制折线图
      break;
    case 'current':
      console.log('当前赔率:', message.data);
      // 更新当前赔率显示
      break;
    case 'odds_update':
      console.log('赔率更新:', message.data);
      // 更新赔率UI和折线图
      break;
    case 'bet_placed':
      console.log('下注记录:', message.data);
      // 在下注列表中添加新记录
      break;
    case 'pong':
      console.log('心跳响应');
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket错误:', error);
};

ws.onclose = () => {
  console.log('WebSocket已断开');
};
      `.trim(),
      test_page: 'test-kline.html',
    });
  });
}

export default klineRoutes;
