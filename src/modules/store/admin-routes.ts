import { FastifyInstance, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { StoreService } from './service.js';
import { StoreListQuery, CreateStoreRequest, UpdateStoreRequest } from './types.js';

export default async function adminStoreRoutes(fastify: FastifyInstance) {
  const storeService = new StoreService();

  // JWT认证中间件
  const authenticate = async (request: FastifyRequest, reply: any) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.status(401).send({ success: false, message: '缺少认证令牌' });
      }

      const decoded = jwt.verify(token, config.jwt.secret) as any;
      (request as any).user = decoded;
    } catch (error) {
      return reply.status(401).send({ success: false, message: '无效的认证令牌' });
    }
  };

  // 获取店铺列表（管理端）
  fastify.get('/', {
    preHandler: authenticate,
    schema: {
      description: '获取店铺列表（管理端）',
      tags: ['管理端-店铺管理'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'suspended'] },
          is_active: { type: 'boolean' },
          search: { type: 'string' },
          sort: { type: 'string', enum: ['created_at', 'rating', 'name', 'total_sales'], default: 'created_at' },
          order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: StoreListQuery }>, reply) => {
    try {
      const result = await storeService.getStores(request.query);
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取店铺列表失败'
      });
    }
  });

  // 获取单个店铺详情（管理端）
  fastify.get('/:id', {
    preHandler: authenticate,
    schema: {
      description: '获取店铺详情（管理端）',
      tags: ['管理端-店铺管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number } }>, reply) => {
    try {
      const store = await storeService.getStoreById(request.params.id);

      if (!store) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在'
        });
      }

      return reply.send({
        success: true,
        data: store
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取店铺详情失败'
      });
    }
  });

  // 创建店铺
  fastify.post('/', {
    preHandler: authenticate,
    schema: {
      description: '创建店铺',
      tags: ['管理端-店铺管理'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          owner_name: { type: 'string', minLength: 1, maxLength: 255 },
          contact_phone: { type: 'string', maxLength: 20 },
          contact_email: { type: 'string', format: 'email', maxLength: 255 },
          address: { type: 'string' },
          logo_url: { type: 'string', maxLength: 500 },
          cover_image_url: { type: 'string', maxLength: 500 },
          business_hours: { type: 'string', maxLength: 255 },
          business_license: { type: 'string', maxLength: 100 }
        },
        required: ['name', 'owner_name'],
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateStoreRequest }>, reply) => {
    try {
      const store = await storeService.createStore(request.body);
      return reply.status(201).send({
        success: true,
        data: store,
        message: '店铺创建成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '创建店铺失败'
      });
    }
  });

  // 更新店铺信息
  fastify.put('/:id', {
    preHandler: authenticate,
    schema: {
      description: '更新店铺信息',
      tags: ['管理端-店铺管理'],
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
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          owner_name: { type: 'string', minLength: 1, maxLength: 255 },
          contact_phone: { type: 'string', maxLength: 20 },
          contact_email: { type: 'string', format: 'email', maxLength: 255 },
          address: { type: 'string' },
          logo_url: { type: 'string', maxLength: 500 },
          cover_image_url: { type: 'string', maxLength: 500 },
          business_hours: { type: 'string', maxLength: 255 },
          business_license: { type: 'string', maxLength: 100 },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'suspended'] },
          is_active: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: UpdateStoreRequest }>, reply) => {
    try {
      const store = await storeService.updateStore(request.params.id, request.body);

      if (!store) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在'
        });
      }

      return reply.send({
        success: true,
        data: store,
        message: '店铺信息更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新店铺信息失败'
      });
    }
  });

  // 删除店铺
  fastify.delete('/:id', {
    preHandler: authenticate,
    schema: {
      description: '删除店铺',
      tags: ['管理端-店铺管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number } }>, reply) => {
    try {
      const deleted = await storeService.deleteStore(request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在'
        });
      }

      return reply.send({
        success: true,
        message: '店铺删除成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '删除店铺失败'
      });
    }
  });

  // 更新店铺状态
  fastify.patch('/:id/status', {
    preHandler: authenticate,
    schema: {
      description: '更新店铺状态',
      tags: ['管理端-店铺管理'],
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
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'suspended'] }
        },
        required: ['status'],
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: { status: 'pending' | 'approved' | 'rejected' | 'suspended' } }>, reply) => {
    try {
      const store = await storeService.updateStoreStatus(request.params.id, request.body.status);

      if (!store) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在'
        });
      }

      return reply.send({
        success: true,
        data: store,
        message: '店铺状态更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新店铺状态失败'
      });
    }
  });

  // 更新店铺评分
  fastify.patch('/:id/rating', {
    preHandler: authenticate,
    schema: {
      description: '更新店铺评分',
      tags: ['管理端-店铺管理'],
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
          rating: { type: 'number', minimum: 0, maximum: 5 }
        },
        required: ['rating'],
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: { rating: number } }>, reply) => {
    try {
      const store = await storeService.updateStoreRating(request.params.id, request.body.rating);

      if (!store) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在或评分超出范围'
        });
      }

      return reply.send({
        success: true,
        data: store,
        message: '店铺评分更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新店铺评分失败'
      });
    }
  });

  // 增加店铺销量
  fastify.patch('/:id/sales', {
    preHandler: authenticate,
    schema: {
      description: '增加店铺销量',
      tags: ['管理端-店铺管理'],
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
          amount: { type: 'number', minimum: 1, default: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: { amount?: number } }>, reply) => {
    try {
      const amount = request.body.amount || 1;
      const store = await storeService.incrementStoreSales(request.params.id, amount);

      if (!store) {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在'
        });
      }

      return reply.send({
        success: true,
        data: store,
        message: '店铺销量更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新店铺销量失败'
      });
    }
  });
}