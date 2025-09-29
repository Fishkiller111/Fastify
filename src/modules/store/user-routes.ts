import { FastifyInstance, FastifyRequest } from 'fastify';
import { StoreService } from './service.js';
import { StoreListQuery } from './types.js';
import { ProductListQuery } from '../product/types.js';

export default async function userStoreRoutes(fastify: FastifyInstance) {
  const storeService = new StoreService();

  // 用户端接口 - 获取店铺列表（无需鉴权）
  fastify.get('/', {
    schema: {
      description: '获取店铺列表（用户端）',
      tags: ['店铺'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'approved' },
          is_active: { type: 'boolean', default: true },
          search: { type: 'string' },
          sort: { type: 'string', enum: ['created_at', 'rating', 'name', 'total_sales'], default: 'created_at' },
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
                stores: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      owner_name: { type: 'string' },
                      contact_phone: { type: 'string' },
                      contact_email: { type: 'string' },
                      address: { type: 'string' },
                      logo_url: { type: 'string' },
                      cover_image_url: { type: 'string' },
                      business_hours: { type: 'string' },
                      status: { type: 'string' },
                      is_active: { type: 'boolean' },
                      rating: { type: 'number' },
                      total_sales: { type: 'number' },
                      created_at: { type: 'string' },
                      updated_at: { type: 'string' }
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
  }, async (request: FastifyRequest<{ Querystring: StoreListQuery }>, reply) => {
    try {
      const query = { ...request.query, is_active: true, status: 'approved' as const };
      const result = await storeService.getStores(query);

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

  // 用户端接口 - 获取单个店铺详情（无需鉴权）
  fastify.get('/:id', {
    schema: {
      description: '获取店铺详情（用户端）',
      tags: ['店铺'],
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
            data: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                description: { type: 'string' },
                owner_name: { type: 'string' },
                contact_phone: { type: 'string' },
                contact_email: { type: 'string' },
                address: { type: 'string' },
                logo_url: { type: 'string' },
                cover_image_url: { type: 'string' },
                business_hours: { type: 'string' },
                status: { type: 'string' },
                is_active: { type: 'boolean' },
                rating: { type: 'number' },
                total_sales: { type: 'number' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number } }>, reply) => {
    try {
      const store = await storeService.getStoreById(request.params.id);

      if (!store || !store.is_active || store.status !== 'approved') {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在或未审核通过'
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

  // 用户端接口 - 获取店铺商品列表（无需鉴权）
  fastify.get('/:id/products', {
    schema: {
      description: '获取店铺商品列表',
      tags: ['店铺'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          category: { type: 'string' },
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
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: number }, Querystring: ProductListQuery }>, reply) => {
    try {
      // 先检查店铺是否存在且已审核通过
      const store = await storeService.getStoreById(request.params.id);

      if (!store || !store.is_active || store.status !== 'approved') {
        return reply.status(404).send({
          success: false,
          message: '店铺不存在或未审核通过'
        });
      }

      // 获取店铺商品列表，只显示激活的商品
      const result = await storeService.getStoreProducts(request.params.id, {
        ...request.query,
        is_active: true
      });

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取店铺商品列表失败'
      });
    }
  });
}