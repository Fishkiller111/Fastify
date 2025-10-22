# 后端API数据加密实现指南

## 概述

本文档详细说明如何在后端实现API响应数据加密，与前端的AES-256-GCM加密机制相对应。所有API响应必须使用统一的加密格式，防止前端F12控制台的数据泄露。

## 📋 快速开始

### 加密算法规范

| 参数 | 值 | 说明 |
|------|-----|------|
| **算法** | AES-256-GCM | NIST推荐的认证加密 |
| **密钥长度** | 256位 (32字节) | 从密钥派生函数得到 |
| **IV长度** | 96位 (12字节) | 随机生成,每次不同 |
| **认证标签** | 128位 (16字节) | GCM自动计算 |
| **密钥派生** | PBKDF2-SHA256 | 100,000次迭代 |
| **盐值** | `coinfun-salt` | 固定值 |
| **编码** | Base64 | ciphertext, iv, authTag都使用Base64 |

### 密钥配置

```
原始密钥: coinfun-security-key-2024-v1

派生过程:
  原始密钥 + "coinfun-salt"
    ↓
  PBKDF2-SHA256 (100,000次迭代)
    ↓
  256位派生密钥 (32字节)
```

## 🔧 实现示例

### Node.js (Express.js)

#### 1. 安装依赖

```bash
npm install crypto
```

#### 2. 创建加密工具 (utils/encryption.js)

```javascript
const crypto = require('crypto');

// 加密配置
const ENCRYPTION_CONFIG = {
  SECRET: 'coinfun-security-key-2024-v1',
  SALT: 'coinfun-salt',
  ITERATIONS: 100000,
  ALGORITHM: 'aes-256-gcm',
  DIGEST: 'sha256'
};

/**
 * 派生加密密钥
 */
function deriveKey(secret = ENCRYPTION_CONFIG.SECRET) {
  const salt = Buffer.from(ENCRYPTION_CONFIG.SALT);
  const key = crypto.pbkdf2Sync(
    secret,
    salt,
    ENCRYPTION_CONFIG.ITERATIONS,
    32,  // 256位 = 32字节
    ENCRYPTION_CONFIG.DIGEST
  );
  return key;
}

/**
 * 加密数据
 */
function encryptData(data, secret) {
  try {
    // 序列化数据
    const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
    
    // 派生密钥
    const key = deriveKey(secret);
    
    // 生成随机IV
    const iv = crypto.randomBytes(12);
    
    // 创建加密器
    const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    
    // 加密
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    // 获取认证标签
    const authTag = cipher.getAuthTag();
    
    // 返回Base64编码的结果
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('[Encryption Error]', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * 解密数据 (用于测试和调试)
 */
function decryptData(encryptedPayload, secret) {
  try {
    const key = deriveKey(secret);
    const ciphertext = Buffer.from(encryptedPayload.ciphertext, 'base64');
    const iv = Buffer.from(encryptedPayload.iv, 'base64');
    const authTag = Buffer.from(encryptedPayload.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error('[Decryption Error]', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

module.exports = {
  encryptData,
  decryptData,
  deriveKey,
  ENCRYPTION_CONFIG
};
```

#### 3. 创建加密中间件 (middleware/encryptResponse.js)

```javascript
const { encryptData } = require('../utils/encryption');

/**
 * 加密响应中间件
 * 自动加密所有JSON响应
 */
function encryptResponseMiddleware(req, res, next) {
  // 保存原始的json方法
  const originalJson = res.json;
  
  // 重写json方法
  res.json = function(data) {
    try {
      // 检查是否应该加密
      const shouldEncrypt = process.env.NODE_ENV === 'production';
      
      if (!shouldEncrypt) {
        // 开发环境不加密
        return originalJson.call(this, data);
      }
      
      // 加密数据
      const encryptedData = encryptData(data);
      
      // 设置Content-Type
      this.set('Content-Type', 'application/json');
      
      // 返回加密数据
      return originalJson.call(this, encryptedData);
    } catch (error) {
      console.error('[Response Encryption Error]', error);
      // 出错时返回原始数据
      return originalJson.call(this, data);
    }
  };
  
  next();
}

module.exports = encryptResponseMiddleware;
```

#### 4. 在应用中使用 (app.js 或 server.js)

