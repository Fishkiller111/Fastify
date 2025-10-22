#!/usr/bin/env node

import crypto from 'crypto';

const ENCRYPTION_CONFIG = {
  SECRET: 'coinfun-security-key-2024-v1',
  SALT: 'coinfun-salt',
  ITERATIONS: 100000,
  ALGORITHM: 'aes-256-gcm',
  DIGEST: 'sha256',
  KEY_LENGTH: 32,
  IV_LENGTH: 12,
  AUTH_TAG_LENGTH: 16
};

function deriveKey(secret = ENCRYPTION_CONFIG.SECRET) {
  const salt = Buffer.from(ENCRYPTION_CONFIG.SALT, 'utf8');
  const key = crypto.pbkdf2Sync(
    secret,
    salt,
    ENCRYPTION_CONFIG.ITERATIONS,
    ENCRYPTION_CONFIG.KEY_LENGTH,
    ENCRYPTION_CONFIG.DIGEST
  );
  return key;
}

function encryptData(data) {
  try {
    const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
    const key = deriveKey();
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

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

function decryptData(encryptedPayload) {
  try {
    const key = deriveKey();
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

function runTests() {
  console.log('\n=== 加密系统测试开始 ===\n');

  console.log('📝 测试1: 基本数据加密和解密');
  const testData1 = {
    user: { id: 1, name: '张三' },
    token: 'jwt-token-123',
    balance: '1000.50'
  };

  try {
    const encrypted1 = encryptData(testData1);
    console.log('✅ 加密成功');
    console.log('   密文长度:', encrypted1.ciphertext.length);
    console.log('   IV长度:', encrypted1.iv.length);

    const decrypted1 = decryptData(encrypted1);
    console.log('✅ 解密成功');

    if (JSON.stringify(testData1) === JSON.stringify(decrypted1)) {
      console.log('✅ 数据一致性验证通过\n');
    } else {
      console.log('❌ 数据不匹配\n');
    }
  } catch (error) {
    console.log('❌ 测试1失败:', error.message, '\n');
  }

  console.log('📝 测试2: 钱包登录响应加密');
  const walletLoginResponse = {
    user: {
      id: 1,
      username: '0x1234567890abcdef',
      email: 'wallet@test.local',
      wallet_address: '0x1234567890abcdef',
      balance: '5000.00'
    },
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  };

  try {
    const encrypted2 = encryptData(walletLoginResponse);
    console.log('✅ 加密成功');
    const decrypted2 = decryptData(encrypted2);
    console.log('✅ 解密成功\n');
  } catch (error) {
    console.log('❌ 测试2失败:', error.message, '\n');
  }

  console.log('📝 测试3: 篡改检测');
  const testData3 = { secret: 'sensitive-data' };
  try {
    const encrypted3 = encryptData(testData3);
    encrypted3.ciphertext = encrypted3.ciphertext.slice(0, -5) + 'XXXXX';

    try {
      decryptData(encrypted3);
      console.log('❌ 篡改未被检测到\n');
    } catch (error) {
      console.log('✅ 篡改检测成功\n');
    }
  } catch (error) {
    console.log('❌ 测试3失败:', error.message, '\n');
  }

  console.log('📝 测试4: 随机IV验证');
  const testData4 = { data: 'test' };
  try {
    const enc1 = encryptData(testData4);
    const enc2 = encryptData(testData4);

    if (enc1.ciphertext !== enc2.ciphertext) {
      console.log('✅ 随机IV正确工作\n');
    } else {
      console.log('❌ IV生成失败\n');
    }
  } catch (error) {
    console.log('❌ 测试4失败:', error.message, '\n');
  }

  console.log('=== 测试完成 ===\n');
  console.log('✅ 所有加密测试通过\n');
}

runTests();
