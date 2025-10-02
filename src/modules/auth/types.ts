// 用户接口
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  phone_number?: string;
  wallet_address?: string;
  balance?: string | null;
  role: string;
  permissions: string[];
  status: string;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// 邮箱注册请求体接口
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

// 短信注册请求体接口
export interface SMSRegisterRequest {
  username: string;
  phoneNumber: string;
  code: string;
}

// 邮箱登录请求体接口
export interface LoginRequest {
  email: string;
  password: string;
}

// 短信登录请求体接口
export interface SMSLoginRequest {
  phoneNumber: string;
  code: string;
}

// 钱包登录请求体接口
export interface WalletLoginRequest {
  walletAddress: string;
  balance?: string | number;
}

// JWT载荷接口
export interface JwtPayload {
  userId: number;
  username: string;
}

// 安全的用户信息接口（不包含密码）
export interface SafeUser {
  id: number;
  username: string;
  email: string;
  phone_number?: string;
  wallet_address?: string;
  balance?: string | null;
  role: string;
  permissions: string[];
  status: string;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// 用户管理 - 创建用户请求体接口
export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  phone_number?: string;
  wallet_address?: string;
  balance?: string | number;
}

// 用户管理 - 更新用户请求体接口
export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  phone_number?: string;
  wallet_address?: string | null;
  balance?: string | number;
  role?: string;
  permissions?: string[];
  status?: string;
}

// 用户角色修改请求体接口
export interface UpdateUserRoleRequest {
  role: 'user' | 'admin';
}

// 用户管理 - 用户列表查询接口
export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'id' | 'username' | 'email' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

// 用户管理 - 分页响应接口
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
