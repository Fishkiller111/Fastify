// 用户接口
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  created_at: Date;
  updated_at: Date;
}

// 注册请求体接口
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

// 登录请求体接口
export interface LoginRequest {
  email: string;
  password: string;

}

// JWT载荷接口
export interface JwtPayload {
  userId: number;
  username: string;
}