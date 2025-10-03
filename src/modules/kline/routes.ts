import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import KlineService from './service.js';
import { KlineInterval, KlineWSMessage } from './types.js';

/**
 * K线数据路由
 */
async function klineRoutes(fastify: FastifyInstance) {
  // HTTP 路由：获取历史 K线数据
  fastify.get('/history', {
    schema: {
      description: '获取历史 K线数据',
      tags: ['K线'],
      querystring: {
        type: 'object',
        required: ['symbol', 'interval'],
        properties: {
          symbol: { type: 'string', description: '交易对，如 BTC/USDT' },
          interval: {
            type: 'string',
            enum: Object.values(KlineInterval),
            description: '时间周期'
          },
          startTime: { type: 'number', description: '开始时间戳（毫秒）' },
          endTime: { type: 'number', description: '结束时间戳（毫秒）' },
          limit: { type: 'number', description: '返回数据条数，默认 500', default: 500 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              interval: { type: 'string' },
              timestamp: { type: 'number' },
              open: { type: 'number' },
              high: { type: 'number' },
              low: { type: 'number' },
              close: { type: 'number' },
              volume: { type: 'number' }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      const { symbol, interval, startTime, endTime, limit } = request.query as any;

      const klines = await KlineService.getHistoricalKlines({
        symbol,
        interval,
        startTime,
        endTime,
        limit
      });

      return klines;
    }
  });

  // HTTP 路由：初始化测试数据
  fastify.post('/init-mock', {
    schema: {
      description: '初始化模拟 K线数据（仅用于测试）',
      tags: ['K线'],
      body: {
        type: 'object',
        required: ['symbol', 'interval'],
        properties: {
          symbol: { type: 'string' },
          interval: { type: 'string', enum: Object.values(KlineInterval) },
          count: { type: 'number', default: 100 }
        }
      }
    },
    handler: async (request, reply) => {
      const { symbol, interval, count } = request.body as any;

      await KlineService.initMockData(symbol, interval, count || 100);

      return { success: true, message: `已初始化 ${count || 100} 条模拟数据` };
    }
  });

  // WebSocket 路由：实时 K线数据推送
  fastify.get('/stream', { websocket: true }, (socket: WebSocket, request) => {
    let subscriptions: Set<string> = new Set();
    let intervalId: NodeJS.Timeout | null = null;

    console.log('WebSocket 客户端已连接');

    // 接收客户端消息
    socket.on('message', (message: Buffer) => {
      try {
        const msg: KlineWSMessage = JSON.parse(message.toString());

        if (msg.type === 'subscribe' && msg.symbol && msg.interval) {
          const key = `${msg.symbol}_${msg.interval}`;
          subscriptions.add(key);
          console.log(`客户端订阅: ${key}`);

          // 发送确认消息
          socket.send(JSON.stringify({
            type: 'subscribed',
            symbol: msg.symbol,
            interval: msg.interval
          }));

          // 启动定时推送（如果还未启动）
          if (!intervalId) {
            startPushingData();
          }
        } else if (msg.type === 'unsubscribe' && msg.symbol && msg.interval) {
          const key = `${msg.symbol}_${msg.interval}`;
          subscriptions.delete(key);
          console.log(`客户端取消订阅: ${key}`);

          // 发送确认消息
          socket.send(JSON.stringify({
            type: 'unsubscribed',
            symbol: msg.symbol,
            interval: msg.interval
          }));

          // 如果没有订阅了，停止推送
          if (subscriptions.size === 0 && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (err) {
        console.error('解析 WebSocket 消息失败:', err);
      }
    });

    // 定时推送数据
    function startPushingData() {
      intervalId = setInterval(async () => {
        for (const key of subscriptions) {
          const [symbol, interval] = key.split('_');

          // 生成新的 K线数据
          const kline = KlineService.generateMockKline(symbol, interval as KlineInterval);

          // 保存到内存
          await KlineService.addKline(kline);

          // 推送给客户端
          socket.send(JSON.stringify({
            type: 'kline',
            data: kline
          }));
        }
      }, 2000); // 每 2 秒推送一次（实际应根据时间周期调整）
    }

    // 连接关闭时清理
    socket.on('close', () => {
      console.log('WebSocket 客户端已断开');
      if (intervalId) {
        clearInterval(intervalId);
      }
      subscriptions.clear();
    });

    // 错误处理
    socket.on('error', (err: Error) => {
      console.error('WebSocket 错误:', err);
    });
  });
}

export default klineRoutes;