```javascript
const express = require('express');
const encryptResponseMiddleware = require('./middleware/encryptResponse');

const app = express();

// 应用加密中间件
app.use(encryptResponseMiddleware);

// 你的路由
app.post('/api/auth/login/wallet', (req, res) => {
  const { walletAddress } = req.body;
  
  // 查询数据库...
  const user = {
    id: 1,
    username: walletAddress,
    email: `${walletAddress}@wallet.local`,
    wallet_address: walletAddress,
    balance: '1000.00',
    created_at: new Date(),
    updated_at: new Date()
  };
  
  const token = 'jwt-token-here';
  
  // 自动加密响应
  res.json({
    user,
    token
  });
});

app.listen(8000, () => {
  console.log('Server running on http://45.192.107.22:8000');
});
```

### Python (Flask/Django)

#### 1. 安装依赖

```bash
pip install cryptography
```

#### 2. 加密工具 (utils/encryption.py)

```python
import json
import os
from base64 import b64encode, b64decode
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class EncryptionConfig:
    SECRET = 'coinfun-security-key-2024-v1'
    SALT = b'coinfun-salt'
    ITERATIONS = 100000
    KEY_LENGTH = 32  # 256位

class EncryptionUtil:
    @staticmethod
    def derive_key(secret=EncryptionConfig.SECRET):
        """派生加密密钥"""
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=EncryptionConfig.KEY_LENGTH,
            salt=EncryptionConfig.SALT,
            iterations=EncryptionConfig.ITERATIONS,
            backend=default_backend()
        )
        key = kdf.derive(secret.encode('utf-8'))
        return key
    
    @staticmethod
    def encrypt_data(data, secret=None):
        """加密数据"""
        try:
            if secret is None:
                secret = EncryptionConfig.SECRET
            
            # 序列化数据
            plaintext = json.dumps(data).encode('utf-8')
            
            # 派生密钥
            key = EncryptionUtil.derive_key(secret)
            
            # 生成随机IV
            iv = os.urandom(12)
            
            # 加密
            cipher = AESGCM(key)
            ciphertext = cipher.encrypt(iv, plaintext, None)
            
            # 分离密文和认证标签
            encrypted_data = ciphertext[:-16]  # 密文
            auth_tag = ciphertext[-16:]  # 最后16字节是认证标签
            
            return {
                'ciphertext': b64encode(encrypted_data).decode('utf-8'),
                'iv': b64encode(iv).decode('utf-8'),
                'authTag': b64encode(auth_tag).decode('utf-8')
            }
        except Exception as e:
            raise Exception(f'Encryption failed: {str(e)}')
    
    @staticmethod
    def decrypt_data(encrypted_payload, secret=None):
        """解密数据 (用于测试)"""
        try:
            if secret is None:
                secret = EncryptionConfig.SECRET
            
            # 解码Base64
            ciphertext = b64decode(encrypted_payload['ciphertext'])
            iv = b64decode(encrypted_payload['iv'])
            auth_tag = b64decode(encrypted_payload['authTag'])
            
            # 派生密钥
            key = EncryptionUtil.derive_key(secret)
            
            # 解密
            cipher = AESGCM(key)
            plaintext = cipher.decrypt(iv, ciphertext + auth_tag, None)
            
            return json.loads(plaintext.decode('utf-8'))
        except Exception as e:
            raise Exception(f'Decryption failed: {str(e)}')
```

#### 3. Flask中使用

```python
from flask import Flask, jsonify, request
from utils.encryption import EncryptionUtil
import os

app = Flask(__name__)

@app.before_request
def before_request():
    """准备响应加密"""
    pass

@app.after_request
def after_request(response):
    """加密JSON响应"""
    if response.content_type and 'application/json' in response.content_type:
        if os.getenv('FLASK_ENV') == 'production':
            try:
                data = response.get_json()
                encrypted = EncryptionUtil.encrypt_data(data)
                response.set_data(jsonify(encrypted).get_data())
            except Exception as e:
                print(f'[Response Encryption Error] {e}')
    return response

@app.route('/api/auth/login/wallet', methods=['POST'])
def login_wallet():
    wallet_address = request.json.get('walletAddress')
    
    # 查询数据库...
    user = {
        'id': 1,
        'username': wallet_address,
        'email': f'{wallet_address}@wallet.local',
        'wallet_address': wallet_address,
        'balance': '1000.00',
        'created_at': '2025-10-02T07:41:08.290Z',
        'updated_at': '2025-10-22T13:21:29.839Z'
    }
    
    token = 'jwt-token-here'
    
    # 自动加密响应
    return jsonify({
        'user': user,
        'token': token
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

#### 4. Django中使用

```python
# middleware/encryption.py
import json
from utils.encryption import EncryptionUtil
from django.http import JsonResponse
import os

class EncryptionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        response = self.get_response(request)
        
        # 检查是否需要加密
        if (response.get('Content-Type', '').startswith('application/json') and
            os.getenv('DJANGO_ENV') == 'production'):
            try:
                data = json.loads(response.content)
                encrypted = EncryptionUtil.encrypt_data(data)
                response.content = json.dumps(encrypted)
            except Exception as e:
                print(f'[Response Encryption Error] {e}')
        
        return response

# views.py
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import json

@require_http_methods(["POST"])
def login_wallet(request):
    data = json.loads(request.body)
    wallet_address = data.get('walletAddress')
    
    user = {
        'id': 1,
        'username': wallet_address,
        'email': f'{wallet_address}@wallet.local',
        'wallet_address': wallet_address,
        'balance': '1000.00',
        'created_at': '2025-10-02T07:41:08.290Z',
        'updated_at': '2025-10-22T13:21:29.839Z'
    }
    
    token = 'jwt-token-here'
    
    return JsonResponse({
        'user': user,
        'token': token
    })

# settings.py
MIDDLEWARE = [
    # ...
    'middleware.encryption.EncryptionMiddleware',
]
```

### Go (Gin)

#### 1. 加密工具 (utils/encryption.go)

```go
package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"golang.org/x/crypto/pbkdf2"
	"io"
)

type EncryptionConfig struct {
	Secret     string
	Salt       string
	Iterations int
	KeyLength  int
}

var Config = &EncryptionConfig{
	Secret:     "coinfun-security-key-2024-v1",
	Salt:       "coinfun-salt",
	Iterations: 100000,
	KeyLength:  32, // 256位
}

// 派生密钥
func DeriveKey(secret string) []byte {
	salt := []byte(Config.Salt)
	key := pbkdf2.Key([]byte(secret), salt, Config.Iterations, Config.KeyLength, sha256.New)
	return key
}

// 加密数据
func EncryptData(data interface{}) (map[string]string, error) {
	// 序列化
	plaintext, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshaling error: %w", err)
	}

	// 派生密钥
	key := DeriveKey(Config.Secret)

	// 创建密码块
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cipher creation error: %w", err)
	}

	// 创建GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("GCM creation error: %w", err)
	}

	// 生成随机IV
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("nonce generation error: %w", err)
	}

	// 加密
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// 分离密文和认证标签
	encrypted := ciphertext[:len(ciphertext)-16]
	authTag := ciphertext[len(ciphertext)-16:]

	return map[string]string{
		"ciphertext": base64.StdEncoding.EncodeToString(encrypted),
		"iv":         base64.StdEncoding.EncodeToString(nonce),
		"authTag":    base64.StdEncoding.EncodeToString(authTag),
	}, nil
}

// 解密数据 (用于测试)
func DecryptData(encrypted map[string]string) (interface{}, error) {
	// 解码
	ciphertext, err := base64.StdEncoding.DecodeString(encrypted["ciphertext"])
	if err != nil {
		return nil, fmt.Errorf("ciphertext decode error: %w", err)
	}

	iv, err := base64.StdEncoding.DecodeString(encrypted["iv"])
	if err != nil {
		return nil, fmt.Errorf("iv decode error: %w", err)
	}

	authTag, err := base64.StdEncoding.DecodeString(encrypted["authTag"])
	if err != nil {
		return nil, fmt.Errorf("authTag decode error: %w", err)
	}

	// 派生密钥
	key := DeriveKey(Config.Secret)

	// 创建密码块
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cipher creation error: %w", err)
	}

	// 创建GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("GCM creation error: %w", err)
	}

	// 合并密文和认证标签
	encryptedData := append(ciphertext, authTag...)

	// 解密
	plaintext, err := gcm.Open(nil, iv, encryptedData, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption error: %w", err)
	}

	var result interface{}
	if err := json.Unmarshal(plaintext, &result); err != nil {
		return nil, fmt.Errorf("unmarshal error: %w", err)
	}

	return result, nil
}
```

#### 2. Gin中间件和路由

```go
// middleware/encryption.go
package middleware

