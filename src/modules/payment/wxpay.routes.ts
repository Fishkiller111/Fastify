import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { wxpayService } from "./wxpay.service";

export default async function wxpayRoutes(fastify: FastifyInstance) {
  /* 1. 创建微信 Native 支付订单 ---------------------------------------- */
  fastify.post(
    "/api/wxpay/create",
    {
      schema: {
        description: "创建微信 Native 支付订单（扫码支付）",
        tags: ["微信支付"],
        body: {
          type: "object",
          required: ["outTradeNo", "totalAmount", "subject"],
          properties: {
            outTradeNo: { type: "string", description: "商户订单号" },
            totalAmount: { type: "number", description: "订单金额（元）" },
            subject: { type: "string", description: "商品标题" },
            attach: { type: "string", description: "附加数据（选填）" },
          },
        },
        response: {
          200: {
            description: "成功返回二维码链接",
            type: "object",
            properties: {
              code_url: { type: "string", description: "二维码内容" },
              expire_time: { type: "string", description: "过期时间（ISO）" },
              out_trade_no: { type: "string", description: "商户订单号" },
            },
          },
          400: {
            description: "参数不完整",
            type: "object",
            properties: { message: { type: "string" } },
          },
          500: {
            description: "服务端错误",
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          outTradeNo: string;
          totalAmount: number;
          subject: string;
          attach?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { outTradeNo, totalAmount, subject, attach } = request.body;
      if (!outTradeNo || !totalAmount || !subject) {
        return reply.code(400).send({ message: "参数不完整" });
      }
      try {
        const result = await wxpayService.sendNativeOrderRequest(
          outTradeNo,
          totalAmount,
          subject,
          attach
        );
        return reply.send({
          code_url: result.code_url,
          expire_time: result.expire_time,
          out_trade_no: outTradeNo,
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ message: "创建微信支付订单失败" });
      }
    }
  );

  /* 2. 微信支付异步通知 ------------------------------------------------ */
  fastify.post(
    "/api/wxpay/notify",
    {
      schema: {
        description: "微信支付异步通知（Native/JSAPI 通用）",
        tags: ["微信支付"],
        body: {
          type: "object",
          description: "微信 POST 的 XML/JSON 原始参数（已解析）",
        },
        response: {
          200: {
            description: "我方处理结果",
            type: "object",
            properties: {
              code: { type: "string", enum: ["SUCCESS", "FAIL"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 如果微信发的是 XML，需在 onSend 前把 rawBody 留下来，这里简化用解析后的 body
        const result = await wxpayService.handleNotify(
          request.headers as Record<string, string>,
          JSON.stringify(request.body)
        );
        return reply.send({
          code: result === "SUCCESS" ? "SUCCESS" : "FAIL",
          message: result === "SUCCESS" ? "成功" : "失败",
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ code: "FAIL", message: "处理失败" });
      }
    }
  );

  /* 3. 查询微信支付订单状态 -------------------------------------------- */
  fastify.get(
    "/api/wxpay/query/:outTradeNo",
    {
      schema: {
        description: "查询微信支付订单状态",
        tags: ["微信支付"],
        params: {
          type: "object",
          required: ["outTradeNo"],
          properties: {
            outTradeNo: { type: "string", description: "商户订单号" },
          },
        },
        response: {
          200: { description: "查询结果", type: "object" },
          400: {
            description: "参数错误",
            type: "object",
            properties: { message: { type: "string" } },
          },
          500: {
            description: "服务端错误",
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { outTradeNo: string } }>,
      reply: FastifyReply
    ) => {
      const { outTradeNo } = request.params;
      if (!outTradeNo) {
        return reply.code(400).send({ message: "订单编号不能为空" });
      }
      try {
        const result = await wxpayService.queryOrderByOutTradeNo(outTradeNo);
        return reply.send(result);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ message: "查询微信支付订单失败" });
      }
    }
  );
}
