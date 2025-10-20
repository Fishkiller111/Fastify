# PumpFun 代币创建 API 文档

## 概述

此 API 提供了通过 PumpPortal.fun 创建 PumpFun 代币的功能。它集成了 Solana Web3.js 和 PumpPortal API，支持完整的代币创建流程。

## 环境配置

### 1. 安装依赖

依赖包已自动安装：
- `@solana/web3.js`: Solana 区块链交互
- `bs58`: Base58 编码/解码

### 2. 环境变量

在 `.env` 文件中添加以下配置：

```bash
# Solana RPC 配置
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

**RPC 端点选择**：
- **Mainnet**: `https://api.mainnet-beta.solana.com` (生产环境)
- **Devnet**: `https://api.devnet.solana.com` (测试环境)
- **自定义 RPC**: 使用 Alchemy, QuickNode 等服务商的 RPC 端点以获得更好的性能

## API 端点

### 1. 创建代币

**POST** `/api/pumpfun/create`

创建一个新的 PumpFun 代币并在 Solana 区块链上部署。

#### 请求头
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### 请求体

```json
{
  "walletPrivateKey": "your-wallet-private-key-in-base58",
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

#### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `walletPrivateKey` | string | 是 | 钱包私钥（Base58 编码） |
| `tokenMetadata.name` | string | 是 | 代币名称 |
| `tokenMetadata.symbol` | string | 是 | 代币符号 |
| `tokenMetadata.description` | string | 是 | 代币描述 |
| `tokenMetadata.twitter` | string | 否 | Twitter 链接 |
| `tokenMetadata.telegram` | string | 否 | Telegram 链接 |
| `tokenMetadata.website` | string | 否 | 网站链接 |
| `tokenMetadata.showName` | boolean | 否 | 是否显示名称（默认: true） |
| `imageUrl` | string | 否 | 代币图片 URL |
| `initialBuyAmount` | number | 是 | 初始购买金额（SOL），最小值 0.001 |
| `slippage` | number | 否 | 滑点容忍度（%），默认 10 |
| `priorityFee` | number | 否 | 优先费用（SOL），默认 0.0005 |

#### 成功响应

```json
{
  "success": true,
  "signature": "5J7Z...3x8K",
  "txUrl": "https://solscan.io/tx/5J7Z...3x8K",
  "mintAddress": "9vN2...7Qxm"
}
```

#### 错误响应

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "无效的钱包私钥格式"
}
```

### 2. 验证私钥

**POST** `/api/pumpfun/validate-key`

验证 Solana 钱包私钥的格式是否正确。

#### 请求头
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### 请求体

```json
{
  "privateKey": "your-wallet-private-key-in-base58"
}
```

#### 成功响应

```json
{
  "valid": true,
  "message": "私钥格式有效"
}
```

## 使用流程

### 1. 准备钱包

获取 Solana 钱包的私钥（Base58 格式）。可以使用 Phantom、Solflare 等钱包导出私钥。

### 2. 准备代币元数据

- 代币名称、符号和描述
- 代币图片（可选）
- 社交媒体链接（可选）

### 3. 调用创建接口

```bash
curl -X POST http://localhost:7000/api/pumpfun/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletPrivateKey": "YOUR_PRIVATE_KEY",
    "tokenMetadata": {
      "name": "Test Token",
      "symbol": "TEST",
      "description": "This is a test token"
    },
    "initialBuyAmount": 0.1,
    "slippage": 10,
    "priorityFee": 0.0005
  }'
```

### 4. 等待确认

- API 会自动等待交易确认
- 返回交易签名和 Solscan 链接
- 可以通过 Solscan 查看交易详情

## 技术实现

### 工作流程

1. **验证私钥**: 使用 bs58 解码并验证私钥格式
2. **生成 Mint 地址**: 随机生成代币的 mint keypair
3. **上传元数据**: 将代币信息上传到 IPFS（通过 pump.fun API）
4. **创建交易**: 调用 PumpPortal API 生成交易
5. **签名交易**: 使用 mint keypair 和钱包 keypair 签名
6. **发送交易**: 通过 Solana RPC 发送到区块链
7. **等待确认**: 确认交易已被区块链接受

