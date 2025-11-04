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

  // 公共：获取事件详情（Meme/主流币 通用）
  fastify.get('/events/:eventId/detail', {
    schema: {
      description: '公共：获取事件详情（同时支持 Meme 与主流币事件）。pumpfun/bonk 将返回外盘发射判定结果：is_launched 与 launch_condition。',
      tags: ['K线'],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: { eventId: { type: 'number' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            creator_id: { type: 'number' },
            type: { type: 'string' },
            contract_address: { type: 'string', nullable: true },
            creator_side: { type: 'string' },
            initial_pool_amount: { type: 'string' },
            initial_amount: { type: 'number', nullable: true },
            matching_slide: { type: 'number', nullable: true },
            pending_match_timeout: { type: 'number', nullable: true },
            yes_pool: { type: 'string' },
            no_pool: { type: 'string' },
            yes_amount: { type: 'number', nullable: true },
            no_amount: { type: 'number', nullable: true },
            yes_odds: { type: 'string' },
            no_odds: { type: 'string' },
            total_yes_bets: { type: 'number' },
            total_no_bets: { type: 'number' },
            status: { type: 'string' },
            deadline: { type: 'string' },
            settled_at: { type: 'string', nullable: true },
            token_name: { type: 'string', nullable: true },
            is_launched: { type: 'boolean', nullable: true, description: 'pumpfun/bonk 专用：是否发射到外盘（判定结果）。Mainstream 为 null' },
            launch_condition: { type: 'string', nullable: true, description: 'pumpfun/bonk 的外盘发射判断条件说明：pumpfun=pumpswap为成功/pumpfun为失败；bonk=raydium为成功/launchlab为失败' },
            big_coin: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'number' },
                symbol: { type: 'string' },
                name: { type: 'string' },
                chain: { type: 'string' },
                icon_url: { type: 'string', nullable: true },
              },
            },
            "Predicted Price": { type: 'string', nullable: true, description: '预测价格（原 future_price）' },
            current_price: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const detail = await EventKlineService.getEventDetail(Number(eventId));
      if (!detail) return reply.code(404).send({ error: '事件不存在' });
      reply.send(detail);
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

  // 公共：主流币事件预测方向（根据预测价格与当前价格比较）
  fastify.get('/events/:eventId/prediction-direction', {
    schema: {
      description: '公共：主流币事件预测方向（up/down/flat）。仅适配 Mainstream，Meme 事件不适配。',
      tags: ['K线'],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: { eventId: { type: 'number' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            event_id: { type: 'number' },
            type: { type: 'string', enum: ['Mainstream'] },
            predicted_price: { type: 'string', description: '事件设置的预测价格' },
            current_price: { type: 'string', description: 'DexScreener 实时价格' },
            direction: { type: 'string', enum: ['up', 'down', 'flat'], description: 'predicted vs current：高=up，低=down，相等=flat' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const data = await EventKlineService.getPredictionDirection(Number(eventId));
      if (!data) return reply.code(404).send({ error: '事件不存在' });
      reply.send(data);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 公共：获取事件结束倒计时
  fastify.get('/events/:eventId/countdown', {
    schema: {
      description: '公共：获取事件结束倒计时（精度毫秒，包含天/时/分/秒拆分）',
      tags: ['K线'],
      params: {
        type: 'object',
        required: ['eventId'],
        properties: { eventId: { type: 'number' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            event_id: { type: 'number' },
            status: { type: 'string', description: '事件状态 active/settled/cancelled 等' },
            deadline: { type: 'string', description: '事件截止时间 ISO 字符串' },
            server_time: { type: 'string', description: '服务器当前时间 ISO 字符串' },
            ended: { type: 'boolean', description: '是否已结束（到期或非active状态）' },
            remaining_ms: { type: 'number', description: '剩余毫秒数（最小0）' },
            days: { type: 'number' },
            hours: { type: 'number' },
            minutes: { type: 'number' },
            seconds: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const data = await EventKlineService.getEventCountdown(Number(eventId));
      if (!data) return reply.code(404).send({ error: '事件不存在' });
      reply.send(data);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 公共：获取事件的所有买入/卖出记录
  fastify.get('/events/:eventId/trades', {
    schema: {
      description: '公共：获取事件的所有买入/卖出记录（按时间倒序）',
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
          limit: { type: 'number', default: 200 },
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
              username: { type: 'string' },
              wallet_address: { type: 'string', nullable: true },
              transaction_type: { type: 'string', enum: ['buy','sell'] },
              side: { type: 'string', enum: ['yes','no'] },
              amount_delta: { type: 'number' },
              cost_or_return: { type: 'string' },
              odds_at_transaction: { type: 'string' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const { limit = 200, offset = 0 } = request.query as any;
      const rows = await EventKlineService.getEventTrades(Number(eventId), Number(limit), Number(offset));
      reply.send(rows);
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
