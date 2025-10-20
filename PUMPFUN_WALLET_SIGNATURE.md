# PumpFun 钱包签名流程文档

## 概述

本文档介绍如何通过**钱包签名**的方式创建 PumpFun 代币，而不是直接提供私钥。这是更安全的方式，推荐在生产环境中使用。

## 为什么使用钱包签名？

### 安全优势

1. **私钥不离开用户设备**: 私钥始终保存在用户的钱包中，不会通过网络传输
2. **降低风险**: 即使 API 服务器被攻击，黑客也无法获取用户私钥
3. **用户可控**: 用户可以在钱包中查看交易详情并决定是否签名
4. **符合最佳实践**: 遵循 Web3 应用的标准安全实践

### 与旧方式的对比

| 方式 | 安全性 | 用户体验 | 推荐程度 |
|------|--------|----------|----------|
| 直接传递私钥 | ❌ 低 | 😊 简单 | ⚠️ 仅测试环境 |
| 钱包签名 | ✅ 高 | 😊 标准 | ✅ 生产环境推荐 |

## 工作流程

### 整体流程图

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   前端      │      │   后端API   │      │  Solana链   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                     │
       │ 1. 准备交易请求    │                     │
       ├───────────────────>│                     │
       │    (钱包公钥)       │                     │
       │                    │                     │
       │                    │ 2. 上传元数据到IPFS │
       │                    ├────────────────────>│
       │                    │                     │
       │                    │ 3. 创建交易         │
       │                    ├────────────────────>│
       │                    │                     │
       │                    │ 4. Mint签名         │
       │                    │                     │
       │ 5. 返回待签名交易  │                     │
       │<───────────────────┤                     │
       │                    │                     │
       │ 6. 用户签名        │                     │
       │  (钱包弹窗)        │                     │
       │                    │                     │
       │ 7. 提交签名后的交易│                     │
       ├───────────────────>│                     │
       │                    │                     │
       │                    │ 8. 发送交易到链     │
       │                    ├────────────────────>│
       │                    │                     │
       │                    │ 9. 等待确认         │
       │                    │<────────────────────┤
       │                    │                     │
       │ 10. 返回交易结果   │                     │
       │<───────────────────┤                     │
       │                    │                     │
```

## API 端点

### 1. 准备创建代币交易

**POST** `/api/pumpfun/prepare`

获取待签名的交易数据。

#### 请求体

```json
{
  "walletPublicKey": "your-wallet-public-key",
  "tokenMetadata": {
    "name": "My Token",
    "symbol": "MTK",
    "description": "This is my awesome token",
    "twitter": "https://twitter.com/mytoken",
    "telegram": "https://t.me/mytoken",
    "website": "https://mytoken.com",
    "showName": true
  },
  "imageUrl": "https://example.com/token-logo.png",
  "initialBuyAmount": 0.1,
  "slippage": 10,
  "priorityFee": 0.0005
}
```

#### 响应

```json
{
  "success": true,
  "transaction": "base64-encoded-transaction",
  "mintAddress": "9vN2...7Qxm",
  "mintPrivateKey": "mint-private-key-base58"
}
```

**重要**: `mintPrivateKey` 需要临时保存在前端，用于第二步提交时验证。

### 2. 提交已签名的交易

**POST** `/api/pumpfun/submit`

提交用户签名后的交易。

#### 请求体

```json
{
  "signedTransaction": "base64-encoded-signed-transaction",
  "mintAddress": "9vN2...7Qxm"
}
```

#### 响应

```json
{
  "success": true,
  "signature": "5J7Z...3x8K",
  "txUrl": "https://solscan.io/tx/5J7Z...3x8K",
  "mintAddress": "9vN2...7Qxm"
}
```

## 前端集成示例

### React + Phantom 钱包示例

```typescript
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

