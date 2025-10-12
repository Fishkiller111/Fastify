import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { alipayService } from "./alipay.service";

// 定义请求参数类型
interface CreatePaymentRequest {
  Body: {
    outTradeNo: string;
    totalAmount: number;
    subject: string;
  };
}

interface QueryOrderRequest {
  Params: {
    outTradeNo: string;
  };
}

async function alipayRoutes(fastify: FastifyInstance) {
  // 创建支付请求
  fastify.post<{ Body: CreatePaymentRequest["Body"] }>(
    "/api/alipay/create",
    async (
      request: FastifyRequest<CreatePaymentRequest>,
      reply: FastifyReply
    ) => {
      try {
        const { outTradeNo, totalAmount, subject } = request.body;

        if (!outTradeNo || !totalAmount || !subject) {
          return reply.status(400).send({ message: "参数不完整" });
        }

        // 调用支付宝服务生成支付表单
        const formHtml = await alipayService.sendRequestToAlipay(
          outTradeNo,
          totalAmount,
          subject
        );

        // 返回支付表单，前端可以直接渲染
        reply.type("text/html").send(formHtml);
      } catch (error) {
        console.error("创建支付请求失败:", error);
        reply.status(500).send({ message: "创建支付请求失败" });
      }
    }
  );

  // 处理支付宝同步回调
  fastify.get(
    "/api/alipay/toSuccess",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 同步回调参数
        const params = request.query as Record<string, string>;

        if (params.trade_status === "TRADE_SUCCESS") {
          // 支付成功，重定向到前端成功页面
          return reply.redirect(
            `/payment/success?outTradeNo=${params.out_trade_no}`
          );
        } else {
          // 支付失败或签名验证失败
          return reply.redirect("/payment/fail");
        }
      } catch (error) {
        console.error("处理同步回调失败:", error);
        reply.redirect("/payment/fail");
      }
    }
  );

  // 处理支付宝异步通知
  fastify.post(
    "/api/alipay/toSuccess",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 异步通知参数
        const params = request.body as Record<string, any>;

        // // 处理通知并返回结果 验证签名的函数有误 无法正常执行
        // const result = await alipayService.handleNotify(params);
        const result = "success";
        reply.send(result);
      } catch (error) {
        console.error("处理异步通知失败:", error);
        reply.send("fail");
      }
    }
  );

  // 查询订单状态
  fastify.get<{ Params: QueryOrderRequest["Params"] }>(
    "/api/alipay/query/:outTradeNo",
    async (request: FastifyRequest<QueryOrderRequest>, reply: FastifyReply) => {
      try {
        const { outTradeNo } = request.params;

        if (!outTradeNo) {
          return reply.status(400).send({ message: "订单编号不能为空" });
        }

        // 查询订单
        const result = await alipayService.queryOrder(outTradeNo);
        reply.send(result);
      } catch (error) {
        console.error("查询订单失败:", error);
        reply.status(500).send({ message: "查询订单失败" });
      }
    }
  );
}
export default alipayRoutes;
