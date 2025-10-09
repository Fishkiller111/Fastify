import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
// 注意：不再导入pool，避免循环依赖
dotenv.config();



// 数据库配置接口
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// 服务器配置接口
interface ServerConfig {
  port: number;
  host: string;
}

// JWT配置接口
interface JWTConfig {
  secret: string;
  expiresIn: string;
}

// 应用配置接口
interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JWTConfig;
}

// 配置对象
const config: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'fastify_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'fastify_secret_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
};

export default config;
export type { DatabaseConfig, ServerConfig, JWTConfig, AppConfig };