import (
	"github.com/gin-gonic/gin"
	"yourapp/utils"
	"os"
)

func EncryptResponse() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if os.Getenv("GIN_MODE") == "release" {
			// 只在生产环境加密
			if c.ContentType() == "application/json" {
				// 获取响应数据
				if data, exists := c.Get("gin.json_response"); exists {
					encrypted, err := utils.EncryptData(data)
					if err != nil {
						c.JSON(200, data) // 加密失败返回原始数据
						return
					}
					c.JSON(200, encrypted)
				}
			}
		}
	}
}

// handlers/auth.go
package handlers

import (
	"github.com/gin-gonic/gin"
	"yourapp/utils"
	"net/http"
)

func LoginWallet(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"walletAddress"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	user := gin.H{
		"id":              1,
		"username":        req.WalletAddress,
		"email":           req.WalletAddress + "@wallet.local",
		"wallet_address":  req.WalletAddress,
		"balance":         "1000.00",
		"created_at":      "2025-10-02T07:41:08.290Z",
		"updated_at":      "2025-10-22T13:21:29.839Z",
	}

	token := "jwt-token-here"

	response := gin.H{
		"user":  user,
		"token": token,
	}

	// 自动加密
	encrypted, err := utils.EncryptData(response)
	if err != nil {
		c.JSON(http.StatusInternalServerError, response)
		return
	}

	c.JSON(http.StatusOK, encrypted)
}
```

## 📋 API端点清单

以下所有API端点的响应都必须加密:

### 认证相关
- [x] `POST /api/auth/login/wallet` - 钱包登录
  - **参数**: `{ walletAddress: string }`
  - **响应**: `{ user: {...}, token: string }`

### 主流币种事件
- [x] `GET /api/mainstream/events` - 事件列表
  - **参数**: `?limit=20&offset=0`
  - **响应**: `MainstreamEvent[]`

- [x] `GET /api/mainstream/events/{id}` - 事件详情
  - **参数**: `id: number`
  - **响应**: `MainstreamEvent`

- [x] `POST /api/mainstream/bets` - 下注操作
  - **参数**: `{ event_id: number, bet_type: 'yes'|'no', bet_amount: number }`
  - **响应**: `{ success: boolean, transaction_hash?: string }`

### Meme事件
- [x] `GET /api/meme/events` - 事件列表
  - **参数**: `?limit=20&offset=0`
  - **响应**: `MemeEvent[]`

- [x] `GET /api/meme/events/{id}` - 事件详情
  - **参数**: `id: number`
  - **响应**: `MemeEvent`

- [x] `POST /api/meme/bets` - 下注操作
  - **参数**: `{ event_id: number, bet_type: 'yes'|'no', bet_amount: number }`
  - **响应**: `{ success: boolean, transaction_hash?: string }`

### 用户数据
- [x] `GET /api/kline/events/{id}/buy-records` - 下注记录
  - **参数**: `id: number`
  - **响应**: `BetRecord[]`

## 🔍 测试验证

### 1. 使用curl测试加密响应

```bash
# 测试登录接口
curl -X POST http://45.192.107.22:8000/api/auth/login/wallet \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x123..."}' \
  | jq '.'
```

**期望响应**:
```json
{
  "ciphertext": "abcd1234...",
  "iv": "xyz789...",
  "authTag": "def456..."
}
```

### 2. 使用前端验证

```bash
# 启用加密
echo "VITE_ENCRYPTION_ENABLED=true" > .env.production

# 生产构建
npm run build

# 预览
npm run preview

# 在浏览器F12中查看Network标签
# 应该看到加密的JSON响应
```

### 3. 单元测试示例 (Node.js)

```javascript
const { encryptData, decryptData } = require('./utils/encryption');