const CreateTokenComponent = () => {
  const { publicKey, signTransaction } = useWallet();

  const createToken = async () => {
    if (!publicKey || !signTransaction) {
      alert('请先连接钱包');
      return;
    }

    try {
      // 步骤 1: 准备交易
      const prepareResponse = await fetch('/api/pumpfun/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${yourJwtToken}`,
        },
        body: JSON.stringify({
          walletPublicKey: publicKey.toBase58(),
          tokenMetadata: {
            name: 'My Token',
            symbol: 'MTK',
            description: 'This is my awesome token',
          },
          initialBuyAmount: 0.1,
        }),
      });

      const prepareData = await prepareResponse.json();

      if (!prepareData.success) {
        throw new Error(prepareData.error);
      }

      // 步骤 2: 反序列化交易
      const txBuffer = Buffer.from(prepareData.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      // 步骤 3: 用户签名（会弹出钱包确认窗口）
      const signedTransaction = await signTransaction(transaction);

      // 步骤 4: 提交签名后的交易
      const submitResponse = await fetch('/api/pumpfun/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${yourJwtToken}`,
        },
        body: JSON.stringify({
          signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64'),
          mintAddress: prepareData.mintAddress,
        }),
      });

      const submitData = await submitResponse.json();

      if (submitData.success) {
        console.log('代币创建成功!');
        console.log('交易链接:', submitData.txUrl);
        console.log('Mint 地址:', submitData.mintAddress);
      } else {
        throw new Error(submitData.error);
      }
    } catch (error) {
      console.error('创建代币失败:', error);
    }
  };

  return (
    <button onClick={createToken}>
      创建代币
    </button>
  );
};
```

### Vue 3 + Solana Wallet Adapter 示例

```vue
<template>
  <button @click="createToken">创建代币</button>
</template>

<script setup lang="ts">
import { useWallet } from 'solana-wallets-vue';
import { Connection, VersionedTransaction } from '@solana/web3.js';

const { publicKey, signTransaction } = useWallet();

const createToken = async () => {
  if (!publicKey.value || !signTransaction.value) {
    alert('请先连接钱包');
    return;
  }

  try {
    // 步骤 1: 准备交易
    const prepareResponse = await fetch('/api/pumpfun/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${yourJwtToken}`,
      },
      body: JSON.stringify({
        walletPublicKey: publicKey.value.toBase58(),
        tokenMetadata: {
          name: 'My Token',
          symbol: 'MTK',
          description: 'This is my awesome token',
        },
        initialBuyAmount: 0.1,
      }),
    });

    const prepareData = await prepareResponse.json();

    if (!prepareData.success) {
      throw new Error(prepareData.error);
    }

    // 步骤 2: 反序列化交易
    const txBuffer = Buffer.from(prepareData.transaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    // 步骤 3: 用户签名
    const signedTransaction = await signTransaction.value(transaction);

    // 步骤 4: 提交签名后的交易
    const submitResponse = await fetch('/api/pumpfun/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${yourJwtToken}`,
      },
      body: JSON.stringify({
        signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64'),
        mintAddress: prepareData.mintAddress,
      }),
    });

    const submitData = await submitResponse.json();

    if (submitData.success) {
      console.log('代币创建成功!');
      console.log('交易链接:', submitData.txUrl);
    }
  } catch (error) {
    console.error('创建代币失败:', error);
  }
};
</script>
```

### 原生 JavaScript 示例

```javascript
// 需要先安装 @solana/web3.js 和 bs58
import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';

async function createTokenWithWallet() {
  // 假设你已经连接了 Phantom 钱包
  const provider = window.solana;

  if (!provider || !provider.isPhantom) {
    alert('请安装 Phantom 钱包');
    return;
  }

  // 连接钱包
  await provider.connect();
  const walletPublicKey = provider.publicKey.toString();

  // 步骤 1: 准备交易
  const prepareResponse = await fetch('http://localhost:7000/api/pumpfun/prepare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourJwtToken}`,
    },
    body: JSON.stringify({
      walletPublicKey: walletPublicKey,
      tokenMetadata: {
        name: 'My Token',
        symbol: 'MTK',
        description: 'This is my awesome token',
      },
      initialBuyAmount: 0.1,
    }),
  });

  const prepareData = await prepareResponse.json();

  if (!prepareData.success) {
    throw new Error(prepareData.error);
  }

  // 步骤 2: 反序列化交易
  const txBuffer = Buffer.from(prepareData.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);

  // 步骤 3: 用户签名（Phantom 钱包会弹窗）
  const signedTransaction = await provider.signTransaction(transaction);

  // 步骤 4: 提交签名后的交易
  const submitResponse = await fetch('http://localhost:7000/api/pumpfun/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourJwtToken}`,
    },
    body: JSON.stringify({
      signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64'),
      mintAddress: prepareData.mintAddress,
    }),
  });

  const submitData = await submitResponse.json();

  if (submitData.success) {
    console.log('代币创建成功!');
    console.log('交易链接:', submitData.txUrl);
    console.log('Mint 地址:', submitData.mintAddress);

    // 打开 Solscan 查看交易
    window.open(submitData.txUrl, '_blank');
  } else {
    throw new Error(submitData.error);
  }
}
```

## 常见钱包集成

### Phantom 钱包

```javascript
// 检测是否安装
if (window.solana && window.solana.isPhantom) {
  // 连接钱包
  await window.solana.connect();

  // 获取公钥
  const publicKey = window.solana.publicKey.toString();

  // 签名交易
  const signedTx = await window.solana.signTransaction(transaction);
}
```

### Solflare 钱包

```javascript
// 连接钱包
await window.solflare.connect();

