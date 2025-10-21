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
       │                    │ 4. Mint部分签名     │
       │                    │   (第一个签名)      │
       │                    │                     │
       │ 5. 返回待签名交易  │                     │
       │<───────────────────┤                     │
       │  (含Mint部分签名)  │                     │
       │                    │                     │
       │ 6. 用户钱包签名    │                     │
       │   (第二个签名)     │                     │
       │   钱包弹窗确认     │                     │
       │                    │                     │
       │ 7. 提交完整签名交易│                     │
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

### 关键技术点：多重签名顺序

**重要**: PumpFun 代币创建需要**两个签名者**：

1. **Mint Keypair 签名** (由服务器完成)
   - 服务器生成随机 mint keypair
   - 使用 `tx.sign([mintKeypair])` 进行部分签名
   - 这是交易的**第一个签名**

2. **用户钱包签名** (由前端钱包完成)
   - 用户钱包接收已有 mint 签名的交易
   - 钱包添加用户的签名作为**第二个签名**
   - 使用 `signTransaction()` 方法

**签名顺序必须正确**：
- ✅ 正确: Mint 签名 → 用户签名
- ❌ 错误: 用户签名 → Mint 签名 (会导致交易失败)

Solana 的 `VersionedTransaction.sign()` 方法会正确处理部分签名，确保后续钱包签名能够成功添加。

## API 端点

### 方式对比

| 端点 | 方式 | 使用场景 | 安全性 | 推荐度 |
|------|------|---------|--------|--------|
| `/api/pumpfun/create-with-private-key` | 直接私钥 | 自动化、测试、后台任务 | ⚠️ 低 | ⚠️ 谨慎 |
| `/api/pumpfun/prepare` + `/api/pumpfun/submit` | 钱包签名 | 前端用户交互 | ✅ 高 | ✅ 推荐 |

### 1. 使用私钥直接创建代币（快速方式）

**POST** `/api/pumpfun/create-with-private-key`

直接使用钱包私钥创建代币，一步完成。适合自动化脚本和后台任务。

#### 请求体

```json
{
  "walletPrivateKey": "your-private-key-base58",
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
  "signature": "5J7Z...3x8K",
  "txUrl": "https://solscan.io/tx/5J7Z...3x8K",
  "mintAddress": "9vN2...7Qxm"
}
```

**警告**: 此方式需要将私钥发送到服务器，仅适合：
- ✅ 自动化脚本和机器人
- ✅ 后台任务和定时任务
- ✅ 测试和开发环境
- ✅ 专用账户或服务账户

**不适合**:
- ❌ 用户的主钱包
- ❌ 公网环境中的用户
- ❌ 生产环境的用户交互

### 2. 验证私钥格式

**POST** `/api/pumpfun/validate-private-key`

在提交前验证私钥格式是否有效。

#### 请求体

```json
{
  "privateKey": "your-private-key-base58"
}
```

#### 响应

```json
{
  "valid": true,
  "message": "私钥格式有效"
}
```

### 3. 准备创建代币交易

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

### 4. 提交已签名的交易

**POST** `/api/pumpfun/submit`

提交用户签名后的交易（钱包签名方式的第二步）。

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

### 私钥直接创建方式（自动化脚本）

#### Node.js 脚本示例

```typescript
import axios from 'axios';

async function createTokenWithPrivateKey() {
  const apiBaseUrl = 'http://localhost:7000';
  const jwtToken = 'your-jwt-token';

  // 步骤 1: 验证私钥格式（可选）
  const validateResponse = await axios.post(
    `${apiBaseUrl}/api/pumpfun/validate-private-key`,
    {
      privateKey: 'your-private-key-base58',
    },
    {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    }
  );

  if (!validateResponse.data.valid) {
    console.error('私钥格式无效');
    return;
  }

  // 步骤 2: 直接创建代币
  try {
    const createResponse = await axios.post(
      `${apiBaseUrl}/api/pumpfun/create-with-private-key`,
      {
        walletPrivateKey: 'your-private-key-base58',
        tokenMetadata: {
          name: 'My Automated Token',
          symbol: 'AUTO',
          description: '这是一个自动创建的代币',
          twitter: 'https://twitter.com/mytoken',
          telegram: 'https://t.me/mytoken',
        },
        imageUrl: 'https://example.com/token-logo.png',
        initialBuyAmount: 0.1,
        slippage: 10,
        priorityFee: 0.0005,
      },
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      }
    );

    if (createResponse.data.success) {
      console.log('✅ 代币创建成功!');
      console.log('交易链接:', createResponse.data.txUrl);
      console.log('Mint 地址:', createResponse.data.mintAddress);
      console.log('签名:', createResponse.data.signature);
    } else {
      console.error('❌ 代币创建失败:', createResponse.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

// 运行脚本
createTokenWithPrivateKey();
```

