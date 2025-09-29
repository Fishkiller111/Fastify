// 存储类型枚举
export enum StorageType {
  ALIYUN_OSS = 'aliyun_oss',
  LOCAL = 'local'
}

// 文件类型枚举
export enum FileType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  OTHER = 'other'
}

// 媒体格式枚举
export enum MediaFormat {
  // 图片格式
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  WEBP = 'webp',
  // 视频格式
  MP4 = 'mp4',
  AVI = 'avi',
  MOV = 'mov',
  WMV = 'wmv',
  FLV = 'flv',
  MKV = 'mkv'
}

// 存储配置状态
export enum StorageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISABLED = 'disabled'
}

// OSS配置接口
export interface OSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  bucket: string;
  endpoint?: string;
  internal?: boolean;
  secure?: boolean;
  timeout?: number;
}

// 本地存储配置接口
export interface LocalConfig {
  uploadPath: string;
  maxFileSize: number; // bytes
  allowedFileTypes: string[];
  enableCompression: boolean;
  compressQuality?: number;
}

// 存储配置基础接口
export interface StorageConfigBase {
  id?: number;
  storage_type: StorageType;
  status: StorageStatus;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

// OSS存储配置
export interface OSSStorageConfig extends StorageConfigBase {
  storage_type: StorageType.ALIYUN_OSS;
  config: OSSConfig;
}

// 本地存储配置
export interface LocalStorageConfig extends StorageConfigBase {
  storage_type: StorageType.LOCAL;
  config: LocalConfig;
}

// 联合类型：所有存储配置类型
export type StorageConfig = OSSStorageConfig | LocalStorageConfig;

// 创建存储配置请求
export interface CreateStorageConfigRequest {
  storage_type: StorageType;
  status: StorageStatus;
  is_default: boolean;
  config: OSSConfig | LocalConfig;
}

// 更新存储配置请求
export interface UpdateStorageConfigRequest {
  status?: StorageStatus;
  is_default?: boolean;
  config?: Partial<OSSConfig | LocalConfig>;
}

// 存储配置列表查询
export interface StorageConfigListQuery {
  page?: number;
  limit?: number;
  storage_type?: StorageType;
  status?: StorageStatus;
  is_default?: boolean;
}

// 存储配置列表响应
export interface StorageConfigListResponse {
  configs: StorageConfig[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

// 文件上传结果
export interface UploadResult {
  url: string;
  key: string;
  size: number;
  etag?: string;
  bucket?: string;
  fileType?: FileType;
  format?: MediaFormat;
  thumbnailUrl?: string;
  duration?: number; // 视频时长（秒）
  width?: number;    // 图片/视频宽度
  height?: number;   // 图片/视频高度
}

// 文件上传选项
export interface UploadOptions {
  headers?: Record<string, string>;
  contentType?: string;
  timeout?: number;
  generateThumbnail?: boolean;
  compressImage?: boolean;
  quality?: number;
}

// 文件信息接口
export interface FileInfo {
  originalName: string;
  fileName: string;
  size: number;
  mimeType: string;
  fileType: FileType;
  format: MediaFormat;
  width?: number;
  height?: number;
  duration?: number;
}

// 视频处理选项
export interface VideoProcessOptions {
  generateThumbnail?: boolean;
  thumbnailTime?: number; // 缩略图时间点（秒）
  compress?: boolean;
  quality?: 'low' | 'medium' | 'high';
  format?: MediaFormat;
}

// 图片处理选项
export interface ImageProcessOptions {
  compress?: boolean;
  quality?: number; // 1-100
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill';
  };
  format?: MediaFormat;
}

// 存储统一接口
export interface IStorageService {
  uploadFile(fileName: string, fileBuffer: Buffer, options?: UploadOptions): Promise<UploadResult>;
  uploadStream(fileName: string, stream: NodeJS.ReadableStream, options?: UploadOptions): Promise<UploadResult>;
  deleteFile(key: string): Promise<void>;
  deleteFiles(keys: string[]): Promise<{ deleted: string[]; failed: string[] }>;
  getFileInfo(key: string): Promise<any>;
  fileExists(key: string): Promise<boolean>;
  listFiles(prefix?: string, maxKeys?: number, marker?: string): Promise<{ files: any[]; nextMarker?: string; isTruncated: boolean }>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}