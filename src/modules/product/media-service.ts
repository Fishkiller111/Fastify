import { StorageManager } from '../storage/storage-manager.js';
import { FileType, MediaFormat, UploadOptions } from '../storage/types.js';
import { Product } from './types.js';
import { ProductService } from './service.js';

/**
 * 商品媒体服务
 * 处理商品图片和视频的上传、管理和存储切换
 */
export class ProductMediaService {
  private storageManager: StorageManager;
  private productService: ProductService;

  constructor() {
    this.storageManager = new StorageManager();
    this.productService = new ProductService();
  }

  /**
   * 上传商品图片
   */
  async uploadProductImage(
    productId: number,
    fileName: string,
    fileBuffer: Buffer,
    options: UploadOptions = {}
  ) {
    try {
      // 设置图片上传选项
      const uploadOptions: UploadOptions = {
        ...options,
        generateThumbnail: true,
        compressImage: true,
        quality: options.quality || 80
      };

      // 上传图片
      const uploadResult = await this.storageManager.uploadFile(
        `products/${productId}/${fileName}`,
        fileBuffer,
        uploadOptions
      );

      // 更新商品信息
      await this.productService.updateProduct(productId, {
        image_url: uploadResult.url,
        media_type: 'image',
        thumbnail_url: uploadResult.thumbnailUrl,
        media_size: uploadResult.size,
        ...(uploadResult.width && { /* 可以扩展保存图片尺寸 */ }),
        ...(uploadResult.height && { /* 可以扩展保存图片尺寸 */ })
      });

      return {
        success: true,
        data: {
          url: uploadResult.url,
          thumbnailUrl: uploadResult.thumbnailUrl,
          size: uploadResult.size,
          width: uploadResult.width,
          height: uploadResult.height
        }
      };

    } catch (error) {
      throw new Error(`图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 上传商品视频
   */
  async uploadProductVideo(
    productId: number,
    fileName: string,
    fileBuffer: Buffer,
    options: UploadOptions = {}
  ) {
    try {
      // 设置视频上传选项
      const uploadOptions: UploadOptions = {
        ...options,
        generateThumbnail: true
      };

      // 上传视频
      const uploadResult = await this.storageManager.uploadFile(
        `products/${productId}/${fileName}`,
        fileBuffer,
        uploadOptions
      );

      // 更新商品信息
      await this.productService.updateProduct(productId, {
        video_url: uploadResult.url,
        media_type: 'video',
        thumbnail_url: uploadResult.thumbnailUrl,
        media_duration: uploadResult.duration,
        media_size: uploadResult.size
      });

      return {
        success: true,
        data: {
          url: uploadResult.url,
          thumbnailUrl: uploadResult.thumbnailUrl,
          duration: uploadResult.duration,
          size: uploadResult.size,
          width: uploadResult.width,
          height: uploadResult.height
        }
      };

    } catch (error) {
      throw new Error(`视频上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 删除商品媒体文件
   */
  async deleteProductMedia(productId: number): Promise<{ success: boolean; message: string }> {
    try {
      const product = await this.productService.getProduct(productId);
      if (!product) {
        return { success: false, message: '商品不存在' };
      }

      const keysToDelete: string[] = [];

      // 收集需要删除的文件键
      if (product.image_url) {
        // 从URL中提取存储键
        const imageKey = this.extractStorageKeyFromUrl(product.image_url);
        if (imageKey) keysToDelete.push(imageKey);
      }

      if (product.video_url) {
        const videoKey = this.extractStorageKeyFromUrl(product.video_url);
        if (videoKey) keysToDelete.push(videoKey);
      }

      if (product.thumbnail_url) {
        const thumbnailKey = this.extractStorageKeyFromUrl(product.thumbnail_url);
        if (thumbnailKey) keysToDelete.push(thumbnailKey);
      }

      // 删除存储文件
      if (keysToDelete.length > 0) {
        await this.storageManager.deleteFiles(keysToDelete);
      }

      // 清空商品媒体字段
      await this.productService.updateProduct(productId, {
        image_url: undefined,
        video_url: undefined,
        thumbnail_url: undefined,
        media_type: undefined,
        media_duration: undefined,
        media_size: undefined
      });

      return { success: true, message: '媒体文件删除成功' };

    } catch (error) {
      return {
        success: false,
        message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取商品媒体信息
   */
  async getProductMediaInfo(productId: number) {
    try {
      const product = await this.productService.getProduct(productId);
      if (!product) {
        throw new Error('商品不存在');
      }

      return {
        media_type: product.media_type,
        image_url: product.image_url,
        video_url: product.video_url,
        thumbnail_url: product.thumbnail_url,
        media_duration: product.media_duration,
        media_size: product.media_size
      };

    } catch (error) {
      throw new Error(`获取媒体信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 切换存储方式时同步商品媒体文件
   */
  async syncProductMediaToStorage(
    productId: number,
    targetStorageType: string,
    deleteSource: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    try {
      const product = await this.productService.getProduct(productId);
      if (!product) {
        return { success: false, message: '商品不存在' };
      }

      const syncResults = [];

      // 同步主图片
      if (product.image_url) {
        const imageKey = this.extractStorageKeyFromUrl(product.image_url);
        if (imageKey) {
          const result = await this.storageManager.syncToStorage(
            imageKey,
            targetStorageType as any,
            deleteSource
          );
          syncResults.push({ type: 'image', ...result });
        }
      }

      // 同步视频
      if (product.video_url) {
        const videoKey = this.extractStorageKeyFromUrl(product.video_url);
        if (videoKey) {
          const result = await this.storageManager.syncToStorage(
            videoKey,
            targetStorageType as any,
            deleteSource
          );
          syncResults.push({ type: 'video', ...result });
        }
      }

      // 同步缩略图
      if (product.thumbnail_url) {
        const thumbnailKey = this.extractStorageKeyFromUrl(product.thumbnail_url);
        if (thumbnailKey) {
          const result = await this.storageManager.syncToStorage(
            thumbnailKey,
            targetStorageType as any,
            deleteSource
          );
          syncResults.push({ type: 'thumbnail', ...result });
        }
      }

      const successCount = syncResults.filter(r => r.success).length;
      const totalCount = syncResults.length;

      return {
        success: successCount === totalCount,
        message: `同步完成: ${successCount}/${totalCount} 个文件同步成功`
      };

    } catch (error) {
      return {
        success: false,
        message: `同步失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 从URL中提取存储键
   */
  private extractStorageKeyFromUrl(url: string): string | null {
    try {
      // 这里需要根据实际的URL格式来提取键
      // 假设URL格式为: http://domain/path/to/file.ext
      // 提取 path/to/file.ext 作为键

      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // 移除开头的 '/'
    } catch (error) {
      console.warn('无法从URL提取存储键:', url);
      return null;
    }
  }

  /**
   * 获取当前存储类型
   */
  async getCurrentStorageType() {
    return await this.storageManager.getCurrentStorageType();
  }

  /**
   * 获取所有可用存储类型
   */
  async getAvailableStorages() {
    return await this.storageManager.getAvailableStorages();
  }
}