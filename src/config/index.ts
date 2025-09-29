import dotenv from 'dotenv';
import path from 'path';
import pool from './database.js';

// 加载环境变量
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

// AI配置接口
interface AIConfig {
  provider: 'openai' | 'claude' | 'openrouter';
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  claude: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  maxTokens: number;
  temperature: number;
}

// 应用配置接口
interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JWTConfig;
  ai: AIConfig;
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
  ai: {
    provider: (process.env.AI_PROVIDER as 'openai' | 'claude' | 'openrouter') || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      baseUrl: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    },
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  },
};

export default config;
export type { DatabaseConfig, ServerConfig, JWTConfig, AIConfig, AppConfig };