// 获取公钥
const publicKey = window.solflare.publicKey.toString();

// 签名交易
const signedTx = await window.solflare.signTransaction(transaction);
```

### @solana/wallet-adapter (推荐)

这是最通用的方式，支持多个钱包：

```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-wallets
```

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

const { publicKey, signTransaction } = useWallet();
```

## 错误处理

### 常见错误和解决方案

#### 1. 用户拒绝签名

```javascript
try {
  const signedTransaction = await signTransaction(transaction);
} catch (error) {
  if (error.message.includes('User rejected')) {
    alert('您拒绝了交易签名');
  }
}
```

#### 2. 钱包未连接

```javascript
if (!publicKey) {
  alert('请先连接钱包');
  return;
}
```

#### 3. 余额不足

```javascript
const prepareData = await prepareResponse.json();
if (!prepareData.success && prepareData.error.includes('insufficient')) {
  alert('钱包余额不足，请确保有足够的 SOL');
}
```

## 安全注意事项

1. **验证交易内容**:
   - 用户应该在钱包中检查交易详情
   - 确认接收地址和金额

2. **使用 HTTPS**:
   - 生产环境必须使用 HTTPS
   - 防止中间人攻击

3. **不要保存 mintPrivateKey**:
   - mintPrivateKey 只在创建过程中使用
   - 交易完成后应该丢弃

4. **错误处理**:
   - 妥善处理所有可能的错误
   - 向用户显示友好的错误消息

5. **网络选择**:
   - 确保钱包和 API 使用相同的网络（Mainnet/Devnet）
   - 测试时使用 Devnet

## 测试流程

### 使用 Devnet 测试

1. 将 `SOLANA_RPC_ENDPOINT` 设置为 Devnet:
   ```bash
   SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
   ```

2. 获取 Devnet SOL:
   - 访问 https://faucet.solana.com
   - 输入你的钱包地址
   - 领取测试 SOL

3. 切换钱包到 Devnet:
   - Phantom: 设置 → 开发者设置 → 测试网络 → Devnet
   - Solflare: 设置 → 网络 → Devnet

4. 测试创建代币

## 对比：旧方式 vs 新方式

### 旧方式（不推荐用于生产）

```typescript
// ❌ 不安全：私钥通过网络传输
const response = await fetch('/api/pumpfun/create', {
  method: 'POST',
  body: JSON.stringify({
    walletPrivateKey: 'your-private-key', // 危险！
    // ...其他参数
  }),
});
```

### 新方式（推荐）

```typescript
// ✅ 安全：只传递公钥，私钥留在钱包中
const prepareResponse = await fetch('/api/pumpfun/prepare', {
  method: 'POST',
  body: JSON.stringify({
    walletPublicKey: publicKey.toBase58(), // 安全
    // ...其他参数
  }),
});

// 用户在钱包中签名
const signedTx = await signTransaction(transaction);

// 提交签名后的交易
await fetch('/api/pumpfun/submit', {
  method: 'POST',
  body: JSON.stringify({
    signedTransaction: base64SignedTx,
    mintAddress: mintAddress,
  }),
});
```

## FAQ

### Q: 为什么需要两个 API 调用？

A: 第一个调用准备交易，第二个调用提交签名后的交易。这样可以让用户在本地钱包中签名，而不是将私钥发送到服务器。

### Q: mintPrivateKey 是什么？

A: 这是代币的 mint 账户私钥。它由服务器生成，用于部分签名交易。用户的钱包会添加另一个签名。

### Q: 我可以同时使用两种方式吗？

A: 可以。旧的 `/api/pumpfun/create` 端点仍然保留用于向后兼容，但建议新项目使用钱包签名方式。

### Q: 签名失败怎么办？

A: 检查：
1. 钱包是否连接
2. 网络是否正确（Mainnet/Devnet）
3. 余额是否足够
4. 交易是否已过期

## 总结

钱包签名流程提供了更高的安全性，同时保持了良好的用户体验。通过将私钥保留在用户的钱包中，我们遵循了 Web3 应用的最佳安全实践。

**推荐在生产环境中使用此方式！**
