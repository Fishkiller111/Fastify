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

// 创建代币请求
export interface CreateTokenRequest {
  // 钱包私钥 (Base58 编码)
  walletPrivateKey: string;
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

// 创建代币响应
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
