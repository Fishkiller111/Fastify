/**
 * Token Service 单元测试
 * 测试 DexScreener API 集成
 */

import { getTokenName } from './dist/modules/meme/token-service.js';

async function testTokenService() {
  console.log('🧪 开始测试 Token Service (DexScreener API)');
  console.log('='.repeat(60));

  const testCases = [
    {
      name: 'Bonk Token (Official)',
      type: 'bonk',
      contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      expectedName: 'Bonk',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n测试用例: ${testCase.name}`);
    console.log(`  Type: ${testCase.type}`);
    console.log(`  Address: ${testCase.contractAddress}`);

    try {
      const tokenName = await getTokenName(testCase.type, testCase.contractAddress);

      if (tokenName) {
        console.log(`  ✅ 获取成功: "${tokenName}"`);

        if (tokenName === testCase.expectedName) {
          console.log(`  ✅ 验证成功: 名称匹配`);
        } else {
          console.log(`  ⚠️  警告: 名称不匹配`);
          console.log(`     期望: "${testCase.expectedName}"`);
          console.log(`     实际: "${tokenName}"`);
        }
      } else {
        console.log(`  ❌ 获取失败: 返回 null`);
      }
    } catch (error) {
      console.log(`  ❌ 测试失败:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
}

testTokenService().catch(console.error);
