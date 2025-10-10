import { FastifyInstance } from "fastify";
import * as membershipService from "./service.js";

export default async function membershipRoutes(fastify: FastifyInstance) {
  // 获取用户会员信息
  fastify.get(
    "/membership",
    async (request) => {
      const userId = (request.user as { id: number }).id;
      return membershipService.getUserMembership(userId);
    }
  );

  // 获取所有会员等级（公开信息）
  fastify.get("/membership-levels", async () => {
    return membershipService.getAllMembershipLevels();
  });
}
