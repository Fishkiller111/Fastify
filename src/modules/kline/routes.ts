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
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const query = request.query as Omit<EventKlineQueryParams, 'event_id'>;

      const klines = await EventKlineService.getHistoricalKlines({
        event_id: eventId,
        ...query,
      });

      reply.send(klines);
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
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const currentOdds = await EventKlineService.getCurrentOdds(eventId);

      if (!currentOdds) {
        return reply.code(404).send({ error: '事件不存在' });
      }

      reply.send(currentOdds);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 初始化事件模拟数据（测试用）
  fastify.post('/events/:eventId/mock', {
    schema: {
      description: '初始化事件模拟K线数据',
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
          interval: {
            type: 'string',
            enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
            default: '1m',
          },
          count: { type: 'number', default: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            event_id: { type: 'number' },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: number };
      const { interval = KlineInterval.ONE_MINUTE, count = 100 } = request.query as {
        interval?: KlineInterval;
        count?: number;
      };

      await EventKlineService.initMockEventData(eventId, interval, count);

      reply.send({
        message: '模拟数据初始化成功',
        event_id: eventId,
        count,
      });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default klineRoutes;
