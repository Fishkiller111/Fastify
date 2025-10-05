// 测试 DexScreener API
const contractAddress = 'E7jeHvPooFZeocGYewLqEh5oUgTKBDe47agTy5qFpump';
const url = `https://api.dexscreener.com/token-pairs/v1/solana/${contractAddress}`;

console.log('🔍 测试 DexScreener API');
console.log('Contract Address:', contractAddress);
console.log('URL:', url);

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('\n✅ API 响应:');
    console.log(JSON.stringify(data, null, 2));

    if (Array.isArray(data) && data.length > 0) {
      const tokenName = data[0]?.baseToken?.name;
      const tokenSymbol = data[0]?.baseToken?.symbol;
      console.log('\n🎉 Token 信息:');
      console.log('Name:', tokenName);
      console.log('Symbol:', tokenSymbol);
    }
  })
  .catch(err => {
    console.error('\n❌ 错误:', err.message);
  });
