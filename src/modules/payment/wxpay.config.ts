/**
 * 微信支付V3配置
 * 需从微信支付商户平台获取对应参数
 */
export const wxpayConfig = {
  // 基础配置
  appId: "wxd678efh567hg6787", // 公众号/小程序/AppID（与商户号绑定）
  merchantId: "1230000109", // 商户号（登录商户平台 → 账户中心 → 商户信息）
  apiV3Key: "your-api-v3-key-32-characters", // APIv3密钥（32位，商户平台 → API安全）

  // 密钥与证书
  privateKey: `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAMrNt5...（你的商户私钥PEM完整内容）
-----END PRIVATE KEY-----`, // 商户私钥（用于JWT签名）
  wechatCertSerial: "3000000001", // 微信平台证书序列号（用于回调验签）
  wechatPublicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn...（你的微信平台公钥PEM完整内容）
-----END PUBLIC KEY-----`, // 微信平台公钥（用于回调验签）

  // 接口与回调地址
  gatewayUrl: "https://api.mch.weixin.qq.com", // 微信支付网关
  nativeOrderPath: "/v3/pay/transactions/native", // Native下单接口路径
  orderQueryPath: "/v3/pay/transactions/out-trade-no/{out_trade_no}", // 商户订单号查询路径
  notifyUrl: "https://your-domain.com/api/wxpay/notify", // 支付成功回调地址（公网可访问）
  returnUrl: "https://your-domain.com/pay/result", // 支付完成跳转地址（可选）

  // 其他配置
  signType: "RSA2" as const, // 签名类型（微信V3默认RSA2）
  charset: "UTF-8",
  qrCodeExpire: 1800000, // 二维码有效期（30分钟，单位：毫秒）
};

// 微信支付回调通知类型枚举（避免硬编码）
export enum WxNotifyEventType {
  TRANSACTION_SUCCESS = "TRANSACTION.SUCCESS", // 支付成功通知
  REFUND_SUCCESS = "REFUND.SUCCESS", // 退款成功通知（预留）
}
