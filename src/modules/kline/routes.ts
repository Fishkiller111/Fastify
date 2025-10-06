import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EventKlineQueryParams, KlineInterval } from './types.js';
import EventKlineService from './service.js';

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
      connection_example: 'ws://localhost:3000/ws/kline/events/1',
      message_format: {
        type: 'odds_update',
        data: {
          event_id: 1,
          yes_odds: 55.50,
          no_odds: 44.50,
          yes_pool: 1000.00,
          no_pool: 800.00,
          timestamp: Date.now(),
        },
      },
      features: [
        '连接建立时自动推送当前赔率',
        '下注发生时自动广播赔率更新',
        '支持多客户端同时订阅',
        '断线自动清理资源',
      ],
      javascript_example: `
const ws = new WebSocket('ws://localhost:3000/ws/kline/events/1');

ws.onopen = () => {
  console.log('WebSocket已连接');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'odds_update') {
    console.log('赔率更新:', message.data);
    // 更新UI显示
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
