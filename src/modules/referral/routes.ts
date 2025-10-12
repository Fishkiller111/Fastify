import { FastifyInstance } from 'fastify';
import { ReferralService } from './service.js';
import type {
  CreateCommissionTierRequest,
  UpdateCommissionTierRequest
} from './types.js';

export default async function referralRoutes(fastify: FastifyInstance) {
  // ==================== 用户端接口 ====================

  /**
   * 生成或获取邀请链接
   */
  fastify.get('/referral/link', {
    preHandler: fastify.userAuth(),
    schema: {
      tags: ['Referral'],
      summary: '生成或获取邀请链接',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            link: { type: 'string' },
            created_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request as any).user.userId;

    let referralCode = await ReferralService.getUserReferralCode(userId);

    if (!referralCode) {
      referralCode = await ReferralService.generateReferralCode(userId);
    }

    // 构建完整邀请链接（需要配置前端域名）
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const referralLink = `${baseUrl}?ref=${referralCode.code}`;

    reply.send({
      code: referralCode.code,
      link: referralLink,
      created_at: referralCode.created_at
    });
  });

  /**
   * 验证邀请码
   */
  fastify.get('/referral/validate/:code', {
    schema: {
      tags: ['Referral'],
      summary: '验证邀请码是否有效',
      params: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        },
        required: ['code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { code } = request.params as { code: string };

    const referralCode = await ReferralService.validateReferralCode(code);

    reply.send({
      valid: !!referralCode,
      code: referralCode?.code || null
    });
  });

  /**
   * 获取邀请统计
   */
  fastify.get('/referral/statistics', {
    preHandler: fastify.userAuth(),
    schema: {
      tags: ['Referral'],
      summary: '获取用户邀请统计',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            inviter_id: { type: 'number' },
            total_invitees: { type: 'number' },
            total_volume: { type: 'number' },
            total_commission_earned: { type: 'number' },
            pending_commission: { type: 'number' },
            current_tier: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'number' },
                tier_name: { type: 'string' },
                commission_rate: { type: 'number' },
                min_volume: { type: 'number' },
                max_volume: { type: 'number', nullable: true }
              }
            },
            next_tier: {
              type: 'object',
              nullable: true
            },
            volume_to_next_tier: { type: 'number', nullable: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request as any).user.userId;

    const statistics = await ReferralService.getReferralStatistics(userId);

    reply.send(statistics);
  });

  /**
   * 获取被邀请者列表
   */
  fastify.get('/referral/invitees', {
    preHandler: fastify.userAuth(),
    schema: {
      tags: ['Referral'],
      summary: '获取被邀请者列表',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            invitees: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  user_id: { type: 'number' },
                  wallet_address: { type: 'string', nullable: true },
                  email: { type: 'string', nullable: true },
                  total_bets: { type: 'number' },
                  total_bet_amount: { type: 'number' },
                  activated_at: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request as any).user.userId;
    const { limit = 50, offset = 0 } = request.query as {
      limit?: number;
      offset?: number;
    };

    const invitees = await ReferralService.getInviteesList(userId, limit, offset);

    reply.send({ invitees });
  });

  /**
   * 获取佣金记录
   */
  fastify.get('/referral/commissions', {
    preHandler: fastify.userAuth(),
    schema: {
      tags: ['Referral'],
      summary: '获取佣金记录',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            records: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  invitee_id: { type: 'number' },
                  bet_id: { type: 'number' },
                  bet_amount: { type: 'number' },
                  commission_rate: { type: 'number' },
                  commission_amount: { type: 'number' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  settled_at: { type: 'string', nullable: true }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request as any).user.userId;
    const { limit = 50, offset = 0 } = request.query as {
      limit?: number;
      offset?: number;
    };

    const records = await ReferralService.getCommissionRecords(userId, limit, offset);

    reply.send({ records });
  });

  /**
   * 获取所有反佣等级（公开接口）
   */
  fastify.get('/referral/tiers', {
    schema: {
      tags: ['Referral'],
      summary: '获取所有反佣等级配置',
      response: {
        200: {
          type: 'object',
          properties: {
            tiers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  tier_name: { type: 'string' },
                  min_volume: { type: 'number' },
                  max_volume: { type: 'number', nullable: true },
                  commission_rate: { type: 'number' },
                  tier_order: { type: 'number' },
                  is_active: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const tiers = await ReferralService.getAllTiers();
    reply.send({ tiers });
  });

  // ==================== 管理员接口 ====================

  /**
   * 创建反佣等级配置
   */
  fastify.post('/admin/referral/tiers', {
    preHandler: fastify.adminAuth(['referral.manage']),
    schema: {
      tags: ['Admin - Referral'],
      summary: '创建反佣等级配置',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tier_name', 'min_volume', 'commission_rate', 'tier_order'],
        properties: {
          tier_name: { type: 'string' },
          min_volume: { type: 'number' },
          max_volume: { type: 'number' },
          commission_rate: { type: 'number' },
          tier_order: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tier: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const data = request.body as CreateCommissionTierRequest;
    const tier = await ReferralService.createTier(data);
    reply.send({ tier });
  });

  /**
   * 更新反佣等级配置
   */
  fastify.put('/admin/referral/tiers/:id', {
    preHandler: fastify.adminAuth(['referral.manage']),
    schema: {
      tags: ['Admin - Referral'],
      summary: '更新反佣等级配置',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          tier_name: { type: 'string' },
          min_volume: { type: 'number' },
          max_volume: { type: 'number' },
          commission_rate: { type: 'number' },
          tier_order: { type: 'number' },
          is_active: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tier: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const data = request.body as UpdateCommissionTierRequest;

    const tier = await ReferralService.updateTier(id, data);
    reply.send({ tier });
  });

  /**
   * 删除反佣等级配置
   */
  fastify.delete('/admin/referral/tiers/:id', {
    preHandler: fastify.adminAuth(['referral.manage']),
    schema: {
      tags: ['Admin - Referral'],
      summary: '删除反佣等级配置',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    await ReferralService.deleteTier(id);
    reply.send({ message: '等级配置已删除' });
  });
}
