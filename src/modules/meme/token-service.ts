/**
 * 代币查询服务
 * 使用 DexScreener API 查询代币元数据
 * 使用 Redis 缓存提升性能
 */

import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import redis from '../../config/redis.js';
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
 * 使用 DexScreener API 查询代币元数据（带 Redis 缓存）
 */
async function fetchTokenMetadataFromDexScreener(
  contractAddress: string
): Promise<string | null> {
  console.log(`\n🔍 ========== 开始查询 Token 元数据 (DexScreener) ==========`);
  console.log(`   Token 地址: ${contractAddress}`);

  try {
    // 尝试从 Redis 缓存读取
    const cacheKey = `token:name:${contractAddress}`;
    const cachedName = await redis.get(cacheKey);

    if (cachedName) {
      console.log(`   ✅ 从 Redis 缓存获取: "${cachedName}"`);
      return cachedName;
    }

    console.log(`   ⚠️  缓存未命中，开始 API 请求...`);

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

      // 写入 Redis 缓存（24小时过期）
      await redis.setex(cacheKey, 86400, tokenName);
      console.log(`   💾 已缓存到 Redis (TTL: 24h)`);

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

/**
 * 检查代币是否发射成功（带 Redis 缓存）
 * 
 * @param type - 事件类型 (pumpfun 或 bonk)
 * @param contractAddress - 代币合约地址
 * @returns true 表示发射成功，false 表示未发射成功，null 表示查询失败
 * 
 * 判断规则：
 * - pumpfun: dexId === "pumpswap" → 成功, dexId === "pumpfun" → 失败
 * - bonk: dexId === "raydium" → 成功, dexId === "launchlab" → 失败
 */
export async function checkTokenLaunchStatus(
  type: MemeEventType,
  contractAddress: string
): Promise<boolean | null> {
  console.log(`\n🚀 ========== 检查代币发射状态 ==========`);
  console.log(`   类型: ${type}`);
  console.log(`   合约地址: ${contractAddress}`);

  try {
    // 尝试从 Redis 缓存读取发射状态
    const cacheKey = `token:launch:${contractAddress}`;
    const cachedStatus = await redis.get(cacheKey);

    if (cachedStatus !== null) {
      const isLaunched = cachedStatus === '1';
      console.log(`   ✅ 从 Redis 缓存获取发射状态: ${isLaunched ? '成功' : '失败'}`);
      return isLaunched;
    }

    console.log(`   ⚠️  缓存未命中，开始 API 请求...`);

    const url = `https://api.dexscreener.com/token-pairs/v1/solana/${contractAddress}`;
    console.log(`   请求 URL: ${url}`);

    const responseText = await httpsRequest(url);
    const data = JSON.parse(responseText) as DexScreenerPair[];

    console.log(`   响应数据:`, JSON.stringify(data, null, 2));

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️  未找到该代币的交易对数据，无法判断发射状态`);
      return null;
    }

    const dexId = data[0]?.dexId;

    if (!dexId) {
      console.error(`❌ 响应数据中缺少 dexId 字段`);
      return null;
    }

    console.log(`   检测到 DEX ID: ${dexId}`);

    // 根据类型和 dexId 判断是否发射成功
    let isLaunched: boolean;

    if (type === 'pumpfun') {
      // pumpfun 规则: pumpswap = 成功, pumpfun = 失败
      if (dexId === 'pumpswap') {
        isLaunched = true;
        console.log(`   ✅ Pumpfun 代币已发射成功 (DEX: pumpswap)`);
      } else if (dexId === 'pumpfun') {
        isLaunched = false;
        console.log(`   ❌ Pumpfun 代币未发射成功 (DEX: pumpfun)`);
      } else {
        console.warn(`   ⚠️  未知的 DEX ID: ${dexId}，默认判定为未发射`);
        isLaunched = false;
      }
    } else if (type === 'bonk') {
      // bonk 规则: raydium = 成功, launchlab = 失败
      if (dexId === 'raydium') {
        isLaunched = true;
        console.log(`   ✅ Bonk 代币已发射成功 (DEX: raydium)`);
      } else if (dexId === 'launchlab') {
        isLaunched = false;
        console.log(`   ❌ Bonk 代币未发射成功 (DEX: launchlab)`);
      } else {
        console.warn(`   ⚠️  未知的 DEX ID: ${dexId}，默认判定为未发射`);
        isLaunched = false;
      }
    } else {
      console.error(`   ❌ 未知的事件类型: ${type}`);
      return null;
    }

    console.log(`\n🎯 最终判定结果: ${isLaunched ? '发射成功' : '未发射成功'}`);

    // 写入 Redis 缓存（1小时过期，发射状态可能变化）
    await redis.setex(cacheKey, 3600, isLaunched ? '1' : '0');
    console.log(`   💾 已缓存到 Redis (TTL: 1h)`);

    return isLaunched;
  } catch (error: any) {
    console.error(`\n🔥 ========== 检查发射状态错误 ==========`);
    console.error(`错误类型: ${error.name}`);
    console.error(`错误信息: ${error.message}`);
    if (error.stack) {
      console.error(`堆栈信息:\n${error.stack}`);
    }
    return null;
  }
}

export default {
  getTokenName,
  getTokenNames,
  checkTokenLaunchStatus,
};