describe('Encryption Tests', () => {
  test('should encrypt and decrypt data correctly', () => {
    const testData = {
      user: { id: 1, name: 'Test' },
      token: 'test-token'
    };
    
    // 加密
    const encrypted = encryptData(testData);
    
    // 验证格式
    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');
    
    // 解密
    const decrypted = decryptData(encrypted);
    
    // 验证数据
    expect(decrypted).toEqual(testData);
  });
  
  test('should fail on tampered data', () => {
    const testData = { test: 'data' };
    const encrypted = encryptData(testData);
    
    // 篡改数据
    encrypted.ciphertext = 'invalid-base64';
    
    // 应该抛出错误
    expect(() => decryptData(encrypted)).toThrow();
  });
});
```

## 🔐 安全考虑

### 密钥管理
1. **不要硬编码密钥**
   ```bash
   # ❌ 错误
   SECRET = 'hardcoded-key'
   
   # ✅ 正确
   SECRET = process.env.ENCRYPTION_SECRET
   ```

2. **使用环境变量**
   ```bash
   export ENCRYPTION_SECRET="coinfun-security-key-2024-v1"
   ```

3. **定期轮换密钥**
   - 每3个月更换一次
   - 支持密钥版本管理

### 生产部署
1. **HTTPS必须**
   - 所有API调用使用HTTPS
   - 防止中间人攻击

2. **监控和日志**
   ```javascript
   // 记录加密失败
   try {
     const encrypted = encryptData(data);
   } catch (error) {
     logger.error('Encryption failed', {
       error: error.message,
       timestamp: new Date(),
       endpoint: req.path
     });
   }
   ```

3. **速率限制**
   - 防止暴力破解
   - 限制每个IP的请求频率

## 📊 性能指标

| 操作 | 耗时 | 备注 |
|------|------|------|
| 加密 (1KB数据) | ~2-5ms | 取决于服务器性能 |
| 解密 (1KB数据) | ~2-5ms | 取决于服务器性能 |
| 密钥派生 | ~100-200ms | 首次调用时,之后可以缓存 |
| 传输增加 | +33% | Base64编码的开销 |

### 优化建议
1. **密钥缓存**
   ```javascript
   let cachedKey = null;
   
   function getKey() {
     if (cachedKey) return cachedKey;
     cachedKey = deriveKey();
     return cachedKey;
   }
   ```

2. **异步加密**
   ```javascript
   app.post('/api/...', async (req, res) => {
     // 异步加密,不阻塞主线程
     const encrypted = await encryptAsync(data);
     res.json(encrypted);
   });
   ```

## ❓ 常见问题

### Q: 为什么前端解密失败?
**A**: 检查以下几点:
1. 密钥是否一致 (`coinfun-security-key-2024-v1`)
2. 盐值是否一致 (`coinfun-salt`)
3. PBKDF2迭代次数是否一致 (100,000)
4. 返回格式是否正确 (`{ciphertext, iv, authTag}` - Base64编码)

### Q: 生产环境应该加密吗?
**A**: 是的,一定要加密。F12控制台可以看到所有网络请求,加密可以防止敏感数据泄露。

### Q: 加密会影响性能吗?
**A**: 轻微影响 (~2-5ms),但数据安全更重要。可以通过缓存密钥来优化。

### Q: 支持密钥轮换吗?
**A**: 支持。在响应中添加密钥版本号:
```json
{
  "version": 1,
  "ciphertext": "...",
  "iv": "...",
  "authTag": "..."
}
```

### Q: 如何处理向后兼容?
**A**: 支持新旧密钥并存:
```javascript
function deriveKey(secret, version = 1) {
  // 支持多个版本的密钥
  const keys = {
    1: 'coinfun-security-key-2024-v1',
    2: 'coinfun-security-key-2024-v2'
  };
  return pbkdf2(keys[version], ...);
}
```

## 📝 实现检查清单

- [ ] 安装正确的密码库
- [ ] 实现PBKDF2密钥派生
- [ ] 实现AES-256-GCM加密
- [ ] 返回格式: `{ciphertext, iv, authTag}` (Base64编码)
- [ ] 所有API端点都已加密
- [ ] 开发环境可以禁用加密
- [ ] 生产环境必须启用加密
- [ ] 添加错误处理和日志
- [ ] 添加单元测试
- [ ] 验证前端能正常解密
- [ ] HTTPS部署
- [ ] 监控加密失败

## 🚀 集成步骤

1. **复制加密工具代码**到你的项目
2. **创建加密中间件/装饰器**
3. **应用到所有API端点**
4. **测试加密和解密**
5. **验证前端能正常工作**
6. **部署到生产环境**

---

**最后更新**: 2024-10-22
**版本**: 1.0.0
**作者**: 前端团队
**所需反馈**: 加密是否正常工作,性能是否满足要求
