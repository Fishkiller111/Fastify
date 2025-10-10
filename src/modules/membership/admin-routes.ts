import { FastifyInstance } from "fastify";
import * as membershipService from "./service.js";

export default async function adminMembershipRoutes(fastify: FastifyInstance) {
  // 创建会员等级
  fastify.post(
    "/admin/membership-levels",
    {
      preHandler: [fastify.adminAuth],
    },
    async (request) => {
      const levelData = request.body as Omit<
        any,
        "id" | "created_at" | "updated_at"
      >;
      return membershipService.createMembershipLevel(levelData);
    }
  );

  // 更多管理接口...
}
