/**
 * Redis 连接配置
 */

import Redis from 'ioredis';
import config from './index.js';

// 创建 Redis 客户端
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// 监听连接事件
redis.on('connect', () => {
  console.log('✅ Redis 连接成功');
});

redis.on('error', (err) => {
  console.error('❌ Redis 连接错误:', err.message);
});

redis.on('close', () => {
  console.log('⚠️  Redis 连接已关闭');
});

export default redis;
