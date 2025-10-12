import axios, { AxiosRequestConfig } from "axios";
import CryptoJS from "crypto-js";
import jwt from "jsonwebtoken";
import { KEYUTIL, KJUR, hextob64 } from "jsrsasign";
import { wxpayConfig, WxNotifyEventType } from "./wxpay.config"; // 修改配置文件路径
/**
 * 微信Native下单请求参数（传给微信接口的格式）
 */
interface WxNativeOrderParams {
  appid: string;
  mchid: string;
  out_trade_no: string;
  description: string;
  attach?: string; // 商户自定义数据（回调时原样返回）
  notify_url: string;
  return_url?: string; // 支付完成跳转地址（可选）
  amount: {
    total: number; // 总金额（单位：分，整数）
    currency: "CNY"; // 货币类型（默认人民币）
  };
  scene_info?: {
    device_id?: string; // 商户设备号（可选）
  };
}

/**
 * 微信Native下单接口返回结果
 */
interface WxNativeOrderResponse {
  code_url: string; // 支付二维码链接（weixin://wxpay/bizpayurl?pr=xxx）
  mchid: string;
  out_trade_no: string;
  appid: string;
}

/**
 * 微信支付回调通知原始请求体
 */
interface WxNotifyRawBody {
  id: string; // 通知ID（唯一）
  create_time: string; // 通知创建时间（RFC3339格式，如：2024-05-20T13:29:35+08:00）
  event_type: WxNotifyEventType | string; // 通知类型
  resource_type: "encrypt-resource"; // 通知数据类型（固定值）
  summary: string; // 回调摘要（如：支付成功）
  resource: {
    algorithm: "AEAD_AES_256_GCM"; // 加密算法（固定值）
    ciphertext: string; // 数据密文（Base64编码）
    associated_data?: string; // 附加数据（可选，可能为空）
    original_type: "transaction"; // 原始数据类型（固定值）
    nonce: string; // 随机串（参与解密）
  };
}

/**
 * 回调数据解密后的支付成功详情
 */
export interface DecryptedWxPayData {
  transaction_id: string; // 微信支付订单号（唯一）
  out_trade_no: string; // 商户订单号
  appid: string;
  mchid: string;
  trade_type: "NATIVE" | "JSAPI" | "APP" | "H5"; // 交易类型
  trade_state: "SUCCESS" | "REFUND" | "NOTPAY" | "CLOSED"; // 交易状态
  trade_state_desc: string; // 交易状态描述（如：支付成功）
  bank_type: string; // 银行类型（如：ICBC_DEBIT=工商银行借记卡）
  success_time: string; // 支付完成时间（RFC3339格式）
  payer: {
    openid: string; // 用户标识（商户appid下的唯一标识）
  };
  amount: {
    total: number; // 订单总金额（分）
    payer_total: number; // 用户实际支付金额（分，扣除优惠后）
    currency: "CNY";
    payer_currency: "CNY";
  };
  attach?: string; // 商户自定义数据（原样返回）
  promotion_detail?: Array<{
    // 优惠信息（可选，有优惠时返回）
    coupon_id: string; // 券ID
    name?: string; // 优惠名称
    amount: number; // 优惠金额（分）
  }>;
}

/**
 * 微信支付订单查询返回结果
 */
interface WxOrderQueryResponse {
  transaction_id: string;
  out_trade_no: string;
  trade_state: "SUCCESS" | "NOTPAY" | "CLOSED" | "REFUND";
  trade_state_desc: string;
  success_time?: string; // 支付成功时返回
  amount: {
    total: number;
    payer_total: number;
    currency: "CNY";
  };
}

/**
 * 微信支付服务类（封装Native支付核心能力）
 */
export class WxpayService {
  // Axios实例（统一配置请求头）
  private axiosInstance = axios.create({
    baseURL: wxpayConfig.gatewayUrl,
    headers: {
      "Content-Type": "application/json",
      Charset: wxpayConfig.charset,
    },
    timeout: 10000, // 超时时间（10秒）
  });

  constructor() {}

  /**
   * 生成微信支付V3接口鉴权JWT令牌
   * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml
   */
  private generateAuthJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    // JWT载荷（必须包含mchid、nonce_str、timestamp）
    const payload = {
      mchid: wxpayConfig.merchantId,
      nonce_str: Math.random().toString(36).slice(2, 15), // 随机字符串（13位）
      timestamp: now,
      expire_time: now + 300, // 令牌有效期（5分钟）
    };

