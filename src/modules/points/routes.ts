import { FastifyInstance } from "fastify";
import * as pointsService from "./service.js";

export default async function pointsRoutes(fastify: FastifyInstance) {
  // 获取用户积分交易记录
  fastify.get(
    "/points/transactions",
    async (request) => {
      const userId = (request.user as { id: number }).id;
      const { limit = 50, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };
      return pointsService.getUserPointTransactions(userId, limit, offset);
    }
  );

  // 更多用户积分接口...
}
