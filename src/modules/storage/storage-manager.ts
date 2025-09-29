import {
  IStorageService,
  StorageType,
  StorageConfig,
  UploadResult,
  UploadOptions
} from './types.js';
import { StorageConfigService } from './config-service.js';
import { OSSService } from './oss-service.js';
import { LocalStorageService } from './local-service.js';

/**
 * 统一存储管理器
 * 负责根据配置动态选择存储服务（OSS或本地存储）
 */
export class StorageManager implements IStorageService {
  private configService: StorageConfigService;
  private ossService: OSSService;
  private localService: LocalStorageService;
  private currentService: IStorageService | null = null;
  private currentType: StorageType | null = null;

  constructor() {
    this.configService = new StorageConfigService();
    this.ossService = new OSSService();
    this.localService = new LocalStorageService();
  }

  /**
   * 获取当前活动的存储服务
   */
  private async getCurrentService(): Promise<IStorageService> {
    // 获取默认存储配置
    const defaultConfig = await this.configService.getDefaultStorageConfig();
    if (!defaultConfig) {
      throw new Error('未找到默认存储配置');
    }

    // 如果存储类型发生变化，重置当前服务
    if (this.currentType !== defaultConfig.storage_type) {
      this.currentService = null;
      this.currentType = defaultConfig.storage_type;
    }

    // 如果已有服务且类型匹配，直接返回
    if (this.currentService && this.currentType === defaultConfig.storage_type) {
      return this.currentService;
    }

    // 根据配置类型创建相应服务
    switch (defaultConfig.storage_type) {
      case StorageType.ALIYUN_OSS:
        this.currentService = this.ossService;
        break;
      case StorageType.LOCAL:
        this.currentService = this.localService;
        break;
      default:
        throw new Error(`不支持的存储类型: ${(defaultConfig as any).storage_type}`);
    }

    return this.currentService;
  }

  /**
   * 获取指定类型的存储服务
   */
  async getStorageService(storageType: StorageType): Promise<IStorageService> {
    switch (storageType) {
      case StorageType.ALIYUN_OSS:
        return this.ossService;
      case StorageType.LOCAL:
        return this.localService;
      default:
        throw new Error(`不支持的存储类型: ${storageType}`);
    }
  }

  /**
   * 切换默认存储类型
   */
  async switchDefaultStorage(storageType: StorageType): Promise<void> {
    // 验证目标存储配置是否存在
    const targetConfig = await this.configService.getStorageConfigByType(storageType);
    if (!targetConfig) {
      throw new Error(`${storageType} 存储配置不存在`);
    }

    // 测试目标存储连接
    const targetService = await this.getStorageService(storageType);
    const testResult = await targetService.testConnection();
    if (!testResult.success) {
      throw new Error(`${storageType} 存储连接测试失败: ${testResult.message}`);
    }

    // 更新默认存储配置
    await this.configService.setDefaultStorage(storageType);

    // 重置当前服务，下次调用时会自动切换
    this.currentService = null;
    this.currentType = null;

    // 重置所有服务的缓存配置
    this.ossService.resetClient();
    this.localService.resetConfig();
  }

  /**
   * 获取所有可用的存储类型及其状态
   */
  async getAvailableStorages(): Promise<{
    storages: Array<{
      type: StorageType;
      isDefault: boolean;
      isAvailable: boolean;
      config: StorageConfig | null;
      connectionStatus: { success: boolean; message: string };
    }>;
    current: StorageType | null;
  }> {
    const allConfigs = await this.configService.getAllStorageConfigs();
    const current = this.currentType;

    const storages = await Promise.all([
      StorageType.ALIYUN_OSS,
      StorageType.LOCAL
    ].map(async (type) => {
      const config = allConfigs.find(c => c && c.storage_type === type) || null;
      let connectionStatus = { success: false, message: '配置不存在' };

      if (config) {
        try {
          const service = await this.getStorageService(type);
          connectionStatus = await service.testConnection();
        } catch (error) {
          connectionStatus = {
            success: false,
            message: error instanceof Error ? error.message : '连接测试失败'
          };
        }
      }

      return {
        type,
        isDefault: config?.is_default || false,
        isAvailable: connectionStatus.success,
        config,
        connectionStatus
      };
    }));

    return { storages, current };
  }

  /**
   * 同步数据到其他存储
   * 将文件从当前存储同步到指定存储
   */
  async syncToStorage(
    key: string,
    targetStorageType: StorageType,
    deleteSource: boolean = false
  ): Promise<{ success: boolean; message: string; newKey?: string }> {
    try {
      const currentService = await this.getCurrentService();
      const targetService = await this.getStorageService(targetStorageType);

      // 检查源文件是否存在
      if (!await currentService.fileExists(key)) {
        return { success: false, message: '源文件不存在' };
      }

      // 获取源文件信息
      const fileInfo = await currentService.getFileInfo(key);

      // 对于本地存储，需要读取文件内容
      if (this.currentType === StorageType.LOCAL) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const config = await this.configService.getStorageConfigByType(StorageType.LOCAL);
        if (!config) throw new Error('本地存储配置不存在');

        const localConfig = config.config as any;
        const fullPath = path.join(localConfig.uploadPath, key);
        const fileBuffer = await fs.readFile(fullPath);

        // 上传到目标存储
        const fileName = path.basename(key);
        const uploadResult = await targetService.uploadFile(fileName, fileBuffer);

        // 如果需要删除源文件
        if (deleteSource) {
          await currentService.deleteFile(key);
        }

        return {
          success: true,
          message: `文件已同步到 ${targetStorageType}`,
          newKey: uploadResult.key
        };
      }

      // 对于OSS存储，需要先下载再上传（这里简化处理）
      return {
        success: false,
        message: '暂不支持从OSS同步，请手动处理'
      };

    } catch (error) {
      return {
        success: false,
        message: `同步失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 实现 IStorageService 接口方法

  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const service = await this.getCurrentService();
    return service.uploadFile(fileName, fileBuffer, options);
  }

  async uploadStream(
    fileName: string,
    stream: NodeJS.ReadableStream,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const service = await this.getCurrentService();
    return service.uploadStream(fileName, stream, options);
  }

  async deleteFile(key: string): Promise<void> {
    const service = await this.getCurrentService();
    return service.deleteFile(key);
  }

  async deleteFiles(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const service = await this.getCurrentService();
    return service.deleteFiles(keys);
  }

  async getFileInfo(key: string): Promise<any> {
    const service = await this.getCurrentService();
    return service.getFileInfo(key);
  }

  async fileExists(key: string): Promise<boolean> {
    const service = await this.getCurrentService();
    return service.fileExists(key);
  }

  async listFiles(
    prefix?: string,
    maxKeys?: number,
    marker?: string
  ): Promise<{ files: any[]; nextMarker?: string; isTruncated: boolean }> {
    const service = await this.getCurrentService();
    return service.listFiles(prefix, maxKeys, marker);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const service = await this.getCurrentService();
      return service.testConnection();
    } catch (error) {
      return {
        success: false,
        message: `存储服务测试失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取当前存储类型
   */
  async getCurrentStorageType(): Promise<StorageType | null> {
    try {
      await this.getCurrentService(); // 这会设置 currentType
      return this.currentType;
    } catch (error) {
      return null;
    }
  }

  /**
   * 重置所有服务配置
   */
  resetAllConfigs(): void {
    this.currentService = null;
    this.currentType = null;
    this.ossService.resetClient();
    this.localService.resetConfig();
  }
}