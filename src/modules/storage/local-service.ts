import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import mime from 'mime-types';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import {
  LocalConfig,
  UploadResult,
  UploadOptions,
  IStorageService,
  FileType,
  MediaFormat,
  FileInfo,
  VideoProcessOptions,
  ImageProcessOptions
} from './types.js';
import { StorageConfigService } from './config-service.js';
import { StorageType } from './types.js';

// 设置 FFmpeg 路径
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export class LocalStorageService implements IStorageService {
  private configService: StorageConfigService;
  private config: LocalConfig | null = null;

  constructor() {
    this.configService = new StorageConfigService();
  }

  // 初始化本地存储配置
  private async initConfig(): Promise<LocalConfig> {
    if (this.config) {
      return this.config;
    }

    const storageConfig = await this.configService.getStorageConfigByType(StorageType.LOCAL);
    if (!storageConfig) {
      throw new Error('本地存储配置不存在');
    }

    this.config = storageConfig.config as LocalConfig;

    // 确保上传目录存在
    await this.ensureDirectoryExists(this.config.uploadPath);

    return this.config;
  }

  // 确保目录存在
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  // 生成文件路径
  private generateFilePath(fileName: string, fileType: FileType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    // 生成目录结构：类型/年/月/日
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const relativePath = `${fileType}/${year}/${month}/${day}/${timestamp}_${random}_${baseName}${ext}`;
    return relativePath;
  }

  // 获取文件完整路径
  private async getFullPath(relativePath: string): Promise<string> {
    const config = await this.initConfig();
    return path.join(config.uploadPath, relativePath);
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

  // 处理图片
  private async processImage(
    inputPath: string,
    outputPath: string,
    options: ImageProcessOptions = {}
  ): Promise<{ width: number; height: number }> {
    let sharpInstance = sharp(inputPath);

    // 调整尺寸
    if (options.resize) {
      sharpInstance = sharpInstance.resize(
        options.resize.width,
        options.resize.height,
        { fit: options.resize.fit || 'cover' }
      );
    }

    // 压缩质量
    if (options.compress && options.quality) {
      sharpInstance = sharpInstance.jpeg({ quality: options.quality });
    }

    // 格式转换
    if (options.format) {
      switch (options.format) {
        case MediaFormat.JPEG:
          sharpInstance = sharpInstance.jpeg();
          break;
        case MediaFormat.PNG:
          sharpInstance = sharpInstance.png();
          break;
        case MediaFormat.WEBP:
          sharpInstance = sharpInstance.webp();
          break;
      }
    }

    const metadata = await sharpInstance.metadata();
    await sharpInstance.toFile(outputPath);

    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  }

  // 生成视频缩略图
  private async generateVideoThumbnail(
    videoPath: string,
    thumbnailPath: string,
    options: VideoProcessOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [options.thumbnailTime || 1], // 默认第1秒
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x240'
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
  }

  // 获取视频信息
  private async getVideoInfo(videoPath: string): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('未找到视频流'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0
        });
      });
    });
  }

  // 上传文件
  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const config = await this.initConfig();

    // 检查文件大小
    if (fileBuffer.length > config.maxFileSize) {
      throw new Error(`文件大小超过限制: ${config.maxFileSize} bytes`);
    }

    const fileType = this.getFileType(fileName);
    const format = this.getMediaFormat(fileName);

    // 检查文件类型
    const mimeType = mime.lookup(fileName);
    if (mimeType && config.allowedFileTypes.length > 0) {
      const allowed = config.allowedFileTypes.some(type =>
        mimeType.includes(type) || fileName.toLowerCase().endsWith(type)
      );
      if (!allowed) {
        throw new Error(`不支持的文件类型: ${mimeType}`);
      }
    }

    const relativePath = this.generateFilePath(fileName, fileType);
    const fullPath = await this.getFullPath(relativePath);

    // 确保目标目录存在
    await this.ensureDirectoryExists(path.dirname(fullPath));

    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;

    // 临时文件路径（用于处理）
    const tempPath = fullPath + '.temp';
    await fs.writeFile(tempPath, fileBuffer);

    try {
      if (fileType === FileType.IMAGE && config.enableCompression) {
        // 处理图片
        const imageOptions: ImageProcessOptions = {
          compress: true,
          quality: config.compressQuality || 80
        };

        if (options.compressImage) {
          imageOptions.compress = true;
          imageOptions.quality = options.quality || config.compressQuality || 80;
        }

        const dimensions = await this.processImage(tempPath, fullPath, imageOptions);
        width = dimensions.width;
        height = dimensions.height;
      } else if (fileType === FileType.VIDEO) {
        // 处理视频
        await fs.rename(tempPath, fullPath);

        // 获取视频信息
        const videoInfo = await this.getVideoInfo(fullPath);
        duration = videoInfo.duration;
        width = videoInfo.width;
        height = videoInfo.height;

        // 生成缩略图
        if (options.generateThumbnail !== false) {
          const thumbnailPath = fullPath.replace(/\.[^.]+$/, '_thumb.jpg');
          const thumbnailRelativePath = relativePath.replace(/\.[^.]+$/, '_thumb.jpg');

          try {
            await this.generateVideoThumbnail(fullPath, thumbnailPath);
            thumbnailUrl = `/uploads/${thumbnailRelativePath}`;
          } catch (error) {
            console.warn('缩略图生成失败:', error);
          }
        }
      } else {
        // 直接保存其他类型文件
        await fs.rename(tempPath, fullPath);
      }
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }

    // 清理临时文件（如果还存在）
    try {
      await fs.unlink(tempPath);
    } catch {}

    const result: UploadResult = {
      url: `/uploads/${relativePath}`,
      key: relativePath,
      size: fileBuffer.length,
      fileType,
      format,
      thumbnailUrl,
      duration
    };

    // 添加图片尺寸信息
    if (width && height) {
      result.width = width;
      result.height = height;
    }

    return result;
  }

  // 上传文件流
  async uploadStream(
    fileName: string,
    stream: NodeJS.ReadableStream,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const config = await this.initConfig();
    const fileType = this.getFileType(fileName);
    const relativePath = this.generateFilePath(fileName, fileType);
    const fullPath = await this.getFullPath(relativePath);

    // 确保目标目录存在
    await this.ensureDirectoryExists(path.dirname(fullPath));

    // 将流写入临时文件
    const tempPath = fullPath + '.temp';
    const writeStream = createWriteStream(tempPath);
    await pipeline(stream, writeStream);

    // 获取文件大小
    const stats = await fs.stat(tempPath);
    if (stats.size > config.maxFileSize) {
      await fs.unlink(tempPath);
      throw new Error(`文件大小超过限制: ${config.maxFileSize} bytes`);
    }

    // 读取文件缓冲区并使用 uploadFile 处理
    const fileBuffer = await fs.readFile(tempPath);
    await fs.unlink(tempPath);

    return this.uploadFile(fileName, fileBuffer, options);
  }

  // 删除文件
  async deleteFile(key: string): Promise<void> {
    const fullPath = await this.getFullPath(key);

    try {
      await fs.unlink(fullPath);

      // 如果是视频文件，同时删除缩略图
      if (this.getFileType(key) === FileType.VIDEO) {
        const thumbnailPath = fullPath.replace(/\.[^.]+$/, '_thumb.jpg');
        try {
          await fs.unlink(thumbnailPath);
        } catch {
          // 缩略图可能不存在，忽略错误
        }
      }
    } catch (error) {
      throw new Error(`文件删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 批量删除文件
  async deleteFiles(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const key of keys) {
      try {
        await this.deleteFile(key);
        deleted.push(key);
      } catch (error) {
        failed.push(key);
      }
    }

    return { deleted, failed };
  }

  // 获取文件信息
  async getFileInfo(key: string): Promise<any> {
    const fullPath = await this.getFullPath(key);

    try {
      const stats = await fs.stat(fullPath);
      const fileType = this.getFileType(key);
      const format = this.getMediaFormat(key);
      const mimeType = mime.lookup(key) || 'application/octet-stream';

      const fileInfo: any = {
        key,
        size: stats.size,
        lastModified: stats.mtime,
        created: stats.birthtime,
        mimeType,
        fileType,
        format
      };

      // 如果是图片，获取尺寸信息
      if (fileType === FileType.IMAGE) {
        try {
          const metadata = await sharp(fullPath).metadata();
          fileInfo.width = metadata.width;
          fileInfo.height = metadata.height;
        } catch (error) {
          console.warn('获取图片信息失败:', error);
        }
      }

      // 如果是视频，获取视频信息
      if (fileType === FileType.VIDEO) {
        try {
          const videoInfo = await this.getVideoInfo(fullPath);
          fileInfo.duration = videoInfo.duration;
          fileInfo.width = videoInfo.width;
          fileInfo.height = videoInfo.height;
        } catch (error) {
          console.warn('获取视频信息失败:', error);
        }
      }

      return fileInfo;
    } catch (error) {
      throw new Error(`获取文件信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 检查文件是否存在
  async fileExists(key: string): Promise<boolean> {
    const fullPath = await this.getFullPath(key);

    try {
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 列出文件
  async listFiles(
    prefix: string = '',
    maxKeys: number = 100,
    marker?: string
  ): Promise<{ files: any[]; nextMarker?: string; isTruncated: boolean }> {
    const config = await this.initConfig();
    const searchPath = path.join(config.uploadPath, prefix);

    try {
      const files: any[] = [];
      await this.collectFiles(searchPath, config.uploadPath, files, maxKeys, marker);

      // 排序文件（按修改时间倒序）
      files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

      const isTruncated = files.length === maxKeys;
      const nextMarker = isTruncated ? files[files.length - 1].key : undefined;

      return {
        files: files.slice(0, maxKeys),
        nextMarker,
        isTruncated
      };
    } catch (error) {
      throw new Error(`列出文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 递归收集文件
  private async collectFiles(
    searchPath: string,
    basePath: string,
    files: any[],
    maxKeys: number,
    marker?: string
  ): Promise<void> {
    if (files.length >= maxKeys) return;

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxKeys) break;

        const fullPath = path.join(searchPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        if (entry.isDirectory()) {
          await this.collectFiles(fullPath, basePath, files, maxKeys, marker);
        } else {
          // 跳过临时文件和缩略图
          if (entry.name.endsWith('.temp') || entry.name.endsWith('_thumb.jpg')) {
            continue;
          }

          // 如果有 marker，跳过 marker 之前的文件
          if (marker && relativePath <= marker) {
            continue;
          }

          const stats = await fs.stat(fullPath);
          const fileType = this.getFileType(entry.name);
          const format = this.getMediaFormat(entry.name);

          files.push({
            key: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
            name: entry.name,
            size: stats.size,
            lastModified: stats.mtime,
            fileType,
            format,
            url: `/uploads/${relativePath.replace(/\\/g, '/')}`
          });
        }
      }
    } catch (error) {
      // 目录不存在或无法访问，忽略错误
    }
  }

  // 测试连接
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.initConfig();

      // 检查上传目录是否存在和可写
      await this.ensureDirectoryExists(config.uploadPath);

      // 测试写入权限
      const testFile = path.join(config.uploadPath, 'test_write.txt');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      return {
        success: true,
        message: `本地存储连接成功，存储路径: ${config.uploadPath}`
      };
    } catch (error) {
      return {
        success: false,
        message: `本地存储连接失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 重置配置（配置更新时调用）
  resetConfig(): void {
    this.config = null;
  }
}