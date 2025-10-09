import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

// 直接加载环境变量，避免导入整个config
dotenv.config();

// 直接从环境变量获取数据库配置
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'fastify_app',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000, // 连接空闲超时时间
  connectionTimeoutMillis: 2000, // 连接超时时间
};

// 创建连接池
const pool = new Pool(poolConfig);

// 测试数据库连接
pool.query('SELECT NOW()', (err: Error, res: any) => {
  if (err) {
    console.error('数据库连接失败:', err.stack);
  } else {
    console.log('数据库连接成功');
  }
});

export default pool;