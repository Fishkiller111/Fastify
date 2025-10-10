import { FastifyInstance } from "fastify";
import * as pointsService from "./service.js";

export default async function adminPointsRoutes(fastify: FastifyInstance) {
  // 管理端添加用户积分
  fastify.post(
    "/admin/users/:userId/points/add",
    {
      preHandler: [fastify.adminAuth],
    },
    async (request) => {
      const { userId } = request.params as { userId: number };
      const { points, type, source, description } = request.body as {
        points: number;
        type: string;
        source?: string;
        description?: string;
      };
      return pointsService.addPoints(userId, points, type, source, description);
    }
  );

  // 管理端扣除用户积分
  fastify.post(
    "/admin/users/:userId/points/deduct",
    {
      preHandler: [fastify.adminAuth],
    },
    async (request) => {
      const { userId } = request.params as { userId: number };
      const { points, type, source, description } = request.body as {
        points: number;
        type: string;
        source?: string;
        description?: string;
      };
      return pointsService.deductPoints(
        userId,
        points,
        type,
        source,
        description
      );
    }
  );
}