#### Python 脚本示例

```python
import requests
import json

API_BASE_URL = 'http://localhost:7000'
JWT_TOKEN = 'your-jwt-token'

def create_token_with_private_key():
    # 步骤 1: 验证私钥格式
    validate_response = requests.post(
        f'{API_BASE_URL}/api/pumpfun/validate-private-key',
        json={'privateKey': 'your-private-key-base58'},
        headers={'Authorization': f'Bearer {JWT_TOKEN}'}
    )

    if not validate_response.json()['valid']:
        print('❌ 私钥格式无效')
        return

    # 步骤 2: 创建代币
    create_response = requests.post(
        f'{API_BASE_URL}/api/pumpfun/create-with-private-key',
        json={
            'walletPrivateKey': 'your-private-key-base58',
            'tokenMetadata': {
                'name': 'My Python Token',
                'symbol': 'PYT',
                'description': '通过 Python 脚本创建的代币',
            },
            'imageUrl': 'https://example.com/token-logo.png',
            'initialBuyAmount': 0.1,
            'slippage': 10,
            'priorityFee': 0.0005,
        },
        headers={'Authorization': f'Bearer {JWT_TOKEN}'}
    )

    result = create_response.json()
    if result['success']:
        print('✅ 代币创建成功!')
        print(f"交易链接: {result['txUrl']}")
        print(f"Mint 地址: {result['mintAddress']}")
    else:
        print(f"❌ 代币创建失败: {result['error']}")

# 运行脚本
create_token_with_private_key()
```

### React + Phantom 钱包示例（钱包签名方式）

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

## 技术细节：VersionedTransaction 部分签名

### 后端签名实现（方案 B）

当前实现采用 Solana 的 `VersionedTransaction.sign()` 方法进行部分签名：

```typescript
// 服务器端代码
const tx = VersionedTransaction.deserialize(new Uint8Array(txData));

// 使用 mint keypair 进行部分签名
tx.sign([mintKeypair]); // 第一个签名

// 序列化包含部分签名的交易
const serializedTx = Buffer.from(tx.serialize()).toString('base64');
```

**关键点**:
- `tx.sign()` 会添加签名到交易的 signatures 数组
- 序列化后的交易包含 mint 的签名
- 前端钱包调用 `signTransaction()` 时会添加第二个签名
- 两个签名都会保留在最终交易中

### 钱包兼容性

此方案已在以下钱包测试通过：
- ✅ Phantom Wallet (v23.0+)
- ✅ Solflare (v1.0+)
- ✅ Backpack
- ✅ @solana/wallet-adapter (通用适配器)

**工作原理**:
1. 钱包的 `signTransaction()` 方法会检测到交易已有部分签名
2. 钱包会添加用户的签名而不是替换现有签名
3. 最终交易包含两个有效签名：mint 签名 + 用户签名

### 潜在问题和解决方案

#### 问题 1: 签名顺序错误

**症状**: 交易提交失败，错误信息包含 "signature verification failed"

**原因**: Solana 要求签名按照账户在交易中出现的顺序排列

**解决**: 当前实现确保 mint keypair 先签名（服务器端），用户钱包后签名（前端），符合 PumpPortal API 的要求

#### 问题 2: 钱包拒绝签名已部分签名的交易

**症状**: 钱包弹出错误或拒绝签名

**原因**: 某些旧版本钱包可能不支持部分签名的交易

**解决**: 建议用户更新钱包到最新版本，或使用 @solana/wallet-adapter

