import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserService from './service.js';
import { JwtUser } from '../../plugins/jwt.js';
import { UpdateUserRoleRequest } from '../auth/types.js';

// 用户信息已通过auth插件扩展到FastifyRequest中

/**
 * 用户路由
 * @param fastify Fastify实例
 */
async function userRoutes(fastify: FastifyInstance) {
  // 获取当前用户信息路由
  fastify.get('/me', {
    schema: {
      description: '获取当前用户信息',
      tags: ['用户'],
      headers: {
        type: 'object',
        properties: {
          authorization: {
            type: 'string',
            description: 'Bearer token for authentication'
          }
        },
        required: ['authorization']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string', nullable: true },
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.userAuth()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('Received request to /api/user/me');
      const jwtUser = (request as any).user as JwtUser;
      console.log('Fetching user with ID:', jwtUser.userId);

      // 获取用户信息
      const user = await UserService.getUserById(jwtUser.userId);
      
      if (!user) {
        console.log('User not found');
        return reply.code(404).send({ 
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }
      
      console.log('User found:', user);
      reply.send({
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        wallet_address: user.wallet_address,
        balance: user.balance,
        created_at: user.created_at,
        updated_at: user.updated_at
      });
    } catch (error: any) {
      console.error('Error in /api/user/me:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // 获取用户所有类型的下注记录(包含事件详情)
  fastify.get('/bets/all', {
    schema: {
      description: '获取用户所有类型的下注记录(包含meme和mainstream)',
      tags: ['用户'],
      security: [{ bearerAuth: [] }],
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
              event_id: { type: 'number' },
              user_id: { type: 'number' },
              bet_type: { type: 'string' },
              bet_amount: { type: 'string' },
              odds_at_bet: { type: 'string' },
              potential_payout: { type: 'string', nullable: true },
              actual_payout: { type: 'string', nullable: true },
              status: { type: 'string' },
              created_at: { type: 'string' },
              event: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  contract_address: { type: 'string', nullable: true },
                  deadline: { type: 'string' },
                  settled_at: { type: 'string', nullable: true },
                  token_name: { type: 'string', nullable: true },
                  big_coin_id: { type: 'number', nullable: true },
                  big_coin_symbol: { type: 'string', nullable: true },
                  big_coin_name: { type: 'string', nullable: true },
                  big_coin_icon_url: { type: 'string', nullable: true },
                  future_price: { type: 'string', nullable: true },
                  current_price: { type: 'string', nullable: true },
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
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
      const bets = await UserService.getAllUserBets(userId, limit, offset);
      reply.send(bets);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 获取用户统计数据
  fastify.get('/statistics', {
    schema: {
      description: '获取用户统计数据(盈利、亏损、活跃下注等),支持时间范围筛选',
      tags: ['用户'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          time_range: {
            type: 'string',
            enum: ['1d', '1w', '1m', 'all'],
            default: 'all',
            description: '时间范围: 1d=最近1天, 1w=最近1周, 1m=最近1月, all=全部时间'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            time_range: { type: 'string', description: '查询的时间范围' },
            total_bets: { type: 'number', description: '总下注次数' },
            total_bet_amount: { type: 'string', description: '总下注金额' },
            active_bet_amount: { type: 'string', description: '活跃下注金额(pending状态)' },
            profit: { type: 'string', description: '盈利(won状态的收益,不含本金)' },
            loss: { type: 'string', description: '亏损(lost状态的损失)' },
            net_profit: { type: 'string', description: '净盈利(profit - loss)' },
            win_rate: { type: 'string', description: '胜率百分比' },
          },
        },
      },
    },
    preHandler: fastify.userAuth(),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { time_range = 'all' } = request.query as { time_range?: string };

      // 验证时间范围参数
      const validRanges = ['1d', '1w', '1m', 'all'];
      if (!validRanges.includes(time_range)) {
        return reply.code(400).send({
          error: `无效的时间范围参数。有效值: ${validRanges.join(', ')}`
        });
      }

      const statistics = await UserService.getUserStatistics(userId, time_range);
      reply.send(statistics);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 修改用户角色接口（管理员权限）
  fastify.put('/:id/role', {
    schema: {
      description: '修改用户角色',
      tags: ['用户管理'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['user', 'admin'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone_number: { type: 'string', nullable: true },
            wallet_address: { type: 'string', nullable: true },
            balance: { type: 'string', nullable: true },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            },
            status: { type: 'string' },
            last_login_at: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      const { role } = (request as any).body;

      const updatedUser = await UserService.updateUserRole(id, { role });

      if (!updatedUser) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }

      reply.send(updatedUser);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });
}

export default userRoutes;