    // 使用商户私钥签名（算法：RS256）
    return jwt.sign(payload, wxpayConfig.privateKey, {
      algorithm: "RS256",
      expiresIn: "5m",
      header: {
        alg: "RS256",
        serial_no: wxpayConfig.wechatCertSerial, // 商户证书序列号（或平台证书序列号）
      },
    });
  }

  /**
   * 发送Native支付下单请求（生成支付二维码链接）
   * @param outTradeNo 商户订单号（唯一）
   * @param totalAmount 订单总金额（单位：元，内部转为分）
   * @param subject 订单标题（商品描述）
   * @param attach 商户自定义数据（可选）
   * @returns 包含二维码链接的结果
   */
  async sendNativeOrderRequest(
    outTradeNo: string,
    totalAmount: number,
    subject: string,
    attach?: string
  ): Promise<{ code_url: string; expire_time: number }> {
    try {
      // 1. 参数校验（避免无效请求）
      if (!outTradeNo || !totalAmount || !subject) {
        throw new Error("缺少必要参数：商户订单号、总金额、订单标题");
      }
      if (totalAmount <= 0) {
        throw new Error("订单金额必须大于0");
      }

      // 2. 转换金额单位（元 → 分，微信要求整数）
      const totalFeeInFen = Math.round(totalAmount * 100);

      // 3. 构建微信下单参数
      const orderParams: WxNativeOrderParams = {
        appid: wxpayConfig.appId,
        mchid: wxpayConfig.merchantId,
        out_trade_no: outTradeNo,
        description: subject,
        attach: attach,
        notify_url: wxpayConfig.notifyUrl,
        return_url: wxpayConfig.returnUrl,
        amount: {
          total: totalFeeInFen,
          currency: "CNY",
        },
      };

      // 4. 配置请求头（添加JWT鉴权）
      const jwtToken = this.generateAuthJwt();
      const requestConfig: AxiosRequestConfig = {
        method: "POST",
        url: wxpayConfig.nativeOrderPath,
        headers: {
          Authorization: `WECHATPAY2-SHA256-RSA2048 ${jwtToken}`,
        },
        data: orderParams,
      };

      // 5. 发送请求并处理响应
      const response = await this.axiosInstance(requestConfig);
      const result = response.data as WxNativeOrderResponse;

      if (!result.code_url) {
        throw new Error("微信下单失败：未返回二维码链接");
      }

      console.log(
        `Native下单成功：商户订单号=${outTradeNo}，二维码链接=${result.code_url}`
      );
      return {
        code_url: result.code_url,
        expire_time: Date.now() + wxpayConfig.qrCodeExpire, // 二维码过期时间
      };
    } catch (error) {
      const errorMsg = (error as Error).message || "Native下单请求失败";
      console.error(
        `Native下单异常：商户订单号=${outTradeNo}，原因=${errorMsg}`
      );
      throw new Error(errorMsg);
    }
  }

  /**
   * 验证微信支付回调签名（确保回调来自微信官方）
   * @param headers 回调请求头（包含Wechatpay-*相关字段）
   * @param rawBody 回调原始请求体（JSON字符串，不可修改）
   * @returns 签名是否有效
   */
  verifyNotifySignature(
    headers: Record<string, string>,
    rawBody: string
  ): boolean {
    try {
      // 1. 提取请求头中的签名相关字段
      const timestamp = headers["wechatpay-timestamp"];
      const nonce = headers["wechatpay-nonce"];
      const signature = headers["wechatpay-signature"];

      // 2. 校验必要字段
      if (!timestamp || !nonce || !signature) {
        console.error("回调签名验证失败：缺少Wechatpay-*请求头");
        return false;
      }

      // 3. 构建验签串（格式：timestamp\nnonce\nbody\n）
      const signStr = `${timestamp}\n${nonce}\n${rawBody}\n`;

      // 4. 加载微信平台公钥并验证签名（算法：SHA256withRSA）
      const publicKey = KEYUTIL.getKey(wxpayConfig.wechatPublicKey);
      const verifyResult = KJUR.crypto.Signature.verifyHex(
        hextob64(CryptoJS.SHA256(signStr).toString(CryptoJS.enc.Hex)),
        signature,
        publicKey,
        "SHA256withRSA"
      );

      if (!verifyResult) {
        console.error("回调签名验证失败：签名不匹配");
      }
      return verifyResult;
    } catch (error) {
      console.error(`回调签名验证异常：${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 解密微信支付回调密文（获取支付成功详情）
   * @param resource 回调中的resource对象（包含密文、随机串等）
   * @returns 解密后的支付数据
   */
  decryptNotifyData(resource: WxNotifyRawBody["resource"]): DecryptedWxPayData {
    try {
      // 1. 校验加密算法（仅支持AEAD_AES_256_GCM）
      if (resource.algorithm !== "AEAD_AES_256_GCM") {
        throw new Error(`不支持的加密算法：${resource.algorithm}`);
      }

      // 2. 解码相关数据（Base64密文 → 16进制，附加数据/随机串 → 16进制）
      const ciphertextHex = CryptoJS.enc.Base64.parse(
        resource.ciphertext
      ).toString(CryptoJS.enc.Hex);
      const associatedDataHex = CryptoJS.enc.Utf8.parse(
        resource.associated_data || ""
      ).toString(CryptoJS.enc.Hex);
      const nonceHex = CryptoJS.enc.Utf8.parse(resource.nonce).toString(
        CryptoJS.enc.Hex
      );

      // 3. 加载APIv3密钥（32位密钥 → 16进制）
      const keyHex = CryptoJS.enc.Utf8.parse(wxpayConfig.apiV3Key);

      // 4. AES-GCM解密（微信V3回调解密标准流程）
      const encrypted = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Hex.parse(ciphertextHex),
      });
      const decrypted = CryptoJS.AES.decrypt(encrypted, keyHex, {
        iv: CryptoJS.enc.Hex.parse(nonceHex),
        associatedData: CryptoJS.enc.Hex.parse(associatedDataHex),
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.NoPadding,
      });

      // 5. 解析解密结果为JSON对象
      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decryptedStr) as DecryptedWxPayData;
    } catch (error) {
      const errorMsg = `回调数据解密失败：${(error as Error).message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * 根据商户订单号查询微信支付订单状态
   * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_2.shtml
   * @param outTradeNo 商户订单号（下单时传入的out_trade_no）
   * @returns 订单查询结果（包含交易状态、金额等核心信息）
   */
  async queryOrderByOutTradeNo(
    outTradeNo: string
  ): Promise<WxOrderQueryResponse> {
    try {
      // 1. 参数校验（避免无效请求）
      if (!outTradeNo || outTradeNo.trim() === "") {
        throw new Error("商户订单号不能为空");
      }

      // 2. 替换接口路径中的订单号占位符（{out_trade_no}）
      const queryUrl = wxpayConfig.orderQueryPath.replace(
        "{out_trade_no}",
        encodeURIComponent(outTradeNo) // URL编码，避免特殊字符问题
      );

      // 3. 生成JWT鉴权令牌（微信V3接口统一鉴权方式）
      const jwtToken = this.generateAuthJwt();

      // 4. 配置请求参数（GET请求，需在header携带鉴权信息）
      const requestConfig: AxiosRequestConfig = {
        method: "GET",
        url: queryUrl,
        headers: {
          Authorization: `WECHATPAY2-SHA256-RSA2048 ${jwtToken}`,
          Accept: "application/json", // 明确要求返回JSON格式
        },
      };

      // 5. 发送查询请求并处理响应
      const response = await this.axiosInstance(requestConfig);

      // 6. 校验响应有效性（微信正常返回200状态码，且数据结构符合预期）
      if (response.status !== 200) {
        throw new Error(`查询接口返回异常状态码：${response.status}`);
      }
      const queryResult = response.data as WxOrderQueryResponse;

      // 7. 校验核心字段（确保返回关键交易信息）
      if (!queryResult.out_trade_no || !queryResult.trade_state) {
        throw new Error("查询结果缺少核心字段（商户订单号/交易状态）");
      }

      // 8. 日志记录（便于问题排查）
      console.log(
        `订单查询成功：商户订单号=${outTradeNo}，交易状态=${
          queryResult.trade_state
        }，微信订单号=${queryResult.transaction_id || "未生成"}`
      );

      // 9. 返回结构化查询结果
      return queryResult;
    } catch (error) {
      // 统一异常处理（补充上下文信息，便于定位问题）
      const errorMsg = (error as Error).message || "订单查询失败";
      console.error(
        `订单查询异常：商户订单号=${outTradeNo}，原因=${errorMsg}`,
        error // 打印完整错误栈，便于调试
      );
      // 重新抛出异常（让调用方感知失败，做后续处理如重试/提示用户）
      throw new Error(`订单查询失败：${errorMsg}`);
    }
  }

  /**
   * 处理微信支付异步通知
   * @param headers 回调请求头
   * @param rawBody 回调原始请求体
   * @returns 处理结果
   */
  async handleNotify(
    headers: Record<string, string>,
    rawBody: string
  ): Promise<string> {
    // 验证签名
    if (!this.verifyNotifySignature(headers, rawBody)) {
      console.error("签名验证失败");
      return "FAIL";
    }

    // 解析原始请求体
    const notifyBody: WxNotifyRawBody = JSON.parse(rawBody);

    // 验证通知数据
    if (!notifyBody.resource || !notifyBody.event_type) {
      console.error("通知参数不完整");
      return "FAIL";
    }

    // 处理支付成功的情况
    if (notifyBody.event_type === WxNotifyEventType.TRANSACTION_SUCCESS) {
      try {
        // 解密支付数据
        const payData = this.decryptNotifyData(notifyBody.resource);

        // 更新订单状态
        const success = await orderService.updateOrderPaymentStatus(
          payData.out_trade_no,
          "PAID"
        );

        if (success) {
          console.log(`订单 ${payData.out_trade_no} 支付成功`);
          return "SUCCESS";
        } else {
          console.error(`更新订单 ${payData.out_trade_no} 状态失败`);
          return "FAIL";
        }
      } catch (error) {
        console.error(`处理支付通知失败: ${(error as Error).message}`);
        return "FAIL";
      }
    }

    return "SUCCESS";
  }
}

// 实例化微信支付服务，与支付宝服务保持一致的导出方式
export const wxpayService = new WxpayService();
