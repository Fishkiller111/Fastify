/**
 * 代币查询服务
 * 根据合约地址和类型从 pumpfun 或 bonk 平台查询代币名称
 */

import type { MemeEventType } from './types.js';

/**
 * 从 Pumpfun 平台查询代币名称
 */
async function fetchPumpfunTokenName(contractAddress: string): Promise<string | null> {
  try {
    // TODO: 实现 Pumpfun API 调用
    // const response = await fetch(`https://api.pumpfun.io/token/${contractAddress}`);
    // const data = await response.json();
    // return data.name || null;

    // 模拟返回,实际应该调用真实的 Pumpfun API
    console.log(`查询 Pumpfun 代币名称: ${contractAddress}`);
    return null;
  } catch (error) {
    console.error('查询 Pumpfun 代币名称失败:', error);
    return null;
  }
}

/**
 * 从 Bonk 平台查询代币名称
 */
async function fetchBonkTokenName(contractAddress: string): Promise<string | null> {
  try {
    // TODO: 实现 Bonk API 调用
    // const response = await fetch(`https://api.bonk.io/token/${contractAddress}`);
    // const data = await response.json();
    // return data.name || null;

    // 模拟返回,实际应该调用真实的 Bonk API
    console.log(`查询 Bonk 代币名称: ${contractAddress}`);
    return null;
  } catch (error) {
    console.error('查询 Bonk 代币名称失败:', error);
    return null;
  }
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
