import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as membershipService from "./service.js";
import pool from "../../config/database.js";

export default async function adminMembershipRoutes(fastify: FastifyInstance) {
  // 创建会员等级
  fastify.post('/levels', {
    schema: {
      description: '创建新的会员等级',
      tags: ['管理端会员管理'],
      body: {
        type: 'object',
        required: ['name', 'level', 'upgrade_fee', 'gift_points'],
        properties: {
          name: { type: 'string' },
          level: { type: 'number' },
          upgrade_fee: { type: 'number' },
          gift_points: { type: 'number' },
          description: { type: 'string' },
          extra: { 
            type: 'object',
            additionalProperties: true
          }
        }
      },
      response: {
        201: {
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
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const levelData = (request as any).body;
      const newLevel = await membershipService.createMembershipLevel(levelData);
      reply.code(201).send(newLevel);
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  });

  // 更新会员等级
  fastify.put('/levels/:id', {
    schema: {
      description: '更新会员等级信息',
      tags: ['管理端会员管理'],
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
          name: { type: 'string' },
          level: { type: 'number' },
          upgrade_fee: { type: 'number' },
          gift_points: { type: 'number' },
          description: { type: 'string' },
          extra: { 
            type: 'object',
            additionalProperties: true
          }
        }
      },
      response: {
        200: {
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
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      const levelData = (request as any).body;
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE membership_levels 
           SET name = $1, level = $2, upgrade_fee = $3, gift_points = $4, description = $5, extra = $6, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7
           RETURNING *`,
          [levelData.name, levelData.level, levelData.upgrade_fee, levelData.gift_points, levelData.description, levelData.extra, id]
        );
        
        if (result.rows.length === 0) {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Membership level not found'
          });
        }
        
        reply.send(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // 删除会员等级
  fastify.delete('/levels/:id', {
    schema: {
      description: '删除会员等级',
      tags: ['管理端会员管理'],
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
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: fastify.adminAuth(['user_management'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as any).params;
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          'DELETE FROM membership_levels WHERE id = $1 RETURNING id',
          [id]
        );
        
        if (result.rows.length === 0) {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Membership level not found'
          });
        }
        
        reply.send({
          success: true,
          message: 'Membership level deleted successfully'
        });
      } finally {
        client.release();
      }
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}