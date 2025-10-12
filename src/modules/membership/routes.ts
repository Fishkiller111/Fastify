import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as membershipService from "./service.js";
import { UserMembership, MembershipLevel } from "./types.js";

export default async function membershipRoutes(fastify: FastifyInstance) {
  // 获取用户会员信息
  fastify.get('/', {
    schema: {
      description: '获取当前用户的会员信息',
      tags: ['会员'],
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
            user_id: { type: 'number' },
            level_id: { type: 'number', nullable: true },
            current_points: { type: 'number' },
            total_points: { type: 'number' },
            points_expire_date: { type: 'string', nullable: true },
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
      const userId = (request as any).user.userId;
      const membership = await membershipService.getUserMembership(userId);
      reply.send(membership);
    } catch (error: any) {
      if (error.message === "会员积分系统未启用") {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: error.message
        });
      }
      reply.code(500).send({ error: error.message });
    }
  });

  // 获取所有会员等级（公开信息）
  fastify.get('/levels', {
    schema: {
      description: '获取所有会员等级信息',
      tags: ['会员'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              level: { type: 'number' },
              upgrade_fee: { type: 'number' },
              gift_points: { type: 'number' },
              description: { type: 'string', nullable: true },
              extra: { 
                type: 'object',
                additionalProperties: true,
                nullable: true
              },
              created_at: { type: 'string' },
              updated_at: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const levels = await membershipService.getAllMembershipLevels();
      reply.send(levels);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