### 关键代码位置

- **服务层**: `src/modules/pumpfun/service.ts`
- **路由层**: `src/modules/pumpfun/routes.ts`
- **类型定义**: `src/modules/pumpfun/types.ts`
- **配置**: `src/config/index.ts`

### 外部 API

- **IPFS 上传**: `https://pump.fun/api/ipfs`
- **交易创建**: `https://pumpportal.fun/api/trade-local`
- **区块链交互**: Solana RPC Endpoint

## 安全注意事项

1. **私钥保护**:
   - 永远不要在前端存储私钥
   - 使用 HTTPS 传输私钥
   - 考虑使用钱包签名而非直接传递私钥

2. **费用管理**:
   - 确保钱包有足够的 SOL 支付交易费用
   - initialBuyAmount + priorityFee + 网络费用

3. **错误处理**:
   - 处理网络错误和超时
   - 验证所有输入参数
   - 记录错误日志以便调试

4. **速率限制**:
   - 注意 RPC 端点的速率限制
   - 考虑使用付费 RPC 服务以获得更高限额

## 常见问题

### Q1: 如何获取钱包私钥？

A: 大多数 Solana 钱包都支持导出私钥。注意私钥是 Base58 编码的字符串，长度通常为 88 个字符。

### Q2: 最小购买金额是多少？

A: 最小初始购买金额为 0.001 SOL。

### Q3: 交易失败怎么办？

A: 检查以下几点：
- 钱包余额是否足够
- RPC 端点是否可用
- 网络是否稳定
- 滑点设置是否合理

### Q4: 如何使用测试网？

A: 将 `SOLANA_RPC_ENDPOINT` 设置为 `https://api.devnet.solana.com` 并使用 Devnet 钱包。

## 示例代码

### JavaScript/TypeScript

```typescript
import axios from 'axios';

async function createPumpFunToken() {
  const response = await axios.post(
    'http://localhost:7000/api/pumpfun/create',
    {
      walletPrivateKey: 'YOUR_PRIVATE_KEY',
      tokenMetadata: {
        name: 'My Awesome Token',
        symbol: 'MAT',
        description: 'The best token ever created!',
        twitter: 'https://twitter.com/mytoken',
        website: 'https://mytoken.com',
      },
      imageUrl: 'https://example.com/logo.png',
      initialBuyAmount: 0.1,
      slippage: 10,
      priorityFee: 0.0005,
    },
    {
      headers: {
        Authorization: `Bearer ${YOUR_JWT_TOKEN}`,
      },
    }
  );

  console.log('Token created:', response.data);
  console.log('Transaction URL:', response.data.txUrl);
  console.log('Mint Address:', response.data.mintAddress);
}
```

### Python

```python
import requests

def create_pumpfun_token():
    url = "http://localhost:7000/api/pumpfun/create"
    headers = {
        "Authorization": f"Bearer {YOUR_JWT_TOKEN}",
        "Content-Type": "application/json"
    }
    data = {
        "walletPrivateKey": "YOUR_PRIVATE_KEY",
        "tokenMetadata": {
            "name": "My Awesome Token",
            "symbol": "MAT",
            "description": "The best token ever created!",
            "twitter": "https://twitter.com/mytoken",
            "website": "https://mytoken.com"
        },
        "imageUrl": "https://example.com/logo.png",
        "initialBuyAmount": 0.1,
        "slippage": 10,
        "priorityFee": 0.0005
    }

    response = requests.post(url, json=data, headers=headers)
    result = response.json()

    print(f"Token created: {result}")
    print(f"Transaction URL: {result.get('txUrl')}")
    print(f"Mint Address: {result.get('mintAddress')}")
```

## 更新日志

### Version 1.0.0 (2025-01-20)
- ✅ 初始版本发布
- ✅ 支持代币创建
- ✅ 支持 IPFS 元数据上传
- ✅ 支持私钥验证
- ✅ 集成 Solana Web3.js
- ✅ 集成 PumpPortal API

## 支持

如有问题或需要帮助，请查看：
- [Swagger 文档](http://localhost:7000/docs)
- [Solana 文档](https://docs.solana.com/)
- [PumpPortal 文档](https://pumpportal.fun/docs)
