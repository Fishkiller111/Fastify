export interface Store {
  id: number;
  name: string;
  description?: string;
  owner_name: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  logo_url?: string;
  cover_image_url?: string;
  business_hours?: string;
  business_license?: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  is_active: boolean;
  rating: number;
  total_sales: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateStoreRequest {
  name: string;
  description?: string;
  owner_name: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  logo_url?: string;
  cover_image_url?: string;
  business_hours?: string;
  business_license?: string;
}

export interface UpdateStoreRequest {
  name?: string;
  description?: string;
  owner_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  logo_url?: string;
  cover_image_url?: string;
  business_hours?: string;
  business_license?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  is_active?: boolean;
}

export interface StoreListQuery {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  is_active?: boolean;
  search?: string;
  sort?: 'created_at' | 'rating' | 'name' | 'total_sales';
  order?: 'asc' | 'desc';
}

export interface StoreListResponse {
  stores: Store[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}