import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { StorageConfigService } from './config-service.js';
import { StorageManager } from './storage-manager.js';
import {
  StorageType,
  StorageStatus,
  CreateStorageConfigRequest,
  UpdateStorageConfigRequest,
  StorageConfigListQuery
} from './types.js';

export default async function storageRoutes(fastify: FastifyInstance) {
  const storageConfigService = new StorageConfigService();
  const storageManager = new StorageManager();

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

  // 获取存储状态概览
  fastify.get('/status', {
    preHandler: authenticate,
    schema: {
      description: '获取存储状态概览',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                storages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      isDefault: { type: 'boolean' },
                      isAvailable: { type: 'boolean' },
                      connectionStatus: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          message: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                current: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply) => {
    try {
      const status = await storageManager.getAvailableStorages();

      return reply.send({
        success: true,
        data: status
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取存储状态失败'
      });
    }
  });

  // 切换默认存储
  fastify.post('/switch/:type', {
    preHandler: authenticate,
    schema: {
      description: '切换默认存储类型（切换到阿里云OSS或本地存储）',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['aliyun_oss', 'local'],
            description: '存储类型：aliyun_oss（阿里云OSS）或 local（本地存储）'
          }
        },
        required: ['type']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string', description: '切换结果消息' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { type: StorageType } }>, reply) => {
    try {
      await storageManager.switchDefaultStorage(request.params.type);

      return reply.send({
        success: true,
        message: `已切换到 ${request.params.type} 存储`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '切换存储失败'
      });
    }
  });

  // 获取存储配置列表
  fastify.get('/config', {
    preHandler: authenticate,
    schema: {
      description: '获取存储配置列表',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
          storage_type: { type: 'string', enum: ['aliyun_oss', 'local'] },
          status: { type: 'string', enum: ['active', 'inactive', 'disabled'] },
          is_default: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: StorageConfigListQuery }>, reply) => {
    try {
      const result = await storageConfigService.getStorageConfigs(request.query);

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取存储配置列表失败'
      });
    }
  });

  // 获取指定类型的存储配置
  fastify.get('/config/:type', {
    preHandler: authenticate,
    schema: {
      description: '获取指定类型的存储配置',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['aliyun_oss', 'local'] }
        },
        required: ['type']
      }
    }
  }, async (request: FastifyRequest<{ Params: { type: StorageType } }>, reply) => {
    try {
      const storageConfig = await storageConfigService.getStorageConfigByType(request.params.type);

      if (!storageConfig) {
        return reply.status(404).send({
          success: false,
          message: '存储配置不存在'
        });
      }

      return reply.send({
        success: true,
        data: storageConfig
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '获取存储配置失败'
      });
    }
  });

  // 创建存储配置
  fastify.post('/config', {
    preHandler: authenticate,
    schema: {
      description: '创建存储配置（包括阿里云OSS配置）',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          storage_type: {
            type: 'string',
            enum: ['aliyun_oss', 'local'],
            description: '存储类型'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'disabled'],
            description: '存储状态'
          },
          is_default: {
            type: 'boolean',
            description: '是否设为默认存储'
          },
          config: {
            type: 'object',
            description: 'OSS配置对象，包含accessKeyId、accessKeySecret、region、bucket等字段',
            additionalProperties: true
          }
        },
        required: ['storage_type', 'status', 'is_default', 'config']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                storage_type: { type: 'string' },
                status: { type: 'string' },
                is_default: { type: 'boolean' },
                config: { type: 'object' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' }
              }
            },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateStorageConfigRequest }>, reply) => {
    try {
      const storageConfig = await storageConfigService.createStorageConfig(request.body);

      // 如果设置为默认存储，重置存储管理器
      if (request.body.is_default) {
        storageManager.resetAllConfigs();
      }

      return reply.status(201).send({
        success: true,
        data: storageConfig,
        message: '存储配置创建成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '创建存储配置失败'
      });
    }
  });

  // 更新存储配置
  fastify.put('/config/:type', {
    preHandler: authenticate,
    schema: {
      description: '更新存储配置',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['aliyun_oss', 'local'] }
        },
        required: ['type']
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'disabled'] },
          is_default: { type: 'boolean' },
          config: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { type: StorageType }, Body: UpdateStorageConfigRequest }>, reply) => {
    try {
      const storageConfig = await storageConfigService.updateStorageConfig(
        request.params.type,
        request.body
      );

      if (!storageConfig) {
        return reply.status(404).send({
          success: false,
          message: '存储配置不存在'
        });
      }

      // 重置存储管理器配置
      storageManager.resetAllConfigs();

      return reply.send({
        success: true,
        data: storageConfig,
        message: '存储配置更新成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '更新存储配置失败'
      });
    }
  });

  // 删除存储配置
  fastify.delete('/config/:type', {
    preHandler: authenticate,
    schema: {
      description: '删除存储配置',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['aliyun_oss', 'local'] }
        },
        required: ['type']
      }
    }
  }, async (request: FastifyRequest<{ Params: { type: StorageType } }>, reply) => {
    try {
      const deleted = await storageConfigService.deleteStorageConfig(request.params.type);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          message: '存储配置不存在'
        });
      }

      // 重置存储管理器配置
      storageManager.resetAllConfigs();

      return reply.send({
        success: true,
        message: '存储配置删除成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '删除存储配置失败'
      });
    }
  });

  // 测试存储连接
  fastify.post('/config/:type/test', {
    preHandler: authenticate,
    schema: {
      description: '测试阿里云OSS或本地存储连接',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['aliyun_oss', 'local'],
            description: '存储类型：aliyun_oss（阿里云OSS）或 local（本地存储）'
          }
        },
        required: ['type']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: '连接是否成功' },
            message: { type: 'string', description: '连接结果消息' },
            data: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { type: StorageType } }>, reply) => {
    try {
      const service = await storageManager.getStorageService(request.params.type);
      const result = await service.testConnection();

      return reply.send({
        success: result.success,
        message: result.message,
        data: result
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '测试连接失败'
      });
    }
  });

  // 文件上传接口（使用当前默认存储）
  fastify.post('/upload', {
    preHandler: authenticate,
    schema: {
      description: '文件上传',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data']
    }
  }, async (request: FastifyRequest, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          message: '未找到上传文件'
        });
      }

      // 读取文件数据
      const fileBuffer = await data.toBuffer();

      // 使用存储管理器上传文件（自动选择当前默认存储）
      const uploadResult = await storageManager.uploadFile(
        data.filename,
        fileBuffer,
        {
          contentType: data.mimetype,
          generateThumbnail: true, // 对视频生成缩略图
          compressImage: true      // 对图片进行压缩
        }
      );

      // 获取当前存储类型
      const currentType = await storageManager.getCurrentStorageType();

      return reply.send({
        success: true,
        data: {
          ...uploadResult,
          storage_type: currentType
        },
        message: '文件上传成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '文件上传失败'
      });
    }
  });

  // 批量文件上传
  fastify.post('/upload/batch', {
    preHandler: authenticate,
    schema: {
      description: '批量文件上传',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data']
    }
  }, async (request: FastifyRequest, reply) => {
    try {
      const files = request.files();
      const uploadResults = [];
      const errors = [];

      for await (const data of files) {
        try {
          const fileBuffer = await data.toBuffer();

          const uploadResult = await storageManager.uploadFile(
            data.filename,
            fileBuffer,
            {
              contentType: data.mimetype,
              generateThumbnail: true,
              compressImage: true
            }
          );

          uploadResults.push({
            originalName: data.filename,
            ...uploadResult
          });
        } catch (error) {
          errors.push({
            originalName: data.filename,
            error: error instanceof Error ? error.message : '上传失败'
          });
        }
      }

      const currentType = await storageManager.getCurrentStorageType();

      return reply.send({
        success: true,
        data: {
          uploaded: uploadResults,
          errors: errors,
          storage_type: currentType,
          total: uploadResults.length + errors.length,
          success_count: uploadResults.length,
          error_count: errors.length
        },
        message: `批量上传完成: 成功 ${uploadResults.length} 个，失败 ${errors.length} 个`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: '批量上传失败'
      });
    }
  });

  // 删除文件
  fastify.delete('/file/:key', {
    preHandler: authenticate,
    schema: {
      description: '删除文件',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      }
    }
  }, async (request: FastifyRequest<{ Params: { key: string } }>, reply) => {
    try {
      // URL解码文件key
      const key = decodeURIComponent(request.params.key);

      await storageManager.deleteFile(key);

      return reply.send({
        success: true,
        message: '文件删除成功'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '文件删除失败'
      });
    }
  });

  // 获取文件信息
  fastify.get('/file/:key/info', {
    preHandler: authenticate,
    schema: {
      description: '获取文件信息',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      }
    }
  }, async (request: FastifyRequest<{ Params: { key: string } }>, reply) => {
    try {
      const key = decodeURIComponent(request.params.key);

      const fileInfo = await storageManager.getFileInfo(key);
      const currentType = await storageManager.getCurrentStorageType();

      return reply.send({
        success: true,
        data: {
          ...fileInfo,
          storage_type: currentType
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '获取文件信息失败'
      });
    }
  });

  // 列出文件
  fastify.get('/files', {
    preHandler: authenticate,
    schema: {
      description: '列出文件',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          prefix: { type: 'string' },
          maxKeys: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          marker: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { prefix?: string; maxKeys?: number; marker?: string } }>, reply) => {
    try {
      const { prefix, maxKeys = 100, marker } = request.query;

      const result = await storageManager.listFiles(prefix, maxKeys, marker);
      const currentType = await storageManager.getCurrentStorageType();

      return reply.send({
        success: true,
        data: {
          ...result,
          storage_type: currentType
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '列出文件失败'
      });
    }
  });

  // 同步文件到其他存储
  fastify.post('/sync/:key', {
    preHandler: authenticate,
    schema: {
      description: '同步文件到其他存储',
      tags: ['存储管理'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      },
      body: {
        type: 'object',
        properties: {
          target_storage: { type: 'string', enum: ['aliyun_oss', 'local'] },
          delete_source: { type: 'boolean', default: false }
        },
        required: ['target_storage']
      }
    }
  }, async (request: FastifyRequest<{
    Params: { key: string },
    Body: { target_storage: StorageType, delete_source?: boolean }
  }>, reply) => {
    try {
      const key = decodeURIComponent(request.params.key);
      const { target_storage, delete_source = false } = request.body;

      const result = await storageManager.syncToStorage(key, target_storage, delete_source);

      return reply.send({
        success: result.success,
        data: result.newKey ? { newKey: result.newKey } : null,
        message: result.message
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : '文件同步失败'
      });
    }
  });
}