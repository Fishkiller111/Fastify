import { Pool, PoolConfig } from 'pg';
import config from '../config/index.js';

// PostgreSQL连接配置
const poolConfig: PoolConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
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