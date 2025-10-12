import { FastifyInstance } from "fastify";
import authRoutes from "../modules/auth/routes.js";
import userRoutes from "../modules/user/routes.js";
import adminUserRoutes from "../modules/user/admin-routes.js";
import verificationRoutes from "../modules/verification/routes.js";
import alipayRoutes from "../modules/payment/alipay.routes.js";
import wxpayRoutes from "../modules/payment/wxpay.routes.js";
import membershipRoutes from "../modules/membership/routes.js";
import pointsRoutes from "../modules/points/routes.js";
/**
 * 注册所有路由
 * @param fastify Fastify实例
 */
async function registerRoutes(fastify: FastifyInstance) {
  // 注册用户认证路由
  fastify.register(authRoutes, { prefix: "/api/auth" });

  // 注册用户路由
  fastify.register(userRoutes, { prefix: "/api/user" });

  // 注册管理端用户管理路由
  fastify.register(adminUserRoutes, { prefix: "/api/admin/users" });

  // 注册验证码路由
  fastify.register(verificationRoutes, { prefix: "/api/verification" });

  // 注册支付宝路由
  fastify.register(alipayRoutes, { prefix: "/api/alipay" });
  // 注册微信支付路由
  fastify.register(wxpayRoutes, { prefix: "/api/wxpay" });
  // 注册会员路由
  fastify.register(membershipRoutes, { prefix: "/api/membership" });
  // 注册积分路由
  fastify.register(pointsRoutes, { prefix: "/api/points" });
}
export default registerRoutes;
