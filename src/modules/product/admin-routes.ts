import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { ProductService } from './service.js';
import { CreateProductRequest, UpdateProductRequest, ProductListQuery } from './types.js';

export default async function adminProductRoutes(fastify: FastifyInstance) {
  const productService = new ProductService();

  // JWT验证中间件
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization || !authorization.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          message: '需要提供有效的访问令牌'
        });
      }

      const token = authorization.slice(7);
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      (request as any).user = decoded;
    } catch (error) {
      return reply.status(401).send({
        success: false,
        message: '无效的访问令牌'
      });
    }
  };

  // 管理端接口 - 获取商品列表（需要鉴权）
  fastify.get('/', {
    preHandler: authenticate,
    schema: {
      description: '获取商品列表（管理端）',
      tags: ['管理端-商品管理'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          category: { type: 'string' },
          is_active: { type: 'boolean' },
          search: { type: 'string' },
          sort: { type: 'string', enum: ['created_at', 'price', 'name'], default: 'created_at' },
          order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: ProductListQuery }>, reply) => {
    try {
      const result = await productService.getProducts(request.query);

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取商品列表失败'
      });
    }
  });

  // 管理端接口 - 创建商品（需要鉴权）
  fastify.post('/', {
    preHandler: authenticate,
    schema: {
      description: '创建商品',
      tags: ['管理端-商品管理'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          price: { type: 'number', minimum: 0 },
          stock: { type: 'number', minimum: 0 },
          category: { type: 'string', maxLength: 100 },
          image_url: { type: 'string', format: 'uri' },
          store_id: { type: 'number' },
          is_active: { type: 'boolean', default: true }
        },
        required: ['name', 'price', 'stock']
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateProductRequest }>, reply) => {
    try {
      const product = await productService.createProduct(request.body);

      return reply.status(201).send({
        success: true,
        data: product,
        message: '商品创建成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '创建商品失败'
      });
    }
  });

  // 管理端接口 - 获取单个商品（需要鉴权）
  fastify.get('/:id', {
    preHandler: authenticate,
    schema: {
      description: '获取商品详情（管理端）',
      tags: ['管理端-商品管理'],
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
      const product = await productService.getProductById(request.params.id);

      if (!product) {
        return reply.status(404).send({
          success: false,
          message: '商品不存在'
        });
      }

      return reply.send({
        success: true,
        data: product
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取商品详情失败'
      });
    }
  });

  // 管理端接口 - 更新商品（需要鉴权）
  fastify.put('/:id', {
    preHandler: authenticate,
    schema: {
      description: '更新商品',
      tags: ['管理端-商品管理'],
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
          price: { type: 'number', minimum: 0 },
          stock: { type: 'number', minimum: 0 },
          category: { type: 'string', maxLength: 100 },
          image_url: { type: 'string', format: 'uri' },
          store_id: { type: 'number' },
          is_active: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: UpdateProductRequest }>, reply) => {
    try {
      const product = await productService.updateProduct(request.params.id, request.body);

      if (!product) {
        return reply.status(404).send({
          success: false,
          message: '商品不存在'
        });
      }

      return reply.send({
        success: true,
        data: product,
        message: '商品更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新商品失败'
      });
    }
  });

  // 管理端接口 - 删除商品（需要鉴权）
  fastify.delete('/:id', {
    preHandler: authenticate,
    schema: {
      description: '删除商品',
      tags: ['管理端-商品管理'],
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
      const deleted = await productService.deleteProduct(request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          message: '商品不存在'
        });
      }

      return reply.send({
        success: true,
        message: '商品删除成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '删除商品失败'
      });
    }
  });

  // 管理端接口 - 更新库存（需要鉴权）
  fastify.patch('/:id/stock', {
    preHandler: authenticate,
    schema: {
      description: '更新商品库存',
      tags: ['管理端-商品管理'],
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
          quantity: { type: 'number' }
        },
        required: ['quantity']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Body: { quantity: number } }>, reply) => {
    try {
      const product = await productService.updateStock(request.params.id, request.body.quantity);

      if (!product) {
        return reply.status(404).send({
          success: false,
          message: '商品不存在或库存不足'
        });
      }

      return reply.send({
        success: true,
        data: product,
        message: '库存更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新库存失败'
      });
    }
  });
}