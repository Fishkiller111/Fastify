# PumpFun 私钥创建接口文档

## 概述

本文档介绍如何通过**填写私钥直接创建 PumpFun 代币**。这是相对于钱包签名方式的一个快速替代方案。

## ⚠️ 重要警告

**此方式需要用户将私钥发送到服务器**，存在安全风险。仅适合以下场景：

- ✅ 自动化脚本和机器人
- ✅ 后台任务和定时任务
- ✅ 测试和开发环境
- ✅ 专用服务账户

**不适合**：
- ❌ 用户的主钱包
- ❌ 生产环境的用户交互
- ❌ 公网环境中接收用户私钥

## API 端点

### 1. 验证私钥格式

**POST** `/api/pumpfun/validate-private-key`

在提交私钥前验证格式是否有效。

```bash
curl -X POST http://localhost:7000/api/pumpfun/validate-private-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "privateKey": "your-private-key-base58"
  }'
```

**响应**:
```json
{
  "valid": true,
  "message": "私钥格式有效"
}
```

### 2. 直接创建代币

**POST** `/api/pumpfun/create-with-private-key`

一步创建 PumpFun 代币。

```bash
curl -X POST http://localhost:7000/api/pumpfun/create-with-private-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "walletPrivateKey": "your-private-key-base58",
    "tokenMetadata": {
      "name": "My Token",
      "symbol": "MTK",
      "description": "Token description",
      "twitter": "https://twitter.com/mytoken",
      "telegram": "https://t.me/mytoken",
      "website": "https://mytoken.com",
      "showName": true
    },
    "imageUrl": "https://example.com/logo.png",
    "initialBuyAmount": 0.1,
    "slippage": 10,
    "priorityFee": 0.0005
  }'
```

**响应**:
```json
{
  "success": true,
  "signature": "5J7Z...3x8K",
  "txUrl": "https://solscan.io/tx/5J7Z...3x8K",
  "mintAddress": "9vN2...7Qxm"
}
```

## 请求参数

### walletPrivateKey (必需)
- **类型**: string
- **格式**: Base58 编码的 Solana 私钥
- **示例**: `"3jZGpk..."`

### tokenMetadata (必需)
代币的元数据对象。

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| name | string | ✅ | 代币名称（1-100 字符） |
| symbol | string | ✅ | 代币符号（1-20 字符） |
| description | string | ✅ | 代币描述（1-500 字符） |
| twitter | string | ❌ | Twitter 链接 |
| telegram | string | ❌ | Telegram 链接 |
| website | string | ❌ | 官方网站 |
| showName | boolean | ❌ | 是否显示代币名称（默认: true） |

### imageUrl (可选)
- **类型**: string
- **说明**: 代币图标的 URL
- **限制**: 必须是有效的 HTTP/HTTPS URL

### initialBuyAmount (必需)
- **类型**: number
- **说明**: 创建时的初始购买金额
- **单位**: SOL
- **最小值**: 0.001

### slippage (可选)
- **类型**: number
- **说明**: 滑点容忍度
- **单位**: 百分比 (%)
- **范围**: 0-100
- **默认值**: 10

### priorityFee (可选)
- **类型**: number
- **说明**: 优先费用
- **单位**: SOL
- **最小值**: 0
- **默认值**: 0.0005

## 工作流程

```
┌─────────────────────┐
│   客户端            │
└──────────┬──────────┘
           │
           │ 1. 验证私钥格式
           ▼
┌─────────────────────┐
│ /validate-private-key
└──────────┬──────────┘
           │ valid: true
           │
           │ 2. 创建代币
           ▼
┌─────────────────────────────┐
│ /create-with-private-key    │
└──────────┬──────────────────┘
           │
           │ 3. 后端处理
           ▼
┌─────────────────────┐
│   后端 API          │
│ - 解析私钥          │
│ - 生成 Mint         │
│ - 上传元数据到 IPFS │
│ - 创建交易          │
│ - 签名交易          │
│ - 发送交易到链      │
└──────────┬──────────┘
           │
           │ 4. 返回结果
           ▼
┌─────────────────────┐
│   响应给客户端      │
│ - 签名              │
│ - 交易 URL          │
│ - Mint 地址         │
└─────────────────────┘
```

## 使用示例

### Node.js 脚本

```typescript
import axios from 'axios';

const API_URL = 'http://localhost:7000';
const JWT_TOKEN = 'your-jwt-token';
const PRIVATE_KEY = 'your-private-key-base58';

async function createToken() {
  try {
    // 步骤 1: 验证私钥
    console.log('验证私钥...');
    const validateRes = await axios.post(
      `${API_URL}/api/pumpfun/validate-private-key`,
      { privateKey: PRIVATE_KEY },
      { headers: { Authorization: `Bearer ${JWT_TOKEN}` } }
    );

    if (!validateRes.data.valid) {
      console.error('❌ 私钥无效');
      return;
    }
    console.log('✅ 私钥有效');

    // 步骤 2: 创建代币
    console.log('创建代币...');
    const createRes = await axios.post(
      `${API_URL}/api/pumpfun/create-with-private-key`,
      {
        walletPrivateKey: PRIVATE_KEY,
        tokenMetadata: {
          name: 'Test Token',
          symbol: 'TEST',
          description: 'A test token created via API',
        },
        initialBuyAmount: 0.1,
      },
      { headers: { Authorization: `Bearer ${JWT_TOKEN}` } }
    );

    if (createRes.data.success) {
      console.log('✅ 代币创建成功!');
      console.log('签名:', createRes.data.signature);
      console.log('交易链接:', createRes.data.txUrl);
      console.log('Mint 地址:', createRes.data.mintAddress);
    } else {
      console.error('❌ 创建失败:', createRes.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

createToken();
```

