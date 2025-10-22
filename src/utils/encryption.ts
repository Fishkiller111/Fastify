import crypto from 'crypto';

// 加密配置
const ENCRYPTION_CONFIG = {
  SECRET: process.env.ENCRYPTION_SECRET || 'coinfun-security-key-2024-v1',
  SALT: 'coinfun-salt',
  ITERATIONS: 100000,
  ALGORITHM: 'aes-256-gcm' as const,
  DIGEST: 'sha256' as const,
  KEY_LENGTH: 32,
  IV_LENGTH: 12,
  AUTH_TAG_LENGTH: 16
};

// 导出类型
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * 派生加密密钥
 */
export function deriveKey(secret: string = ENCRYPTION_CONFIG.SECRET): Buffer {
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

/**
 * 加密数据
 */
export function encryptData(data: any, secret?: string): EncryptedData {
  try {
    const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
    const key = deriveKey(secret);
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);

    const authTag = (cipher as any).getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error: any) {
    console.error('[Encryption Error]', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * 解密数据
 */
export function decryptData(encryptedPayload: EncryptedData, secret?: string): any {
  try {
    const key = deriveKey(secret);
    const ciphertext = Buffer.from(encryptedPayload.ciphertext, 'base64');
    const iv = Buffer.from(encryptedPayload.iv, 'base64');
    const authTag = Buffer.from(encryptedPayload.authTag, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    (decipher as any).setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch (error: any) {
    console.error('[Decryption Error]', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

export default {
  encryptData,
  decryptData,
  deriveKey,
  ENCRYPTION_CONFIG
};
