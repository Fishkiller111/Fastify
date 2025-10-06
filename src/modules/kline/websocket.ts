import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import EventKlineService from './service.js';

// WebSocket连接管理
class WebSocketManager {
  private connections: Map<number, Set<WebSocket>> = new Map();

  // 订阅事件
  subscribe(eventId: number, socket: WebSocket) {
    if (!this.connections.has(eventId)) {
      this.connections.set(eventId, new Set());
    }
    this.connections.get(eventId)!.add(socket);
    console.log(`📡 客户端订阅事件 ${eventId}，当前订阅数: ${this.connections.get(eventId)!.size}`);
  }

  // 取消订阅
  unsubscribe(eventId: number, socket: WebSocket) {
    const sockets = this.connections.get(eventId);
    if (sockets) {
      sockets.delete(socket);
      console.log(`📴 客户端取消订阅事件 ${eventId}，当前订阅数: ${sockets.size}`);
      if (sockets.size === 0) {
        this.connections.delete(eventId);
      }
    }
  }

  // 广播赔率更新
  async broadcast(eventId: number) {
    const sockets = this.connections.get(eventId);
    if (!sockets || sockets.size === 0) return;

    try {
      const oddsData = await EventKlineService.getCurrentOdds(eventId);
      if (!oddsData) return;

      const message = JSON.stringify({
        type: 'odds_update',
        data: oddsData,
      });

      sockets.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      });

      console.log(`📤 向 ${sockets.size} 个客户端推送事件 ${eventId} 的赔率更新`);
    } catch (error: any) {
      console.error('广播赔率更新失败:', error);
    }
  }

  // 获取事件订阅数
  getSubscriptionCount(eventId: number): number {
    return this.connections.get(eventId)?.size || 0;
  }
}

export const wsManager = new WebSocketManager();

/**
 * WebSocket路由处理
 */
export async function klineWebSocketRoute(fastify: FastifyInstance) {
  fastify.get('/ws/kline/events/:eventId', { websocket: true }, (socket, request) => {
    const { eventId } = request.params as { eventId: string };
    const eventIdNum = parseInt(eventId, 10);

    console.log(`🔌 新WebSocket连接: 事件 ${eventIdNum}`);

    // 订阅事件
    wsManager.subscribe(eventIdNum, socket);

    // 立即发送当前赔率
    EventKlineService.getCurrentOdds(eventIdNum)
      .then((oddsData: any) => {
        if (oddsData && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'initial',
            data: oddsData,
          }));
        }
      })
      .catch((error: any) => {
        console.error('获取初始赔率失败:', error);
      });

    // 处理客户端消息
    socket.on('message', (message: any) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error: any) {
        console.error('处理WebSocket消息失败:', error);
      }
    });

    // 连接关闭
    socket.on('close', () => {
      wsManager.unsubscribe(eventIdNum, socket);
      console.log(`❌ WebSocket连接关闭: 事件 ${eventIdNum}`);
    });

    // 连接错误
    socket.on('error', (error: any) => {
      console.error('WebSocket错误:', error);
      wsManager.unsubscribe(eventIdNum, socket);
    });
  });
}
