import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { ProductMediaService } from './media-service.js';

const mediaService = new ProductMediaService();

/**
 * 商品媒体管理路由
 */
async function productMediaRoutes(fastify: FastifyInstance) {

  // 验证JWT令牌的preHandler
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ error: '缺少授权令牌' });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      (request as any).user = decoded;
    } catch (error) {
      return reply.status(401).send({ error: '无效的授权令牌' });
    }
  };

  // 上传商品图片
  fastify.post('/products/:productId/image', {
    preHandler: authenticate,
    schema: {
      description: '上传商品图片',
      tags: ['Product Media'],
      params: {
        type: 'object',
        properties: {
          productId: { type: 'integer', description: '商品ID' }
        },
        required: ['productId']
      },
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                url: { type: 'string', description: '图片URL' },
                thumbnailUrl: { type: 'string', description: '缩略图URL' },
                size: { type: 'number', description: '文件大小' },
                width: { type: 'number', description: '图片宽度' },
                height: { type: 'number', description: '图片高度' }
              }
            }
          }
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
    try {
      const productId = parseInt(request.params.productId);
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: '请选择要上传的图片文件' });
      }

      // 验证文件类型
      if (!data.mimetype.startsWith('image/')) {
        return reply.status(400).send({ error: '只允许上传图片文件' });
      }

      const buffer = await data.toBuffer();
      const result = await mediaService.uploadProductImage(
        productId,
        data.filename || `product-${productId}-image.${data.mimetype.split('/')[1]}`,
        buffer,
        {
          contentType: data.mimetype,
          compressImage: true,
          quality: 80
        }
      );

      reply.send(result);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : '图片上传失败'
      });
    }
  });

  // 上传商品视频
  fastify.post('/products/:productId/video', {
    preHandler: authenticate,
    schema: {
      description: '上传商品视频',
      tags: ['Product Media'],
      params: {
        type: 'object',
        properties: {
          productId: { type: 'integer', description: '商品ID' }
        },
        required: ['productId']
      },
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                url: { type: 'string', description: '视频URL' },
                thumbnailUrl: { type: 'string', description: '缩略图URL' },
                duration: { type: 'number', description: '视频时长（秒）' },
                size: { type: 'number', description: '文件大小' },
                width: { type: 'number', description: '视频宽度' },
                height: { type: 'number', description: '视频高度' }
              }
            }
          }
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
    try {
      const productId = parseInt(request.params.productId);
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: '请选择要上传的视频文件' });
      }

      // 验证文件类型
      if (!data.mimetype.startsWith('video/')) {
        return reply.status(400).send({ error: '只允许上传视频文件' });
      }

      // 检查文件大小限制（100MB）
      const maxSize = 100 * 1024 * 1024;
      const buffer = await data.toBuffer();
      if (buffer.length > maxSize) {
        return reply.status(400).send({ error: '视频文件大小不能超过100MB' });
      }

      const result = await mediaService.uploadProductVideo(
        productId,
        data.filename || `product-${productId}-video.${data.mimetype.split('/')[1]}`,
        buffer,
        {
          contentType: data.mimetype,
          generateThumbnail: true
        }
      );

      reply.send(result);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : '视频上传失败'
      });
    }
  });

  // 获取商品媒体信息
  fastify.get('/products/:productId/media', {
    schema: {
      description: '获取商品媒体信息',
      tags: ['Product Media'],
      params: {
        type: 'object',
        properties: {
          productId: { type: 'integer', description: '商品ID' }
        },
        required: ['productId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            media_type: { type: 'string', enum: ['image', 'video'], description: '媒体类型' },
            image_url: { type: 'string', description: '图片URL' },
            video_url: { type: 'string', description: '视频URL' },
            thumbnail_url: { type: 'string', description: '缩略图URL' },
            media_duration: { type: 'number', description: '媒体时长（秒）' },
            media_size: { type: 'number', description: '媒体文件大小' }
          }
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
    try {
      const productId = parseInt(request.params.productId);
      const mediaInfo = await mediaService.getProductMediaInfo(productId);
      reply.send(mediaInfo);
    } catch (error) {
      reply.status(404).send({
        error: error instanceof Error ? error.message : '获取媒体信息失败'
      });
    }
  });

  // 删除商品媒体
  fastify.delete('/products/:productId/media', {
    preHandler: authenticate,
    schema: {
      description: '删除商品媒体文件',
      tags: ['Product Media'],
      params: {
        type: 'object',
        properties: {
          productId: { type: 'integer', description: '商品ID' }
        },
        required: ['productId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
    try {
      const productId = parseInt(request.params.productId);
      const result = await mediaService.deleteProductMedia(productId);
      reply.send(result);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : '删除媒体文件失败'
      });
    }
  });

  // 同步商品媒体到其他存储
  fastify.post('/products/:productId/media/sync', {
    preHandler: authenticate,
    schema: {
      description: '同步商品媒体到其他存储方式',
      tags: ['Product Media'],
      params: {
        type: 'object',
        properties: {
          productId: { type: 'integer', description: '商品ID' }
        },
        required: ['productId']
      },
      body: {
        type: 'object',
        properties: {
          target_storage: {
            type: 'string',
            enum: ['aliyun_oss', 'local'],
            description: '目标存储类型'
          },
          delete_source: {
            type: 'boolean',
            default: false,
            description: '是否删除源文件'
          }
        },
        required: ['target_storage']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
    try {
      const productId = parseInt(request.params.productId);
      const { target_storage, delete_source = false } = request.body;

      const result = await mediaService.syncProductMediaToStorage(
        productId,
        target_storage,
        delete_source
      );

      reply.send(result);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : '媒体同步失败'
      });
    }
  });

  // 获取存储状态
  fastify.get('/storage/status', {
    schema: {
      description: '获取当前存储配置状态',
      tags: ['Product Media'],
      response: {
        200: {
          type: 'object',
          properties: {
            current_storage: { type: 'string', description: '当前存储类型' },
            available_storages: {
              type: 'object',
              description: '可用存储配置'
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentStorage = await mediaService.getCurrentStorageType();
      const availableStorages = await mediaService.getAvailableStorages();

      reply.send({
        current_storage: currentStorage,
        available_storages: availableStorages
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : '获取存储状态失败'
      });
    }
  });
}

export default productMediaRoutes;