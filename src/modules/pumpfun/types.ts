/**
 * PumpFun 代币创建相关类型定义
 */

// 代币元数据
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image?: File | Blob;
  twitter?: string;
  telegram?: string;
  website?: string;
  showName?: boolean;
}

// IPFS 元数据响应
export interface IPFSMetadataResponse {
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image: string;
    showName: boolean;
    createdOn: string;
  };
  metadataUri: string;
}

// 准备创建代币请求（获取待签名交易）
export interface PrepareCreateTokenRequest {
  // 钱包公钥
  walletPublicKey: string;
  // 代币元数据
  tokenMetadata: {
    name: string;
    symbol: string;
    description: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    showName?: boolean;
  };
  // 图片文件路径或 URL
  imageUrl?: string;
  // 初始购买金额 (SOL)
  initialBuyAmount: number;
  // 滑点容忍度 (%)
  slippage?: number;
  // 优先费用 (SOL)
  priorityFee?: number;
}

// 准备创建代币响应
export interface PrepareCreateTokenResponse {
  success: boolean;
  // 序列化的待签名交易（Base64 编码）
  transaction?: string;
  // Mint 地址
  mintAddress?: string;
  // Mint 私钥（Base58 编码，需要保存用于后续签名）
  mintPrivateKey?: string;
  // 错误信息
  error?: string;
}

// 提交已签名交易请求
export interface SubmitSignedTransactionRequest {
  // 用户签名后的交易（Base64 编码）
  signedTransaction: string;
  // Mint 地址
  mintAddress: string;
}

// 创建代币响应（通用响应）
export interface CreateTokenResponse {
  success: boolean;
  signature?: string;
  txUrl?: string;
  mintAddress?: string;
  error?: string;
}

// PumpPortal 交易请求
export interface PumpPortalTradeRequest {
  publicKey: string;
  action: 'create';
  tokenMetadata: {
    name: string;
    symbol: string;
    uri: string;
  };
  mint: string;
  denominatedInSol: string;
  amount: number;
  slippage: number;
  priorityFee: number;
  pool: 'pump';
}
