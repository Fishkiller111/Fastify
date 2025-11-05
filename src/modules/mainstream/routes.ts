import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { processTimedOutPendingMatches } from '../overview/service.js';
import {
  CreateMainstreamEventRequest,
  GetBigCoinsQuery,
  AddBigCoinRequest,
} from './types.js';
import type { PlaceBetRequest } from '../meme/types.js';
import * as MainstreamService from './service.js';
import { wsManager } from '../kline/websocket.js';
import { sendEncryptedResponse } from '../../utils/response-helper.js';

/**
 * 主流币事件合约路由
 */
async function mainstreamRoutes(fastify: FastifyInstance) {
  // 添加主流币（管理员操作）
  fastify.post('/coins', {
    schema: {
      description: '添加新的主流币',
      tags: ['主流币合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['symbol', 'name', 'contract_address'],
        properties: {
          symbol: { type: 'string', description: '币种代号（如 BTC, ETH）' },
          name: { type: 'string', description: '币种名称' },
          contract_address: { type: 'string', description: 'BSC链上的合约地址' },
          chain: { type: 'string', default: 'BSC', description: '链名称' },
          decimals: { type: 'number', default: 18, description: '小数位数' },
          is_active: { type: 'boolean', default: true, description: '是否激活' },
          icon_url: { type: 'string', description: '币种图标URL地址' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            symbol: { type: 'string' },
            name: { type: 'string' },
            contract_address: { type: 'string' },
            chain: { type: 'string' },
            decimals: { type: 'number' },
            is_active: { type: 'boolean' },
            icon_url: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.adminAuth(['system_config']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as AddBigCoinRequest;
      const coin = await MainstreamService.addBigCoin(body);
      reply.code(201).send(coin);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取所有主流币列表
  fastify.get('/coins', {
    schema: {
      description: '获取主流币列表',
      tags: ['主流币合约'],
      querystring: {
        type: 'object',
        properties: {
          is_active: { type: 'boolean', description: '是否激活' },
          chain: { type: 'string', description: '链名称' },
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
              id: { type: 'number' },
              symbol: { type: 'string' },
              name: { type: 'string' },
              contract_address: { type: 'string' },
              chain: { type: 'string' },
              decimals: { type: 'number' },
              is_active: { type: 'boolean' },
              icon_url: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as GetBigCoinsQuery;
      const coins = await MainstreamService.getBigCoins(query);
      reply.send(coins);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 创建主流币事件合约
  fastify.post('/events', {
    schema: {
      description: '创建主流币事件合约',
      tags: ['主流币合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['type', 'big_coin_id', 'creator_side', 'initial_pool_amount', 'duration', 'future_price'],
        properties: {
          type: { type: 'string', enum: ['Mainstream'], description: '合约类型' },
          big_coin_id: { type: 'number', description: '主流币ID（对应 big_coins 表中的 id）' },
          creator_side: { type: 'string', enum: ['yes', 'no'], description: '创建者选择的方向（yes=涨到目标价，no=未涨到目标价）' },
          initial_pool_amount: { type: 'number', description: '初始资金池金额' },
          duration: {
            type: 'string',
            description: '持续时间,支持格式: "10minutes", "30minutes", "5hours", "1days", "72h", "45m", "2d"',
            examples: ['10minutes', '30minutes', '5hours', '1days', '72h', '45m', '2d']
          },
          future_price: { type: 'number', description: '预测的未来价格（deadline到期前币价是否能达到此价格）' },
          matching_slide: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description: '匹配滑动值(%)，创建者保留的百分比，反方需投注 initial_pool_amount × (1 - matching_slide%) 才能成功开盘，可选，默认50'
          },
          pending_match_timeout: {
            type: 'integer',
            minimum: 1,
            maximum: 604800,
            description: '待匹配状态超时时间(秒)，可选，默认3600(1小时)，范围1-604800(7天)'
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
            big_coin_id: { type: 'number' },
            big_coin: {
              type: 'object',
              properties: {
                symbol: { type: 'string' },
                name: { type: 'string' },
                chain: { type: 'string' },
              },
            },
            creator_side: { type: 'string' },
            initial_pool_amount: { type: 'string' },
            initial_amount: { type: 'number', description: '初始amount数量 (1 amount = 0.5U)' },
            yes_pool: { type: 'string' },
            no_pool: { type: 'string' },
            yes_amount: { type: 'number', description: 'YES方的amount数量' },
            no_amount: { type: 'number', description: 'NO方的amount数量' },
            yes_odds: { type: 'string' },
            no_odds: { type: 'string' },
            total_yes_bets: { type: 'number' },
            total_no_bets: { type: 'number' },
            status: { type: 'string' },
            deadline: { type: 'string' },
            matching_slide: { type: 'number' },
            pending_match_timeout: { type: 'number' },
            created_at: { type: 'string' },
            future_price: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const body = request.body as CreateMainstreamEventRequest;
      const event = await MainstreamService.createMainstreamEvent(userId, body);
      reply.code(201).send(event);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取主流币事件列表
  fastify.get('/events', {
    schema: {
      description: '获取主流币事件列表',
      tags: ['主流币合约'],
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
              creator_id: { type: 'number' },
              type: { type: 'string' },
              contract_address: { type: 'string' },
              big_coin_id: { type: 'number' },
              big_coin: {
                type: 'object',
                properties: {
                  symbol: { type: 'string' },
                  name: { type: 'string' },
                  chain: { type: 'string' },
                },
              },
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
              matching_slide: { type: 'number' },
              created_at: { type: 'string' },
              future_price: { type: 'string', nullable: true },
              current_price: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 先处理可能已超时的待匹配事件
      await processTimedOutPendingMatches();
      const { limit = 20, offset = 0 } = request.query as any;
      const events = await MainstreamService.getMainstreamEvents(limit, offset);
      reply.send(events);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取单个主流币事件详情
  fastify.get('/events/:id', {
    schema: {
      description: '获取单个主流币事件详情',
      tags: ['主流币合约'],
      params: {
        type: 'object',
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
            contract_address: { type: 'string' },
            big_coin_id: { type: 'number' },
            big_coin: {
              type: 'object',
              properties: {
                symbol: { type: 'string' },
                name: { type: 'string' },
                chain: { type: 'string' },
              },
            },
            creator_side: { type: 'string' },
            initial_pool_amount: { type: 'string' },
            initial_amount: { type: 'number', description: '初始amount数量 (1 amount = 0.5U)' },
            yes_pool: { type: 'string' },
            no_pool: { type: 'string' },
            yes_amount: { type: 'number', description: 'YES方的amount数量' },
            no_amount: { type: 'number', description: 'NO方的amount数量' },
            yes_odds: { type: 'string' },
            no_odds: { type: 'string' },
            total_yes_bets: { type: 'number' },
            total_no_bets: { type: 'number' },
            status: { type: 'string' },
            deadline: { type: 'string' },
            matching_slide: { type: 'number' },
            created_at: { type: 'string' },
            future_price: { type: 'string', nullable: true },
            current_price: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      // 先处理可能已超时的待匹配事件
      await processTimedOutPendingMatches();
      const event = await MainstreamService.getMainstreamEventById(id);

      if (!event) {
        return reply.code(404).send({ error: '主流币事件不存在' });
      }

      reply.send(event);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });


  // 结算主流币事件（管理员操作）
  fastify.post('/events/settle', {
    schema: {
      description: '结算主流币事件（自动通过 DexScreener API 查询 BSC 链上的币价）',
      tags: ['主流币合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id'],
        properties: {
          event_id: {
            type: 'number',
            description: '主流币事件ID'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: fastify.adminAuth(['meme.settle']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { event_id } = request.body as { event_id: number };
      await MainstreamService.settleMainstreamEvent(event_id);
      reply.send({ message: '主流币事件结算成功' });
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 公共：获取所有用户的下注记录（Mainstream）
  fastify.get('/bets/public', {
    schema: {
      description: '公共：获取所有用户的下注记录（仅 Mainstream 类型）',
      tags: ['主流币合约'],
      querystring: {
        type: 'object',
        properties: {
          event_id: { type: 'number' },
          bet_type: { type: 'string', enum: ['yes', 'no'] },
          status: { type: 'string', enum: ['pending', 'won', 'lost', 'refunded'] },
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
              username: { type: 'string' },
              wallet_address: { type: 'string', nullable: true },
              bet_type: { type: 'string' },
              bet_amount: { type: 'string' },
              odds_at_bet: { type: 'string' },
              potential_payout: { type: 'string', nullable: true },
              status: { type: 'string' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { event_id, bet_type, status, limit = 50, offset = 0 } = request.query as any;
      const rows = await MainstreamService.getPublicMainstreamBets({
        event_id: event_id ? Number(event_id) : undefined,
        bet_type,
        status,
        limit: Number(limit),
        offset: Number(offset),
      });
      reply.send(rows);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 用户对主流币事件下注
  fastify.post('/bets', {
    schema: {
      description: '用户对主流币事件下注',
      tags: ['主流币合约'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['event_id', 'bet_type', 'bet_amount'],
        properties: {
          event_id: { type: 'number', description: '主流币事件ID' },
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
      const bet = await MainstreamService.placeMainstreamBet(userId, body);

      // 广播下注记录到WebSocket订阅者（非阻塞）
      wsManager.broadcastBet(body.event_id, {
        userId: bet.user_id,
        betType: bet.bet_type,
        betAmount: bet.bet_amount,
        oddsAtBet: bet.odds_at_bet,
        potentialPayout: bet.potential_payout || '0',
        createdAt: bet.created_at.toISOString(),
      }).catch(err => {
        console.error('WebSocket下注广播失败:', err);
      });

      // 广播赔率更新到WebSocket订阅者（非阻塞）
      wsManager.broadcast(body.event_id).catch(err => {
        console.error('WebSocket赔率广播失败:', err);
      });

      reply.code(201).send(bet);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 删除所有已结算的主流币事件（管理员操作）
  fastify.delete('/events/settled', {
    schema: {
      description: '一键删除所有已结算的主流币事件及其关联数据（投注记录、K线数据）。需要 super_admin 角色或拥有 mainstream.delete 权限的 admin 角色',
      tags: ['主流币合约'],
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
    preHandler: fastify.adminAuth(['mainstream.delete']),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await MainstreamService.deleteSettledMainstreamEvents();
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default mainstreamRoutes;
