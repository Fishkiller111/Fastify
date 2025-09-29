import { FastifyInstance, FastifyRequest } from 'fastify';
import { ProductService } from './service.js';
import { ProductListQuery } from './types.js';

export default async function userProductRoutes(fastify: FastifyInstance) {
  const productService = new ProductService();

  // 用户端接口 - 获取商品列表（无需鉴权）
  fastify.get('/', {
    schema: {
      description: '获取商品列表（用户端）',
      tags: ['商品'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          category: { type: 'string' },
          store_id: { type: 'number' },
          search: { type: 'string' },
          sort: { type: 'string', enum: ['created_at', 'price', 'name'], default: 'created_at' },
          order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      price: { type: 'number' },
                      stock: { type: 'number' },
                      category: { type: 'string' },
                      image_url: { type: 'string' },
                      store_id: { type: 'number' },
                      created_at: { type: 'string' }
                    }
                  }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    current_page: { type: 'number' },
                    total_pages: { type: 'number' },
                    total_count: { type: 'number' },
                    per_page: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: ProductListQuery }>, reply) => {
    try {
      const query = { ...request.query, is_active: true };
      const result = await productService.getProducts(query);

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

  // 用户端接口 - 获取单个商品详情（无需鉴权）
  fastify.get('/:id', {
    schema: {
      description: '获取商品详情（用户端）',
      tags: ['商品'],
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

      if (!product || !product.is_active) {
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
}