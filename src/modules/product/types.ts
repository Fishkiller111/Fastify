export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  image_url?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  image_url?: string;
  is_active?: boolean;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  image_url?: string;
  is_active?: boolean;
}

export interface ProductListQuery {
  page?: number;
  limit?: number;
  category?: string;
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