# 前端加密接入指南

## 📌 概述

后端 API 已启用**简化加密**，仅 **2 个接口** 的响应进行 AES-256-GCM 加密：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login/wallet` | POST | 🔐 钱包登录（加密） |
| `/api/user/me` | GET | 🔐 获取用户信息（加密） |
| 其他所有接口 | - | ❌ 普通 JSON 响应 |

---

## 🔧 前端实现（3 步）

### 第 1 步：复制解密工具

创建文件 `src/utils/encryption.ts`：

```typescript
/**
 * 简单解密工具
 */
const ENCRYPTION_CONFIG = {
  SECRET: 'coinfun-security-key-2024-v1',
  SALT: 'coinfun-salt',
  ITERATIONS: 100000,
  ALGORITHM: 'AES-GCM',
  DIGEST: 'SHA-256',
};

export async function deriveKey(secret = ENCRYPTION_CONFIG.SECRET): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const secretBuffer = encoder.encode(secret);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = encoder.encode(ENCRYPTION_CONFIG.SALT);
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ENCRYPTION_CONFIG.ITERATIONS,
      hash: ENCRYPTION_CONFIG.DIGEST
    },
    baseKey,
    { name: ENCRYPTION_CONFIG.ALGORITHM, length: 256 },
    false,
    ['decrypt']
  );

  return derivedKey;
}

export async function decryptData(
  encryptedPayload: {
    ciphertext: string;
    iv: string;
    authTag: string;
  },
  secret?: string
): Promise<any> {
  try {
    const key = await deriveKey(secret);

    // Base64 解码
    const ciphertext = Uint8Array.from(
      atob(encryptedPayload.ciphertext),
      c => c.charCodeAt(0)
    );
    const iv = Uint8Array.from(
      atob(encryptedPayload.iv),
      c => c.charCodeAt(0)
    );
    const authTag = Uint8Array.from(
      atob(encryptedPayload.authTag),
      c => c.charCodeAt(0)
    );

    // 合并密文和认证标签
    const encryptedWithTag = new Uint8Array(ciphertext.length + authTag.length);
    encryptedWithTag.set(ciphertext, 0);
    encryptedWithTag.set(authTag, ciphertext.length);

    // 解密
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_CONFIG.ALGORITHM,
        iv: iv
      },
      key,
      encryptedWithTag
    );

    // 转换为 JSON
    const decoder = new TextDecoder();
    const decryptedStr = decoder.decode(decrypted);
    return JSON.parse(decryptedStr);
  } catch (error: any) {
    console.error('[解密错误]', error.message);
    throw new Error(`解密失败: ${error.message}`);
  }
}

// 检查是否为加密响应
export function isEncryptedResponse(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    'ciphertext' in data &&
    'iv' in data &&
    'authTag' in data
  );
}
```

### 第 2 步：在 API 调用中使用

#### 方案 A：使用 Axios（推荐）

```typescript
// src/api/client.ts
import axios from 'axios';
import { decryptData, isEncryptedResponse } from '@/utils/encryption';

const api = axios.create({
  baseURL: 'http://localhost:7000',
});

// 响应拦截器：自动解密
api.interceptors.response.use(
  async (response) => {
    const data = response.data;

    // 检查是否需要解密
    if (isEncryptedResponse(data)) {
      try {
        response.data = await decryptData(data);
      } catch (error) {
        console.error('解密失败:', error);
      }
    }

    return response;
  },
  (error) => Promise.reject(error)
);

export default api;
```

#### 方案 B：使用原生 Fetch

```typescript
async function fetchAPI(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      ...options.headers,
    },
  });

  let data = await response.json();

  // 自动解密
  if (isEncryptedResponse(data)) {
    data = await decryptData(data);
  }

  return data;
}
```

### 第 3 步：在组件中使用

#### Vue 3 示例

```vue
<template>
  <div>
    <input v-model="walletAddress" placeholder="输入钱包地址" />
    <button @click="handleLogin">登录</button>
    <p v-if="user">欢迎 {{ user.username }}！</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import api from '@/api/client';

const walletAddress = ref('');
const user = ref(null);

async function handleLogin() {
  try {
    // 自动处理解密
    const response = await api.post('/api/auth/login/wallet', {
      walletAddress: walletAddress.value,
    });

    // ✨ response.data 已自动解密
    user.value = response.data.user;
    localStorage.setItem('token', response.data.token);
    console.log('登录成功！');
  } catch (error) {
    console.error('登录失败:', error);
  }
}
</script>
```

#### React 示例

```typescript
import { useState } from 'react';
import { decryptData, isEncryptedResponse } from '@/utils/encryption';

