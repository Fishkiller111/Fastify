import OSS from 'ali-oss';
import mime from 'mime-types';
import path from 'path';
import { OSSConfig, UploadResult, UploadOptions, IStorageService, FileType, MediaFormat } from './types.js';
import { StorageConfigService } from './config-service.js';
import { StorageType } from './types.js';

export class OSSService implements IStorageService {
  private configService: StorageConfigService;
  private ossClient: OSS | null = null;

  constructor() {
    this.configService = new StorageConfigService();
  }

  // 初始化OSS客户端
  private async initOSSClient(): Promise<OSS> {
    if (this.ossClient) {
      return this.ossClient;
    }

    const config = await this.configService.getStorageConfigByType(StorageType.ALIYUN_OSS);
    if (!config) {
      throw new Error('OSS配置不存在');
    }

    const ossConfig = config.config as OSSConfig;

    // 验证必要配置
    if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.region || !ossConfig.bucket) {
      throw new Error('OSS配置不完整，缺少必要参数');
    }

    this.ossClient = new OSS({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      endpoint: ossConfig.endpoint,
      internal: ossConfig.internal,
      secure: ossConfig.secure,
      timeout: ossConfig.timeout || 60000 // 默认60秒超时
    });

    return this.ossClient;
  }

  // 获取OSS配置
  async getOSSConfig(): Promise<OSSConfig> {
    const config = await this.configService.getStorageConfigByType(StorageType.ALIYUN_OSS);
    if (!config) {
      throw new Error('OSS配置不存在');
    }
    return config.config as OSSConfig;
  }

  // 上传文件
  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const client = await this.initOSSClient();
    const config = await this.getOSSConfig();

    try {
      // 生成文件key（路径）
      const key = this.generateFileKey(fileName);

      // 设置上传选项
      const uploadOptions: any = {
        headers: options.headers || {},
        timeout: options.timeout || 60000
      };

      // 设置Content-Type
      if (options.contentType) {
        uploadOptions.headers['Content-Type'] = options.contentType;
      }

      // 执行上传
      const result = await client.put(key, fileBuffer, uploadOptions);

      // 获取文件类型和格式
      const fileType = this.getFileType(fileName);
      const format = this.getMediaFormat(fileName);

      // 构建返回结果
      const uploadResult: UploadResult = {
        url: (result as any).url || `https://${config.bucket}.${config.region}.aliyuncs.com/${result.name}`,
        key: result.name,
        size: fileBuffer.length,
        etag: (result.res?.headers as any)?.etag || (result as any).etag || '',
        bucket: config.bucket,
        fileType,
        format
      };

      return uploadResult;
    } catch (error) {
      throw new Error(`文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 上传文件流
  async uploadStream(
    fileName: string,
    stream: NodeJS.ReadableStream,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const client = await this.initOSSClient();
    const config = await this.getOSSConfig();

    try {
      const key = this.generateFileKey(fileName);

      const uploadOptions: any = {
        headers: options.headers || {},
        timeout: options.timeout || 60000
      };

      if (options.contentType) {
        uploadOptions.headers['Content-Type'] = options.contentType;
      }

      const result = await client.putStream(key, stream, uploadOptions);

      // 获取文件类型和格式
      const fileType = this.getFileType(fileName);
      const format = this.getMediaFormat(fileName);

      return {
        url: (result as any).url || `https://${config.bucket}.${config.region}.aliyuncs.com/${result.name}`,
        key: result.name,
        size: 0, // 流上传无法提前知道大小
        etag: (result.res?.headers as any)?.etag || (result as any).etag || '',
        bucket: config.bucket,
        fileType,
        format
      };
    } catch (error) {
      throw new Error(`文件流上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 删除文件
  async deleteFile(key: string): Promise<void> {
    const client = await this.initOSSClient();

    try {
      await client.delete(key);
    } catch (error) {
      throw new Error(`文件删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 批量删除文件
  async deleteFiles(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const client = await this.initOSSClient();

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const key of keys) {
      try {
        await client.delete(key);
        deleted.push(key);
      } catch (error) {
        failed.push(key);
      }
    }

    return { deleted, failed };
  }

  // 获取文件信息
  async getFileInfo(key: string): Promise<any> {
    const client = await this.initOSSClient();

    try {
      const result = await client.head(key);
      return result;
    } catch (error) {
      throw new Error(`获取文件信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 检查文件是否存在
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.getFileInfo(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 生成预签名URL
  async generatePresignedUrl(
    key: string,
    expires: number = 3600,
    method: string = 'GET'
  ): Promise<string> {
    const client = await this.initOSSClient();

    try {
      const url = client.signatureUrl(key, {
        expires,
        method: method as any
      });
      return url;
    } catch (error) {
      throw new Error(`生成预签名URL失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 生成上传预签名URL
  async generateUploadPresignedUrl(
    fileName: string,
    expires: number = 3600,
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const client = await this.initOSSClient();

    try {
      const key = this.generateFileKey(fileName);

      const conditions: any[] = [];

      // 添加content-type条件
      if (contentType) {
        conditions.push(['eq', '$Content-Type', contentType]);
      }

      const policy = {
        expiration: new Date(Date.now() + expires * 1000).toISOString(),
        conditions: conditions
      };

      const formData = await client.calculatePostSignature(policy);

      // 构建上传URL（使用简单的方式）
      const url = await client.signatureUrl(key, {
        method: 'PUT',
        expires,
        'Content-Type': contentType
      });

      return { url, key };
    } catch (error) {
      throw new Error(`生成上传预签名URL失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 列出文件
  async listFiles(
    prefix: string = '',
    maxKeys: number = 100,
    marker?: string
  ): Promise<{ files: any[]; nextMarker?: string; isTruncated: boolean }> {
    const client = await this.initOSSClient();

    try {
      const result = await client.list({
        prefix,
        'max-keys': maxKeys,
        marker
      }, {});

      return {
        files: result.objects || [],
        nextMarker: result.nextMarker,
        isTruncated: result.isTruncated || false
      };
    } catch (error) {
      throw new Error(`列出文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 测试OSS连接
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.initOSSClient();
      const config = await this.getOSSConfig();

      // 测试bucket信息获取
      const bucketInfo = await client.getBucketInfo(config.bucket) as any;

      return {
        success: true,
        message: `连接成功，bucket: ${bucketInfo.bucket.Name}`
      };
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 获取文件类型
  private getFileType(fileName: string): FileType {
    const mimeType = mime.lookup(fileName);
    if (!mimeType) return FileType.OTHER;

    if (mimeType.startsWith('image/')) return FileType.IMAGE;
    if (mimeType.startsWith('video/')) return FileType.VIDEO;
    if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) {
      return FileType.DOCUMENT;
    }
    return FileType.OTHER;
  }

  // 获取媒体格式
  private getMediaFormat(fileName: string): MediaFormat | undefined {
    const ext = path.extname(fileName).toLowerCase().substring(1);
    const formatMap: Record<string, MediaFormat> = {
      'jpg': MediaFormat.JPEG,
      'jpeg': MediaFormat.JPEG,
      'png': MediaFormat.PNG,
      'gif': MediaFormat.GIF,
      'webp': MediaFormat.WEBP,
      'mp4': MediaFormat.MP4,
      'avi': MediaFormat.AVI,
      'mov': MediaFormat.MOV,
      'wmv': MediaFormat.WMV,
      'flv': MediaFormat.FLV,
      'mkv': MediaFormat.MKV
    };
    return formatMap[ext];
  }

  // 生成文件键名
  private generateFileKey(fileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
    const fileType = this.getFileType(fileName);

    // 生成目录结构：类型/年/月/日
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return `uploads/${fileType}/${year}/${month}/${day}/${timestamp}_${random}_${baseName}${ext}`;
  }

  // 重置客户端（配置更新时调用）
  resetClient(): void {
    this.ossClient = null;
  }
}