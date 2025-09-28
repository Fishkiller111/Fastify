// 用户接口
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  phone_number?: string;
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

// JWT载荷接口
export interface JwtPayload {
  userId: number;
  username: string;
}