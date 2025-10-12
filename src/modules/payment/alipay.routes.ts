import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { alipayService } from "./alipay.service";

export default async function alipayRoutes(fastify: FastifyInstance) {
  /* 1. 创建支付请求 ---------------------------------------------------- */
  fastify.post(
    "/api/alipay/create",
    {
      schema: {
        description: "创建支付宝支付订单",
        tags: ["支付宝支付"],
        body: {
          type: "object",
          required: ["outTradeNo", "totalAmount", "subject"],
          properties: {
            outTradeNo: { type: "string", description: "商户订单号" },
            totalAmount: { type: "number", description: "订单金额（元）" },
            subject: { type: "string", description: "商品标题" },
          },
        },
        response: {
          200: {
            description: "成功返回支付表单 HTML",
            type: "string",
          },
          400: {
            description: "参数不完整",
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
          500: {
            description: "服务端错误",
            type: "object",
            properties: {
              message: { type: "string" },
            },
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
        };
      }>,
      reply: FastifyReply
    ) => {
      const { outTradeNo, totalAmount, subject } = request.body;
      if (!outTradeNo || !totalAmount || !subject) {
        return reply.code(400).send({ message: "参数不完整" });
      }
      try {
        const html = await alipayService.sendRequestToAlipay(
          outTradeNo,
          totalAmount,
          subject
        );
        return reply.type("text/html").send(html);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ message: "创建支付请求失败" });
      }
    }
  );

  /* 2. 同步回调（浏览器重定向） ---------------------------------------- */
  fastify.get(
    "/api/alipay/return",
    {
      schema: {
        description: "支付宝同步回调（浏览器重定向）",
        tags: ["支付宝支付"],
        querystring: {
          type: "object",
          properties: {
            trade_status: { type: "string", description: "交易状态" },
            out_trade_no: { type: "string", description: "商户订单号" },
          },
        },
        response: {
          302: { description: "重定向到结果页" },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.query as Record<string, string>;
      if (params.trade_status === "TRADE_SUCCESS") {
        return reply.redirect(
          `/payment/success?outTradeNo=${params.out_trade_no}`
        );
      }
      return reply.redirect("/payment/fail");
    }
  );

  /* 3. 异步通知（支付宝服务器 → 我方） ---------------------------------- */
  fastify.post(
    "/api/alipay/notify",
    {
      schema: {
        description: "支付宝异步通知",
        tags: ["支付宝支付"],
        body: {
          type: "object",
          description: "支付宝 POST 过来的原始参数",
        },
        response: {
          200: {
            description: "我方处理结果",
            type: "string",
            enum: ["success", "fail"],
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // todo: 验签、业务更新……
        // const result = await alipayService.handleNotify(request.body);
        return reply.send("success");
      } catch (err) {
        fastify.log.error(err);
        return reply.send("fail");
      }
    }
  );

  /* 4. 查询订单状态 ----------------------------------------------------- */
  fastify.get(
    "/api/alipay/query/:outTradeNo",
    {
      schema: {
        description: "查询支付宝订单状态",
        tags: ["支付宝支付"],
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
        const result = await alipayService.queryOrder(outTradeNo);
        return reply.send(result);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ message: "查询订单失败" });
      }
    }
  );
}
