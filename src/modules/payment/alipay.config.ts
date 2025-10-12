export const alipayConfig = {
  // 应用ID - 从支付宝开放平台获取
  appId: "your-alipay-app-id",

  // 应用私钥 - 从支付宝开放平台生成并下载
  privateKey:
    "-----BEGIN PRIVATE KEY-----\n" +
    "your-private-key-here\n" +
    "-----END PRIVATE KEY-----",

  // 支付宝公钥 - 从支付宝开放平台获取
  alipayPublicKey:
    "-----BEGIN PUBLIC KEY-----\n" +
    "your-alipay-public-key-here\n" +
    "-----END PUBLIC KEY-----",

  // 字符编码格式
  charset: "UTF-8",

  // 接口网关地址 - 生产环境使用正式地址
  gatewayUrl: "https://openapi.alipay.com/gateway.do",

  // 数据格式
  format: "JSON",

  // 签名方式 - 推荐使用RSA2
  signType: "RSA2",

  // 支付宝异步通知地址 - 需要公网可访问
  notifyUrl: "https://your-domain.com/api/alipay/notify",

  // 支付宝同步返回地址 - 用户支付后跳转页面
  returnUrl: "https://your-domain.com/api/alipay/return",
};
