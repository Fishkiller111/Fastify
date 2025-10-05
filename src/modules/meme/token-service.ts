/**
 * 代币查询服务
 * 使用 DexScreener API 查询代币元数据
 */

import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { MemeEventType } from './types.js';

/**
 * DexScreener API 响应接口
 */
interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  [key: string]: any;
}

/**
 * 获取代理配置
 */
function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (proxy) {
    console.log(`   使用代理: ${proxy}`);
    return new HttpsProxyAgent(proxy);
  }

  return undefined;
}

/**
 * 使用 HTTPS 模块进行请求（支持代理）
 */
function httpsRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const agent = getProxyAgent();
    const options: https.RequestOptions = agent ? { agent } : {};

    https
      .get(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * 使用 DexScreener API 查询代币元数据
 */
async function fetchTokenMetadataFromDexScreener(
  contractAddress: string
): Promise<string | null> {
  console.log(`\n🔍 ========== 开始查询 Token 元数据 (DexScreener) ==========`);
  console.log(`   Token 地址: ${contractAddress}`);

  try {
    const url = `https://api.dexscreener.com/token-pairs/v1/solana/${contractAddress}`;
    console.log(`   请求 URL: ${url}`);

    const responseText = await httpsRequest(url);
    const data = JSON.parse(responseText) as DexScreenerPair[];

    console.log(`   响应数据:`, JSON.stringify(data, null, 2));

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️  未找到该代币的交易对数据`);
      return null;
    }

    // 获取第一个交易对的 baseToken.name
    const tokenName = data[0]?.baseToken?.name;

    if (tokenName) {
      console.log(`\n🎉 成功获取 Token 名称: "${tokenName}"`);
      console.log(`   Symbol: ${data[0].baseToken.symbol}`);
      console.log(`   DEX: ${data[0].dexId}`);
      return tokenName;
    } else {
      console.error(`❌ 响应数据中缺少 baseToken.name 字段`);
      return null;
    }
  } catch (error: any) {
    console.error(`\n🔥 ========== DexScreener API 查询错误 ==========`);
    console.error(`错误类型: ${error.name}`);
    console.error(`错误信息: ${error.message}`);
    if (error.stack) {
      console.error(`堆栈信息:\n${error.stack}`);
    }
    return null;
  }
}

/**
 * 从 Pumpfun 平台查询代币名称
 */
async function fetchPumpfunTokenName(contractAddress: string): Promise<string | null> {
  return fetchTokenMetadataFromDexScreener(contractAddress);
}

/**
 * 从 Bonk 平台查询代币名称
 */
async function fetchBonkTokenName(contractAddress: string): Promise<string | null> {
  return fetchTokenMetadataFromDexScreener(contractAddress);
}

/**
 * 根据类型和合约地址查询代币名称
 */
export async function getTokenName(
  type: MemeEventType,
  contractAddress: string | undefined
): Promise<string | null> {
  if (!contractAddress) {
    return null;
  }

  switch (type) {
    case 'pumpfun':
      return await fetchPumpfunTokenName(contractAddress);
    case 'bonk':
      return await fetchBonkTokenName(contractAddress);
    default:
      return null;
  }
}

/**
 * 批量查询代币名称
 */
export async function getTokenNames(
  events: Array<{ type: MemeEventType; contract_address?: string }>
): Promise<Map<string, string>> {
  const tokenNameMap = new Map<string, string>();

  // 使用 Promise.all 并发查询
  await Promise.all(
    events.map(async (event) => {
      if (event.contract_address) {
        const tokenName = await getTokenName(event.type, event.contract_address);
        if (tokenName) {
          tokenNameMap.set(event.contract_address, tokenName);
        }
      }
    })
  );

  return tokenNameMap;
}

export default {
  getTokenName,
  getTokenNames,
};
