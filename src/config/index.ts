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

// 支付网关配置接口（BEpusdt 等）
interface PaymentGatewayConfig {
  // 支付网关基础地址，例如 http://127.0.0.1:8080
  baseUrl: string;
  // 签名使用的 auth_token（conf.toml 中配置的密钥）
  authToken: string;
  // 默认交易类型，例如 usdt.trc20
  defaultTradeType: string;
  // 异步回调通知地址（BEpusdt 支付回调你后端的地址）
  notifyUrl: string;
  // 支付完成后前端跳转的基础地址，例如 https://example.com/pay/result
  redirectBaseUrl: string;
  // 订单默认超时时间（秒）
  defaultTimeoutSeconds: number;
  // 默认汇率配置，可为空，例如 "7.4"、"~1.02" 等
  defaultRate: string;
}

// 提现网关配置接口（BEpusdt 提现模块）
interface WithdrawGatewayConfig {
  // 提现网关基础地址，通常与支付网关相同
  baseUrl: string;
  // 提现签名使用的 auth_token（缺省时回退到支付网关的 authToken）
  authToken: string;
  // 默认提现代币类型，例如 usdt.polygon
  defaultTradeType: string;
  // 提现结果回调地址（BEpusdt 提现 notify_url）
  notifyUrl: string;
  // 提现订单默认超时时间（秒）
  defaultTimeoutSeconds: number;
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
  paymentGateway: PaymentGatewayConfig;
  withdrawGateway: WithdrawGatewayConfig;
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
  paymentGateway: {
    baseUrl: process.env.PAYMENT_GATEWAY_BASE_URL || 'http://127.0.0.1:8080',
    authToken: process.env.PAYMENT_GATEWAY_AUTH_TOKEN || '',
    defaultTradeType: process.env.PAYMENT_GATEWAY_TRADE_TYPE || 'usdt.trc20',
    notifyUrl: process.env.PAYMENT_NOTIFY_URL || '',
    redirectBaseUrl:
      process.env.PAYMENT_REDIRECT_BASE_URL ||
      (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/pay/result` : ''),
    defaultTimeoutSeconds: parseInt(process.env.PAYMENT_TIMEOUT || '600', 10),
    defaultRate: process.env.PAYMENT_RATE || '',
  },
  withdrawGateway: {
    baseUrl:
      process.env.WITHDRAW_GATEWAY_BASE_URL ||
      process.env.PAYMENT_GATEWAY_BASE_URL ||
      'http://127.0.0.1:8080',
    authToken:
      process.env.WITHDRAW_GATEWAY_AUTH_TOKEN ||
      process.env.PAYMENT_GATEWAY_AUTH_TOKEN ||
      '',
    defaultTradeType:
      process.env.WITHDRAW_TRADE_TYPE ||
      process.env.PAYMENT_GATEWAY_TRADE_TYPE ||
      'usdt.trc20',
    notifyUrl: process.env.WITHDRAW_NOTIFY_URL || '',
    defaultTimeoutSeconds: parseInt(
      process.env.WITHDRAW_TIMEOUT || process.env.PAYMENT_TIMEOUT || '1800',
      10,
    ),
  },
  encryption: {
    enabled: process.env.ENABLE_ENCRYPTION === 'true' || nodeEnv === 'production',
    secret: process.env.ENCRYPTION_SECRET || 'coinfun-security-key-2024-v1',
  },
};

export default config;
export type {
  DatabaseConfig,
  ServerConfig,
  JWTConfig,
  RedisConfig,
  SolanaConfig,
  PaymentGatewayConfig,
  WithdrawGatewayConfig,
  EncryptionConfig,
  AppConfig,
};
