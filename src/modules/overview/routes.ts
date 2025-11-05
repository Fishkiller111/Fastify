import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getWaitingEvents } from './service.js';

async function overviewRoutes(fastify: FastifyInstance) {
  // 查询 waiting(=pending_match) 状态的事件（主流币、pumpfun、bonk）
  fastify.get('/events/waiting', {
    schema: {
      description: '事件总览：查询 waiting 状态（pending_match）的事件，包含 Mainstream、pumpfun、bonk',
      tags: ['事件总览'],
      querystring: {
        type: 'object',
        properties: {
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
              type: { type: 'string', enum: ['pumpfun', 'bonk', 'Mainstream'] },
              contract_address: { type: 'string', nullable: true },
              token_name: { type: 'string', nullable: true },
              creator_username: { type: 'string' },
              creator_side: { type: 'string', enum: ['yes', 'no'] },
              status: { type: 'string', enum: ['waiting'] },
              initial_pool_amount: { type: 'string' },
              initial_amount: { type: 'number' },
              matching_slide: { type: 'number', nullable: true },
              pending_match_timeout: { type: 'number', nullable: true },
              yes_pool: { type: 'string' },
              no_pool: { type: 'string' },
              yes_amount: { type: 'number' },
              no_amount: { type: 'number' },
              yes_odds: { type: 'string' },
              no_odds: { type: 'string' },
              created_at: { type: 'string' },
              deadline: { type: 'string' },
              big_coin: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'number' },
                  symbol: { type: 'string' },
                  name: { type: 'string' },
                  icon_url: { type: 'string', nullable: true },
                },
              },
              predicted_price: { type: 'string', nullable: true, description: 'Mainstream 事件创建时设置的预测价格' },
              // 派生字段
              min_required_amount: { type: 'number', nullable: true },
              counter_amount: { type: 'number', nullable: true },
              progress: { type: 'number', nullable: true, description: '匹配进度(0-1)' },
              seconds_remaining: { type: 'number', nullable: true, description: 'pending匹配剩余秒(>=0)' },
              waiting_total_seconds: { type: 'number', nullable: true, description: '匹配等待总时长(秒)，即 pending_match_timeout' },
              waiting_elapsed_seconds: { type: 'number', nullable: true, description: '已等待秒数(>=0)' },
              waiting_end_time: { type: 'string', nullable: true, description: '匹配截止时间 ISO 字符串' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 50, offset = 0 } = request.query as any;
      const rows = await getWaitingEvents(Number(limit), Number(offset));
      reply.send(rows);
    } catch (err: any) {
      reply.code(400).send({ error: err.message });
    }
  });
}

export default overviewRoutes;