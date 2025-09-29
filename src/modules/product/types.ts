export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  image_url?: string;
  store_id?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;

  // 新增多媒体字段
  media_type?: 'image' | 'video';
  video_url?: string;
  thumbnail_url?: string;
  media_duration?: number; // 视频时长（秒）
  media_size?: number; // 媒体文件大小（字节）
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  image_url?: string;
  store_id?: number;
  is_active?: boolean;

  // 新增多媒体字段
  media_type?: 'image' | 'video';
  video_url?: string;
  thumbnail_url?: string;
  media_duration?: number;
  media_size?: number;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  image_url?: string;
  store_id?: number;
  is_active?: boolean;

  // 新增多媒体字段
  media_type?: 'image' | 'video';
  video_url?: string;
  thumbnail_url?: string;
  media_duration?: number;
  media_size?: number;
}

export interface ProductListQuery {
  page?: number;
  limit?: number;
  category?: string;
  store_id?: number;
  is_active?: boolean;
  search?: string;
  sort?: 'created_at' | 'price' | 'name';
  order?: 'asc' | 'desc';
}

export interface ProductListResponse {
  products: Product[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}