export function LoginPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [user, setUser] = useState(null);

  async function handleLogin() {
    try {
      const response = await fetch('http://localhost:7000/api/auth/login/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });

      let data = await response.json();

      // 自动解密
      if (isEncryptedResponse(data)) {
        data = await decryptData(data);
      }

      setUser(data.user);
      localStorage.setItem('token', data.token);
      console.log('登录成功！');
    } catch (error) {
      console.error('登录失败:', error);
    }
  }

  return (
    <div>
      <input
        value={walletAddress}
        onChange={(e) => setWalletAddress(e.target.value)}
        placeholder="输入钱包地址"
      />
      <button onClick={handleLogin}>登录</button>
      {user && <p>欢迎 {user.username}！</p>}
    </div>
  );
}
```

---

## 📝 使用流程

### 1. 钱包登录（加密响应）

```typescript
const response = await api.post('/api/auth/login/wallet', {
  walletAddress: '0x9326dc6b7ed83148997d0f7194e9fc50c468e10f',
});

// ✨ 自动解密！无需手动处理
const { user, token } = response.data;
localStorage.setItem('token', token);
```

### 2. 获取用户信息（加密响应）

```typescript
const response = await api.get('/api/user/me', {
  headers: { Authorization: `Bearer ${token}` },
});

// ✨ 自动解密！
const user = response.data;
console.log('用户信息:', user);
```

### 3. 其他接口（普通响应）

```typescript
// 获取主流币事件 - 普通 JSON 响应
const events = await api.get('/api/mainstream/events?limit=20');
console.log('事件列表:', events.data);

// 下注 - 普通 JSON 响应
const bet = await api.post('/api/mainstream/bets', {
  event_id: 1,
  bet_type: 'yes',
  bet_amount: 100,
});
console.log('下注结果:', bet.data);
```

---

## 🧪 测试解密

### 使用 curl 测试

```bash
# 钱包登录（获取加密响应）
curl -X POST http://localhost:7000/api/auth/login/wallet \
  -H 'Content-Type: application/json' \
  -d '{"walletAddress":"0x9326dc6b7ed83148997d0f7194e9fc50c468e10f"}'

# 响应格式：
# {
#   "ciphertext": "...",
#   "iv": "...",
#   "authTag": "..."
# }

# 获取用户信息（需要 token）
curl -X GET http://localhost:7000/api/user/me \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### 在浏览器控制台测试

```javascript
import { decryptData } from '@/utils/encryption';

// 假���已经获取到加密响应
const encryptedResponse = {
  ciphertext: "...",
  iv: "...",
  authTag: "..."
};

// 解密
const decrypted = await decryptData(encryptedResponse);
console.log('解密结果:', decrypted);
```

---

## ⚡ 快速检查表

- [ ] ✓ 复制了 `encryption.ts` 文件到 `src/utils/`
- [ ] ✓ 在 API 拦截器中添加了解密逻辑
- [ ] ✓ 配置参数与后端一致（SECRET、SALT、ITERATIONS）
- [ ] ✓ 测试了钱包登录接口
- [ ] ✓ 测试了获取用户信息接口
- [ ] ✓ 验证其他接口的普通响应正常

---

## ❓ 常见问题

### Q: 解密失败怎么办？

**检查**:
```typescript
// 确认密钥配置完全一致
const SECRET = 'coinfun-security-key-2024-v1';  // ✓ 必须相同
const SALT = 'coinfun-salt';                    // ✓ 必须相同
const ITERATIONS = 100000;                       // ✓ 必须相同
```

### Q: 如何检查响应是否加密？

```typescript
// 加密响应看起来这样：
{
  "ciphertext": "Uo1MCA0cE78F...",
  "iv": "A1pGTgIBCFYE...",
  "authTag": "EB9MXP4qDTCA..."
}

// 普通响应看起来这样：
{
  "id": 1,
  "username": "test",
  ...
}
```

### Q: 所有接口都需要处理解密吗？

**不需要**。只有这 2 个接口需要：
- `POST /api/auth/login/wallet`
- `GET /api/user/me`

其他所有接口都返回普通 JSON。

### Q: 能修改加密密钥吗？

**可以**，但需要：
1. 前后端密钥完全一致
2. 修改 `encryption.ts` 中的 `ENCRYPTION_CONFIG.SECRET`
3. 重新编译后端（修改 `src/plugins/encryption.ts`）

---

## 📞 需要帮助？

查看详细技术文档：[FRONTEND_DECRYPTION_GUIDE.md](./FRONTEND_DECRYPTION_GUIDE.md)

---

**版本**: 1.0  
**最后更新**: 2025-10-22  
**加密方案**: AES-256-GCM + PBKDF2  
**加密接口**: 2 个（login/wallet、user/me）
