// 修改导入语句
import AlipaySdk from "alipay-sdk";
import { alipayConfig } from "./alipay.config";

export class AlipayService {
  private alipayClient: AlipaySdk;

  constructor() {
    this.alipayClient = new AlipaySdk({
      appId: alipayConfig.appId,
      privateKey: alipayConfig.privateKey,
      alipayPublicKey: alipayConfig.alipayPublicKey,
      gateway: alipayConfig.gatewayUrl,
      signType: alipayConfig.signType as "RSA2",
      charset: "UTF-8",
    });
  }

  /**
   * 发送支付请求到支付宝
   * @param outTradeNo 订单编号
   * @param totalAmount 订单金额
   * @param subject 订单标题
   * @returns 支付表单HTML
   */
  async sendRequestToAlipay(
    outTradeNo: string,
    totalAmount: number,
    subject: string
  ): Promise<string> {
    try {
      // 调用支付宝统一收单页面支付接口
      const result = await this.alipayClient.pageExec("alipay.trade.page.pay", {
        bizContent: {
          out_trade_no: outTradeNo,
          total_amount: Number(totalAmount),
          subject: subject,
          body: "",
          product_code: "FAST_INSTANT_TRADE_PAY",
        },
        returnUrl: alipayConfig.returnUrl,
        notifyUrl: alipayConfig.notifyUrl,
      });

      console.log("支付宝返回结果:", result);
      return result;
    } catch (error) {
      console.error("支付宝支付请求失败:", error);
    }
  }

  /**
   * 根据订单编号查询订单状态
   * @param outTradeNo 订单编号
   * @returns 订单查询结果
   */
  async queryOrder(outTradeNo: string): Promise<any> {
    try {
      const result = await this.alipayClient.exec("alipay.trade.query", {
        bizContent: {
          out_trade_no: outTradeNo,
        },
      });

      console.log("订单查询结果:", result);
      return result;
    } catch (error) {
      console.error("订单查询失败:", error);
      throw new Error("查询订单失败");
    }
  }
}

// 实例化支付宝服务
export const alipayService = new AlipayService();
