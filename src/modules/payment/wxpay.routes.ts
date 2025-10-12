import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { wxpayService } from "./wxpay.service";

// 定义请求参数类型
interface CreateWxPaymentRequest {
  Body: {
    outTradeNo: string;
    totalAmount: number;
    subject: string;
    attach?: string;
  };
}

interface QueryWxOrderRequest {
  Params: {
    outTradeNo: string;
  };
}

async function wxpayRoutes(fastify: FastifyInstance) {
  // 创建微信Native支付订单
  fastify.post<{ Body: CreateWxPaymentRequest["Body"] }>(
    "/api/wxpay/create",
    async (
      request: FastifyRequest<CreateWxPaymentRequest>,
      reply: FastifyReply
    ) => {
      try {
        const { outTradeNo, totalAmount, subject, attach } = request.body;

        if (!outTradeNo || !totalAmount || !subject) {
          return reply.status(400).send({ message: "参数不完整" });
        }

        // 调用微信支付服务生成二维码链接
        const result = await wxpayService.sendNativeOrderRequest(
          outTradeNo,
          totalAmount,
          subject,
          attach
        );

        // 返回二维码链接和过期时间
        reply.send({
          code_url: result.code_url,
          expire_time: result.expire_time,
          out_trade_no: outTradeNo,
        });
      } catch (error) {
        console.error("创建微信支付订单失败:", error);
        reply.status(500).send({ message: "创建微信支付订单失败" });
      }
    }
  );

  // 处理微信支付异步通知
  fastify.post(
    "/api/wxpay/notify",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 获取原始请求体（需要在raw模式下获取完整body）
        const rawBody = JSON.stringify(request.body);
        // 获取请求头
        const headers = request.headers as Record<string, string>;

        // 处理通知并返回结果
        const result = await wxpayService.handleNotify(headers, rawBody);

        // 根据处理结果返回对应响应
        if (result === "SUCCESS") {
          reply.send({ code: "SUCCESS", message: "成功" });
        } else {
          reply.status(400).send({ code: "FAIL", message: "失败" });
        }
      } catch (error) {
        console.error("处理微信支付通知失败:", error);
        reply.status(500).send({ code: "FAIL", message: "处理失败" });
      }
    }
  );

  // 查询微信支付订单状态
  fastify.get<{ Params: QueryWxOrderRequest["Params"] }>(
    "/api/wxpay/query/:outTradeNo",
    async (
      request: FastifyRequest<QueryWxOrderRequest>,
      reply: FastifyReply
    ) => {
      try {
        const { outTradeNo } = request.params;

        if (!outTradeNo) {
          return reply.status(400).send({ message: "订单编号不能为空" });
        }

        // 查询订单
        const result = await wxpayService.queryOrderByOutTradeNo(outTradeNo);
        reply.send(result);
      } catch (error) {
        console.error("查询微信支付订单失败:", error);
        reply.status(500).send({ message: "查询微信支付订单失败" });
      }
    }
  );
}
export default wxpayRoutes;