### Python 脚本

```python
import requests

API_URL = 'http://localhost:7000'
JWT_TOKEN = 'your-jwt-token'
PRIVATE_KEY = 'your-private-key-base58'

def create_token():
    headers = {'Authorization': f'Bearer {JWT_TOKEN}'}

    # 步骤 1: 验证私钥
    print('验证私钥...')
    validate_res = requests.post(
        f'{API_URL}/api/pumpfun/validate-private-key',
        json={'privateKey': PRIVATE_KEY},
        headers=headers
    )

    if not validate_res.json()['valid']:
        print('❌ 私钥无效')
        return

    print('✅ 私钥有效')

    # 步骤 2: 创建代币
    print('创建代币...')
    create_res = requests.post(
        f'{API_URL}/api/pumpfun/create-with-private-key',
        json={
            'walletPrivateKey': PRIVATE_KEY,
            'tokenMetadata': {
                'name': 'Test Token',
                'symbol': 'TEST',
                'description': 'A test token created via API',
            },
            'initialBuyAmount': 0.1,
        },
        headers=headers
    )

    result = create_res.json()
    if result['success']:
        print('✅ 代币创建成功!')
        print(f"签名: {result['signature']}")
        print(f"交易链接: {result['txUrl']}")
        print(f"Mint 地址: {result['mintAddress']}")
    else:
        print(f"❌ 创建失败: {result['error']}")

create_token()
```

## 错误处理

### 私钥格式错误

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "无效的钱包私钥格式"
}
```

### 金额不足

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "初始购买金额必须至少为 0.001 SOL"
}
```

### 创建失败

```json
{
  "statusCode": 400,
  "error": "Token Creation Failed",
  "message": "创建交易失败: 400 Bad Request"
}
```

## 与钱包签名方式的对比

| 功能 | 私钥方式 | 钱包签名方式 |
|------|---------|-----------|
| **端点** | 1 个端点 | 2 个端点 |
| **步骤** | 1 步完成 | 2 步流程 |
| **速度** | ⚡ 快速 | 🔄 需用户确认 |
| **安全性** | ⚠️ 低 | ✅ 高 |
| **私钥管理** | 服务器保管 | 客户端保管 |
| **用户体验** | 🤖 自动化 | 👤 需交互 |
| **推荐用途** | 后台脚本 | 用户界面 |
| **生产环境** | ❌ 不推荐 | ✅ 推荐 |

## 安全最佳实践

### 1. 使用环境变量

不要在代码中硬编码私钥：

```bash
# .env
PUMPFUN_PRIVATE_KEY=your-private-key-base58
```

```javascript
const privateKey = process.env.PUMPFUN_PRIVATE_KEY;
```

### 2. 加密私钥存储

如果需要存储私钥，使用加密：

```typescript
import crypto from 'crypto';

const secretKey = process.env.ENCRYPTION_KEY;
const encrypted = crypto
  .createCipher('aes-256-cbc', secretKey)
  .update(privateKey, 'utf8', 'hex');
```

### 3. HTTPS 传输

确保只通过 HTTPS 发送请求：

```javascript
// ✅ 正确
const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

// ❌ 错误
const url = `http://api.example.com`; // HTTP 不安全
```

### 4. 审计日志

记录所有私钥使用：

```typescript
console.log(`[${new Date().toISOString()}] 使用私钥创建代币: ${mintAddress}`);
```

### 5. 最小权限原则

为脚本使用专用的低权限账户：

```bash
# 创建专用账户
solana-keygen new --outfile service-account.json

# 转入少量 SOL（仅用于创建）
solana transfer <service-account-address> 0.5
```

## 常见问题

### Q: 如何获取私钥？

A: 使用以下方式获取私钥：
1. **Phantom 钱包**: 设置 → 钱包 → 导出私钥
2. **Solana CLI**: `solana config get` 查看密钥路径
3. **key.json 文件**: 从 `~/.config/solana/id.json` 获取

### Q: 私钥有没有过期时间？

A: 没有。Solana 私钥永久有效，直到被导入其他钱包或更改。

### Q: 能否取消已发送的交易？

A: 不能。Solana 交易一旦在链上确认就无法撤销。

### Q: 脚本运行一直卡在"等待交易确认"怎么办？

A: 可能原因：
1. RPC 节点缓慢 → 更换 RPC 端点
2. 网络拥堵 → 提高 priorityFee
3. 交易失败 → 查看错误日志

### Q: 可以并行创建多个代币吗？

A: 可以，但要注意速率限制和 RPC 限制。建议使用队列机制控制并发数。

## 总结

私钥直接创建方式提供了快速便捷的代币创建流程，适合自动化场景。但由于安全风险，**强烈建议在用户交互的生产环境中使用钱包签名方式**。

---

**相关文档**:
- [钱包签名方式](./PUMPFUN_WALLET_SIGNATURE.md)
- [API 文档](./swagger)