#### 问题 3: 序列化后签名丢失

**症状**: 提交交易时提示缺少签名

**原因**: 序列化/反序列化过程中签名丢失

**解决**: 使用 `VersionedTransaction.serialize()` 和 `VersionedTransaction.deserialize()` 确保签名保留

## FAQ

### Q: 为什么需要两个 API 调用？

A: 第一个调用准备交易并添加 mint 签名，第二个调用提交用户签名后的完整交易。这样可以让用户在本地钱包中签名，而不是将私钥发送到服务器。

### Q: mintPrivateKey 是什么？为什么要返回它？

A: 这是代币的 mint 账户私钥。虽然服务器已经用它签名了，但前端仍需要知道 mint 地址用于验证。注意：**不要长期保存此私钥**，仅在创建流程中使用。

### Q: 签名失败怎么办？

A: 检查以下几点：
1. ✅ 钱包是否连接并解锁
2. ✅ 网络是否正确（Mainnet/Devnet 匹配）
3. ✅ 余额是否足够（至少 0.1 SOL + 交易费用）
4. ✅ 交易是否已过期（Solana 交易有效期约 2 分钟）
5. ✅ 钱包版本是否为最新

### Q: 如何验证交易包含两个签名？

A: 在提交前检查交易签名数量：

```typescript
const tx = VersionedTransaction.deserialize(txBuffer);
console.log('签名数量:', tx.signatures.length); // 应该为 2

// 检查每个签名是否有效
tx.signatures.forEach((sig, i) => {
  const isValid = sig.every(byte => byte !== 0);
  console.log(`签名 ${i + 1} 有效:`, isValid);
});
```

### Q: 部分签名与完整签名的区别？

A:
- **部分签名**: 交易需要多个签名者，当前只完成了部分签名（如只有 mint 签名）
- **完整签名**: 所有必需的签名者都已签名，交易可以提交到链上
- PumpFun 创建需要 2 个签名：mint + 用户钱包

### Q: 私钥方式和钱包签名方式的区别？

A:
| 方面 | 私钥方式 | 钱包签名方式 |
|------|---------|-----------|
| 端点 | `/api/pumpfun/create-with-private-key` | `/api/pumpfun/prepare` + `/api/pumpfun/submit` |
| 步骤数 | 1 步 | 2 步 |
| 速度 | 快速 | 略慢（需用户交互） |
| 安全性 | ⚠️ 低（私钥上传到服务器） | ✅ 高（私钥在客户端） |
| 使用场景 | 自动化脚本、后台任务 | 用户界面交互 |
| 推荐度 | ⚠️ 谨慎使用 | ✅ 生产环境推荐 |

### Q: 何时应该使用私钥方式？

A: 仅在以下场景使用私钥方式：
- ✅ **自动化机器人**: 批量创建代币的自动化脚本
- ✅ **后台任务**: 定时创建代币的服务
- ✅ **测试环境**: 开发和测试阶段
- ✅ **服务账户**: 专用的系统账户（非用户账户）

### Q: 为什么不推荐在生产环境中使用私钥方式？

A: 主要风险包括：
1. **传输风险**: 私钥通过网络传输到服务器
2. **存储风险**: 服务器可能被攻击导致私钥泄露
3. **中间人攻击**: HTTP/HTTPS 配置不当可能导致私钥截获
4. **日志泄露**: 私钥可能被记录在日志中
5. **用户信任**: 用户需要信任服务器不会盗取私钥

**建议**: 对于用户面向的应用，始终使用钱包签名方式！

### Q: 如何安全地保存私钥？

A: 如果必须使用私钥方式：
1. **不要在代码中硬编码**: 使用环境变量
2. **使用加密**: 对私钥进行加密存储
3. **限制访问**: 使用 HTTPS、防火墙等
4. **审计日志**: 记录所有私钥使用
5. **定期轮换**: 定期更换私钥
6. **最小权限**: 使用专用账户，限制资金额度

## 总结

钱包签名流程提供了更高的安全性，同时保持了良好的用户体验。通过将私钥保留在用户的钱包中，我们遵循了 Web3 应用的最佳安全实践。

**推荐在生产环境中使用此方式！**
