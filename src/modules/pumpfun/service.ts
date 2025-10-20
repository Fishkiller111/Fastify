/**
 * PumpFun 代币创建服务
 */

import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import config from '../../config/index.js';
import type {
  CreateTokenRequest,
  CreateTokenResponse,
  IPFSMetadataResponse,
  PumpPortalTradeRequest,
} from './types.js';

export class PumpFunService {
  private static connection: Connection;

  /**
   * 初始化 Solana 连接
   */
  private static getConnection(): Connection {
    if (!this.connection) {
      this.connection = new Connection(config.solana.rpcEndpoint, 'confirmed');
    }
    return this.connection;
  }

  /**
   * 上传元数据到 IPFS
   */
  private static async uploadMetadataToIPFS(
    tokenMetadata: CreateTokenRequest['tokenMetadata'],
    imageUrl?: string
  ): Promise<IPFSMetadataResponse> {
    try {
      const formData = new FormData();

      // 如果提供了图片 URL，需要先下载图片
      if (imageUrl) {
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        formData.append('file', imageBlob, 'token-image.png');
      }

      formData.append('name', tokenMetadata.name);
      formData.append('symbol', tokenMetadata.symbol);
      formData.append('description', tokenMetadata.description);
      formData.append('showName', tokenMetadata.showName !== false ? 'true' : 'false');

      if (tokenMetadata.twitter) {
        formData.append('twitter', tokenMetadata.twitter);
      }
      if (tokenMetadata.telegram) {
        formData.append('telegram', tokenMetadata.telegram);
      }
      if (tokenMetadata.website) {
        formData.append('website', tokenMetadata.website);
      }

      const response = await fetch('https://pump.fun/api/ipfs', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.statusText}`);
      }

      const data = await response.json() as IPFSMetadataResponse;
      return data;
    } catch (error) {
      console.error('上传元数据到 IPFS 失败:', error);
      throw new Error('Failed to upload metadata to IPFS');
    }
  }

  /**
   * 创建代币交易
   */
  private static async createTokenTransaction(
    publicKey: string,
    mintAddress: string,
    metadataUri: string,
    tokenName: string,
    tokenSymbol: string,
    initialBuyAmount: number,
    slippage: number = 10,
    priorityFee: number = 0.0005
  ): Promise<ArrayBuffer> {
    try {
      const requestBody: PumpPortalTradeRequest = {
        publicKey: publicKey,
        action: 'create',
        tokenMetadata: {
          name: tokenName,
          symbol: tokenSymbol,
          uri: metadataUri,
        },
        mint: mintAddress,
        denominatedInSol: 'true',
        amount: initialBuyAmount,
        slippage: slippage,
        priorityFee: priorityFee,
        pool: 'pump',
      };

      const response = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`创建交易失败: ${response.statusText} - ${errorText}`);
      }

      const data = await response.arrayBuffer();
      return data;
    } catch (error) {
      console.error('创建代币交易失败:', error);
      throw error;
    }
  }

  /**
   * 创建 PumpFun 代币
   */
  static async createToken(request: CreateTokenRequest): Promise<CreateTokenResponse> {
    try {
      // 1. 解析钱包私钥
      const signerKeyPair = Keypair.fromSecretKey(bs58.decode(request.walletPrivateKey));
      const publicKey = signerKeyPair.publicKey.toBase58();

      // 2. 生成随机 mint keypair
      const mintKeypair = Keypair.generate();
      const mintAddress = mintKeypair.publicKey.toBase58();

      console.log('创建代币中...');
      console.log('Mint 地址:', mintAddress);
      console.log('钱包地址:', publicKey);

      // 3. 上传元数据到 IPFS
      console.log('上传元数据到 IPFS...');
      const ipfsResponse = await this.uploadMetadataToIPFS(
        request.tokenMetadata,
        request.imageUrl
      );

      console.log('IPFS URI:', ipfsResponse.metadataUri);

      // 4. 创建交易
      console.log('创建交易...');
      const txData = await this.createTokenTransaction(
        publicKey,
        mintAddress,
        ipfsResponse.metadataUri,
        ipfsResponse.metadata.name,
        ipfsResponse.metadata.symbol,
        request.initialBuyAmount,
        request.slippage || 10,
        request.priorityFee || 0.0005
      );

      // 5. 反序列化、签名并发送交易
      console.log('签名并发送交易...');
      const connection = this.getConnection();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([mintKeypair, signerKeyPair]);

      const signature = await connection.sendTransaction(tx);
      console.log('交易已发送:', signature);

      // 6. 等待确认
      console.log('等待交易确认...');
      await connection.confirmTransaction(signature, 'confirmed');

      const txUrl = `https://solscan.io/tx/${signature}`;
      console.log('交易成功:', txUrl);

      return {
        success: true,
        signature: signature,
        txUrl: txUrl,
        mintAddress: mintAddress,
      };
    } catch (error) {
      console.error('创建代币失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 验证钱包私钥格式
   */
  static validatePrivateKey(privateKey: string): boolean {
    try {
      const decoded = bs58.decode(privateKey);
      return decoded.length === 64; // Solana 私钥应该是 64 字节
    } catch (error) {
      return false;
    }
  }
}
