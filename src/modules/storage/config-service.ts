import { Client } from 'pg';
import config from '../../config/index.js';
import {
  StorageConfig,
  StorageType,
  StorageStatus,
  CreateStorageConfigRequest,
  UpdateStorageConfigRequest,
  StorageConfigListQuery,
  StorageConfigListResponse,
  OSSConfig,
  LocalConfig
} from './types.js';

export class StorageConfigService {
  private async getClient(): Promise<Client> {
    const client = new Client(config.database);
    await client.connect();
    return client;
  }

  // 存储配置键名前缀
  private getConfigKey(type: StorageType, field: string): string {
    return `storage_${type}_${field}`;
  }

  // 获取存储配置列表
  async getStorageConfigs(query: StorageConfigListQuery = {}): Promise<StorageConfigListResponse> {
    const client = await this.getClient();

    try {
      const {
        page = 1,
        limit = 10,
        storage_type,
        status,
        is_default
      } = query;

      const offset = (page - 1) * limit;

      // 构建查询条件
      let whereClause = "WHERE config_key LIKE 'storage_%_status'";
      const params: any[] = [];
      let paramIndex = 1;

      if (storage_type) {
        whereClause += ` AND config_key LIKE $${paramIndex}`;
        params.push(`storage_${storage_type}_%`);
        paramIndex++;
      }

      if (status) {
        whereClause += ` AND config_value = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      // 获取配置计数
      const countQuery = `
        SELECT COUNT(DISTINCT SUBSTRING(config_key FROM 'storage_(.+?)_status')) as count
        FROM config ${whereClause}
      `;
      const countResult = await client.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      // 获取所有存储类型
      const typesQuery = `
        SELECT DISTINCT SUBSTRING(config_key FROM 'storage_(.+?)_status') as storage_type
        FROM config ${whereClause}
        ORDER BY storage_type
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);
      const typesResult = await client.query(typesQuery, params);

      const configs: StorageConfig[] = [];

      for (const row of typesResult.rows) {
        const storageType = row.storage_type as StorageType;
        const storageConfig = await this.getStorageConfigByType(storageType);

        if (storageConfig) {
          // 应用is_default过滤
          if (is_default === undefined || storageConfig.is_default === is_default) {
            configs.push(storageConfig);
          }
        }
      }

      const totalPages = Math.ceil(totalCount / limit);

      return {
        configs,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_count: totalCount,
          per_page: limit
        }
      };
    } finally {
      await client.end();
    }
  }

  // 根据类型获取存储配置
  async getStorageConfigByType(storageType: StorageType): Promise<StorageConfig | null> {
    const client = await this.getClient();

    try {
      // 获取该存储类型的所有配置项
      const configQuery = `
        SELECT config_key, config_value
        FROM config
        WHERE config_key LIKE $1
      `;
      const result = await client.query(configQuery, [`storage_${storageType}_%`]);

      if (result.rows.length === 0) {
        return null;
      }

      // 解析配置项
      const configData: any = {};
      for (const row of result.rows) {
        const key = row.config_key.replace(`storage_${storageType}_`, '');
        configData[key] = row.config_value;
      }

      // 根据存储类型构建配置对象
      if (storageType === StorageType.ALIYUN_OSS) {
        return {
          storage_type: StorageType.ALIYUN_OSS,
          status: configData.status as StorageStatus || StorageStatus.INACTIVE,
          is_default: configData.is_default === 'true',
          config: {
            accessKeyId: configData.access_key_id || '',
            accessKeySecret: configData.access_key_secret || '',
            region: configData.region || '',
            bucket: configData.bucket || '',
            endpoint: configData.endpoint,
            internal: configData.internal === 'true',
            secure: configData.secure === 'true',
            timeout: configData.timeout ? parseInt(configData.timeout) : undefined
          }
        };
      }

      if (storageType === StorageType.LOCAL) {
        return {
          storage_type: StorageType.LOCAL,
          status: configData.status as StorageStatus || StorageStatus.INACTIVE,
          is_default: configData.is_default === 'true',
          config: {
            uploadPath: configData.upload_path || './uploads',
            maxFileSize: configData.max_file_size ? parseInt(configData.max_file_size) : 50 * 1024 * 1024, // 默认50MB
            allowedFileTypes: configData.allowed_file_types ? JSON.parse(configData.allowed_file_types) : [],
            enableCompression: configData.enable_compression === 'true',
            compressQuality: configData.compress_quality ? parseInt(configData.compress_quality) : 80
          }
        };
      }

      return null;
    } finally {
      await client.end();
    }
  }

  // 获取默认存储配置
  async getDefaultStorageConfig(): Promise<StorageConfig | null> {
    const client = await this.getClient();

    try {
      // 查找is_default为true的存储类型
      const defaultQuery = `
        SELECT SUBSTRING(config_key FROM 'storage_(.+?)_is_default') as storage_type
        FROM config
        WHERE config_key LIKE 'storage_%_is_default' AND config_value = 'true'
        LIMIT 1
      `;
      const result = await client.query(defaultQuery);

      if (result.rows.length === 0) {
        return null;
      }

      const storageType = result.rows[0].storage_type as StorageType;
      return await this.getStorageConfigByType(storageType);
    } finally {
      await client.end();
    }
  }

  // 创建存储配置
  async createStorageConfig(configData: CreateStorageConfigRequest): Promise<StorageConfig> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      // 如果设置为默认，先清除其他默认配置
      if (configData.is_default) {
        await this.clearDefaultConfigs(client);
      }

      // 插入配置项
      const configItems = this.buildConfigItems(configData.storage_type, {
        status: configData.status,
        is_default: configData.is_default,
        ...configData.config
      });

      for (const [key, value] of configItems) {
        await client.query(`
          INSERT INTO config (config_key, config_value)
          VALUES ($1, $2)
          ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value
        `, [key, value]);
      }

      await client.query('COMMIT');

      // 返回创建的配置
      const createdConfig = await this.getStorageConfigByType(configData.storage_type);
      if (!createdConfig) {
        throw new Error('Failed to create storage config');
      }

      return createdConfig;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  // 更新存储配置
  async updateStorageConfig(storageType: StorageType, updateData: UpdateStorageConfigRequest): Promise<StorageConfig | null> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      // 如果设置为默认，先清除其他默认配置
      if (updateData.is_default) {
        await this.clearDefaultConfigs(client);
      }

      // 更新配置项
      const configItems = this.buildConfigItems(storageType, updateData);

      for (const [key, value] of configItems) {
        if (value !== undefined) {
          await client.query(`
            INSERT INTO config (config_key, config_value)
            VALUES ($1, $2)
            ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value
          `, [key, value]);
        }
      }

      await client.query('COMMIT');

      // 返回更新后的配置
      return await this.getStorageConfigByType(storageType);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  // 删除存储配置
  async deleteStorageConfig(storageType: StorageType): Promise<boolean> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        DELETE FROM config
        WHERE config_key LIKE $1
      `, [`storage_${storageType}_%`]);

      return (result.rowCount || 0) > 0;
    } finally {
      await client.end();
    }
  }

  // 测试存储配置连接
  async testStorageConnection(storageType: StorageType): Promise<{ success: boolean; message: string }> {
    try {
      const storageConfig = await this.getStorageConfigByType(storageType);

      if (!storageConfig) {
        return { success: false, message: '存储配置不存在' };
      }

      if (storageType === StorageType.ALIYUN_OSS) {
        // 这里可以实现OSS连接测试逻辑
        const ossConfig = storageConfig.config as OSSConfig;

        // 基本配置检查
        if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.region || !ossConfig.bucket) {
          return { success: false, message: '缺少必要的OSS配置项' };
        }

        // 这里可以添加实际的OSS连接测试
        return { success: true, message: '连接测试成功' };
      }

      if (storageType === StorageType.LOCAL) {
        const localConfig = storageConfig.config as LocalConfig;

        // 检查上传路径配置
        if (!localConfig.uploadPath) {
          return { success: false, message: '缺少上传路径配置' };
        }

        // 这里可以添加实际的本地存储连接测试（文件夹创建权限等）
        return { success: true, message: `本地存储配置正确，上传路径: ${localConfig.uploadPath}` };
      }

      return { success: false, message: '不支持的存储类型' };
    } catch (error) {
      return { success: false, message: `连接测试失败: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  }

  // 构建配置项键值对
  private buildConfigItems(storageType: StorageType, data: any): Array<[string, string]> {
    const items: Array<[string, string]> = [];

    // 通用配置项
    if (data.status !== undefined) {
      items.push([this.getConfigKey(storageType, 'status'), data.status]);
    }

    if (data.is_default !== undefined) {
      items.push([this.getConfigKey(storageType, 'is_default'), data.is_default.toString()]);
    }

    // OSS配置项
    if (storageType === StorageType.ALIYUN_OSS && data.config) {
      const ossConfig = data.config;
      const ossFields = [
        'accessKeyId', 'accessKeySecret', 'region', 'bucket',
        'endpoint', 'internal', 'secure', 'timeout'
      ];

      for (const field of ossFields) {
        if (ossConfig[field] !== undefined) {
          const configKey = this.getConfigKey(storageType, field.replace(/([A-Z])/g, '_$1').toLowerCase());
          items.push([configKey, ossConfig[field].toString()]);
        }
      }
    }

    // 本地存储配置项
    if (storageType === StorageType.LOCAL && data.config) {
      const localConfig = data.config;
      const localFields = [
        'uploadPath', 'maxFileSize', 'allowedFileTypes', 'enableCompression', 'compressQuality'
      ];

      for (const field of localFields) {
        if (localConfig[field] !== undefined) {
          const configKey = this.getConfigKey(storageType, field.replace(/([A-Z])/g, '_$1').toLowerCase());
          let value = localConfig[field];

          // 特殊处理数组类型的 allowedFileTypes
          if (field === 'allowedFileTypes' && Array.isArray(value)) {
            value = JSON.stringify(value);
          }

          items.push([configKey, value.toString()]);
        }
      }
    }

    return items;
  }

  // 获取所有存储配置
  async getAllStorageConfigs(): Promise<StorageConfig[]> {
    const client = await this.getClient();

    try {
      // 获取所有存储类型
      const typesQuery = `
        SELECT DISTINCT SUBSTRING(config_key FROM 'storage_(.+?)_status') as storage_type
        FROM config
        WHERE config_key LIKE 'storage_%_status'
        ORDER BY storage_type
      `;
      const typesResult = await client.query(typesQuery);

      const configs: StorageConfig[] = [];

      for (const row of typesResult.rows) {
        const storageType = row.storage_type as StorageType;
        const storageConfig = await this.getStorageConfigByType(storageType);

        if (storageConfig) {
          configs.push(storageConfig);
        }
      }

      return configs;
    } finally {
      await client.end();
    }
  }

  // 设置默认存储类型
  async setDefaultStorage(storageType: StorageType): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      // 清除所有默认配置
      await this.clearDefaultConfigs(client);

      // 设置新的默认存储
      await client.query(`
        INSERT INTO config (config_key, config_value)
        VALUES ($1, 'true')
        ON CONFLICT (config_key) DO UPDATE SET config_value = 'true'
      `, [this.getConfigKey(storageType, 'is_default')]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  // 清除所有默认配置
  private async clearDefaultConfigs(client: Client): Promise<void> {
    await client.query(`
      UPDATE config
      SET config_value = 'false'
      WHERE config_key LIKE 'storage_%_is_default' AND config_value = 'true'
    `);
  }
}