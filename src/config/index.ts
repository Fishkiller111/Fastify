import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录：从 src/config 到 project root 是 ../../
// dist/config 编译后，从 dist/config 到 project root 也是 ../../
const projectRoot = path.join(__dirname, '../..');

// 根据 NODE_ENV 加载对应的 .env 文件
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
const envPath = path.join(projectRoot, envFile);

console.log(`[Config] Loading environment from: ${envFile}`);
console.log(`[Config] Full path: ${envPath}`);
dotenv.config({ path: envPath });

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

// Redis配置接口
interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

// Solana配置接口
interface SolanaConfig {
  rpcEndpoint: string;
}

// 加密配置接口
interface EncryptionConfig {
  enabled: boolean;
  secret: string;
}

// 应用配置接口
interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JWTConfig;
  redis: RedisConfig;
  solana: SolanaConfig;
  encryption: EncryptionConfig;
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
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  solana: {
    rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
  },
  encryption: {
    enabled: process.env.ENABLE_ENCRYPTION === 'true' || nodeEnv === 'production',
    secret: process.env.ENCRYPTION_SECRET || 'coinfun-security-key-2024-v1',
  },
};

export default config;
export type { DatabaseConfig, ServerConfig, JWTConfig, RedisConfig, SolanaConfig, EncryptionConfig, AppConfig };
