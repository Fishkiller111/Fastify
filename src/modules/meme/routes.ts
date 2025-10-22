import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateMemeEventRequest,
  PlaceBetRequest,
  SettleEventRequest,
  GetEventsQuery,
  GetUserBetsQuery,
} from './types.js';
import * as MemeService from './service.js';
import { wsManager } from '../kline/websocket.js';
import EventKlineService from '../kline/service.js';
import { sendEncryptedResponse } from '../../utils/response-helper.js';

/**
 * Meme事件合约路由
 */
async function memeRoutes(fastify: FastifyInstance) {
  // 创建Meme事件合约
  fastify.post('/events', {
    schema: {
      description: '创建Meme事件合约',
      tags: ['Meme合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['type', 'contract_address', 'creator_side', 'initial_pool_amount', 'duration'],
        properties: {
          type: { type: 'string', enum: ['pumpfun', 'bonk'], description: '合约类型' },
          contract_address: { type: 'string', description: '目标合约地址' },
          creator_side: { type: 'string', enum: ['yes', 'no'], description: '创建者选择的方向' },
          initial_pool_amount: { type: 'number', description: '初始资金池金额' },
          duration: {
            type: 'string',
            description: '持续时间,支持格式: "10minutes", "30minutes", "5hours", "1days", "72h", "45m", "2d"',
            examples: ['10minutes', '30minutes', '5hours', '1days', '72h', '45m', '2d']
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            creator_id: { type: 'number' },
            type: { type: 'string' },
            contract_address: { type: 'string' },
            creator_side: { type: 'string' },
            initial_pool_amount: { type: 'string' },
            yes_pool: { type: 'string' },
            no_pool: { type: 'string' },
            yes_odds: { type: 'string' },
            no_odds: { type: 'string' },
            total_yes_bets: { type: 'number' },
            total_no_bets: { type: 'number' },
            status: { type: 'string' },
            deadline: { type: 'string' },
            created_at: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const body = request.body as CreateMemeEventRequest;
      const event = await MemeService.createMemeEvent(userId, body);
      sendEncryptedResponse(reply, event, 201);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 用户下注
  fastify.post('/bets', {
    schema: {
      description: '用户下注',
      tags: ['Meme合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id', 'bet_type', 'bet_amount'],
        properties: {
          event_id: { type: 'number' },
          bet_type: { type: 'string', enum: ['yes', 'no'] },
          bet_amount: { type: 'number' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            event_id: { type: 'number' },
            user_id: { type: 'number' },
            bet_type: { type: 'string' },
            bet_amount: { type: 'string' },
            odds_at_bet: { type: 'string' },
            potential_payout: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const body = request.body as PlaceBetRequest;
      const bet = await MemeService.placeBet(userId, body);

      // 保存K线数据到数据库
      await EventKlineService.recordOddsSnapshot(body.event_id);

      // 广播下注记录到WebSocket订阅者
      await wsManager.broadcastBet(body.event_id, {
        userId: bet.user_id,
        betType: bet.bet_type,
        betAmount: bet.bet_amount,
        oddsAtBet: bet.odds_at_bet,
        potentialPayout: bet.potential_payout || '0',
        createdAt: bet.created_at.toISOString(),
      });

      // 广播赔率更新到WebSocket订阅者
      await wsManager.broadcast(body.event_id);

      sendEncryptedResponse(reply, bet, 201);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 结算事件（管理员操作）
  fastify.post('/events/settle', {
    schema: {
      description: '结算Meme事件（is_launched 可选，不提供时自动通过 DexScreener API 判断）',
      tags: ['Meme合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id'],
        properties: {
          event_id: { 
            type: 'number',
            description: '事件ID'
          },
          is_launched: { 
            type: 'boolean',
            description: '是否发射成功（可选）。不提供时自动判断：pumpfun(pumpswap=成功,pumpfun=失败) bonk(raydium=成功,launchlab=失败)'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            creator_id: { type: 'number' },
            type: { type: 'string' },
            is_launched: { type: 'boolean' },
            status: { type: 'string' },
            settled_at: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.adminAuth(['meme.settle']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as SettleEventRequest;
      const event = await MemeService.settleEvent(body);
      reply.send(event);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取事件列表
  fastify.get('/events', {
    schema: {
      description: '获取Meme事件列表',
      tags: ['Meme合约'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'settled', 'cancelled'] },
          type: { type: 'string', enum: ['pumpfun', 'bonk'] },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              creator_id: { type: 'number' },
              type: { type: 'string' },
              contract_address: { type: 'string', nullable: true },
              creator_side: { type: 'string' },
              initial_pool_amount: { type: 'string' },
              yes_pool: { type: 'string' },
              no_pool: { type: 'string' },
              yes_odds: { type: 'string' },
              no_odds: { type: 'string' },
              total_yes_bets: { type: 'number' },
              total_no_bets: { type: 'number' },
              is_launched: { type: 'boolean', nullable: true },
              status: { type: 'string' },
              deadline: { type: 'string' },
              deadline_after_settlement: { type: 'string', nullable: true },
              token_name: { type: 'string', nullable: true },
              launch_time: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              settled_at: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as GetEventsQuery;
      const events = await MemeService.getEvents(query);
      sendEncryptedResponse(reply, events);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取单个事件详情
  fastify.get('/events/:id', {
    schema: {
      description: '获取单个Meme事件详情',
      tags: ['Meme合约'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'number' },
        },
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
            yes_pool: { type: 'string' },
            no_pool: { type: 'string' },
            yes_odds: { type: 'string' },
            no_odds: { type: 'string' },
            total_yes_bets: { type: 'number' },
            total_no_bets: { type: 'number' },
            is_launched: { type: 'boolean', nullable: true },
            status: { type: 'string' },
            deadline: { type: 'string' },
            deadline_after_settlement: { type: 'string', nullable: true },
            token_name: { type: 'string', nullable: true },
            launch_time: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            settled_at: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const event = await MemeService.getEventById(id);
      if (!event) {
        return reply.code(404).send({ error: '事件不存在' });
      }
      sendEncryptedResponse(reply, event);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取用户投注历史
  fastify.get('/bets', {
    schema: {
      description: '获取用户投注历史',
      tags: ['Meme合约'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          event_id: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'won', 'lost', 'refunded'] },
          limit: { type: 'number' },
          offset: { type: 'number' },
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
              bet_type: { type: 'string' },
              bet_amount: { type: 'string' },
              odds_at_bet: { type: 'string' },
              potential_payout: { type: 'string', nullable: true },
              actual_payout: { type: 'string', nullable: true },
              status: { type: 'string' },
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
      const query = request.query as GetUserBetsQuery;
      const bets = await MemeService.getUserBets({
        ...query,
        user_id: userId,
      });
      reply.send(bets);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 删除所有已结算的Meme事件（管理员操作）
  fastify.delete('/events/settled', {
    schema: {
      description: '一键删除所有已结算的Meme事件及其关联数据（投注记录、K线数据）。需要 super_admin 角色或拥有 meme.delete 权限的 admin 角色',
      tags: ['Meme合约'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            deletedCount: { type: 'number', description: '删除的事件数量' },
            message: { type: 'string', description: '操作结果消息' },
          },
        },
      },
    },
    preHandler: fastify.adminAuth(['meme.delete']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await MemeService.deleteSettledEvents();
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default memeRoutes;
