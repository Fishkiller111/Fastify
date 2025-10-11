import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import EventKlineService from './service.js';

// WebSocket连接信息
interface ConnectionInfo {
  socket: WebSocket;
  source?: string; // 来源页面标识
}

// WebSocket连接管理
class WebSocketManager {
  private connections: Map<number, Set<ConnectionInfo>> = new Map();

  // 订阅事件
  subscribe(eventId: number, socket: WebSocket, source?: string) {
    if (!this.connections.has(eventId)) {
      this.connections.set(eventId, new Set());
    }
    this.connections.get(eventId)!.add({ socket, source });
    console.log(`📡 客户端订阅事件 ${eventId}，来源: ${source || '未知'}，当前订阅数: ${this.connections.get(eventId)!.size}`);
  }

  // 取消订阅
  unsubscribe(eventId: number, socket: WebSocket) {
    const connections = this.connections.get(eventId);
    if (connections) {
      // 删除匹配的socket
      for (const conn of connections) {
        if (conn.socket === socket) {
          connections.delete(conn);
          break;
        }
      }
      console.log(`📴 客户端取消订阅事件 ${eventId}，当前订阅数: ${connections.size}`);
      if (connections.size === 0) {
        this.connections.delete(eventId);
      }
    }
  }

  // 广播赔率更新
  async broadcast(eventId: number) {
    const connections = this.connections.get(eventId);
    if (!connections || connections.size === 0) return;

    try {
      const oddsData = await EventKlineService.getCurrentOdds(eventId);
      if (!oddsData) return;

      connections.forEach((conn) => {
        if (conn.socket.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'odds_update',
            data: {
              ...oddsData,
              source: conn.source || 'pumpfun' // 附加来源信息
            },
          });
          conn.socket.send(message);
        }
      });

      console.log(`📤 向 ${connections.size} 个客户端推送事件 ${eventId} 的赔率更新`);
    } catch (error: any) {
      console.error('广播赔率更新失败:', error);
    }
  }

  // 广播用户下注记录
  async broadcastBet(eventId: number, betData: {
    userId: number;
    betType: 'yes' | 'no';
    betAmount: string;
    oddsAtBet: string;
    potentialPayout: string;
    createdAt: string;
  }) {
    const connections = this.connections.get(eventId);
    if (!connections || connections.size === 0) return;

    try {
      const message = JSON.stringify({
        type: 'bet_placed',
        data: {
          user_id: betData.userId,
          bet_type: betData.betType,
          bet_amount: betData.betAmount,
          odds_at_bet: betData.oddsAtBet,
          potential_payout: betData.potentialPayout,
          timestamp: betData.createdAt,
        },
      });

      connections.forEach((conn) => {
        if (conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(message);
        }
      });

      console.log(`💰 向 ${connections.size} 个客户端推送事件 ${eventId} 的下注记录`);
    } catch (error: any) {
      console.error('广播下注记录失败:', error);
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
  fastify.get('/ws/kline/events/:eventId', { websocket: true }, async (socket, request) => {
    const { eventId } = request.params as { eventId: string };
    const eventIdNum = parseInt(eventId, 10);
    const queryParams = request.query as any;
    const interval = queryParams.interval || '1m';
    const source = queryParams.source || 'pumpfun'; // 获取来源页面参数

    console.log(`🔌 新WebSocket连接: 事件 ${eventIdNum}, 周期: ${interval}, 来源: ${source}`);

    // 订阅事件并传递source信息
    wsManager.subscribe(eventIdNum, socket, source);

    try {
      // 1. 立即发送所有原始赔率变化点(用于绘制折线图)，附加source信息
      const oddsSnapshots = await EventKlineService.getAllOddsSnapshots(eventIdNum);
      const snapshotsWithSource = oddsSnapshots.map(snapshot => ({
        ...snapshot,
        source
      }));

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'historical',
          data: snapshotsWithSource,
        }));
        console.log(`📊 已发送 ${oddsSnapshots.length} 个历史赔率变化点`);
      }

      // 2. 发送当前实时赔率，附加source信息
      const currentOdds = await EventKlineService.getCurrentOdds(eventIdNum);
      if (currentOdds && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'current',
          data: {
            ...currentOdds,
            source
          },
        }));
      }
    } catch (error: any) {
      console.error('发送初始数据失败:', error);
    }

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
