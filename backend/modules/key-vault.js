/**
 * key-vault.js - API密钥加密存储模块
 * 使用 AES-256-GCM 加密 provider-keys.json 和 ai-provider.json 中的 API Key
 * 
 * 加密值以 "enc:" 前缀标识，与明文值兼容
 * 主密钥来源（优先级）：ECOMPANY_MASTER_KEY 环境变量 > .master-key 文件 > 首次运行自动生成
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // GCM推荐12字节
const TAG_LENGTH = 16;      // GCM认证标签16字节
const ENC_PREFIX = 'enc:';  // 加密值前缀

// 获取或生成主密钥
function getMasterKey(baseDir) {
  // 1. 环境变量优先
  if (process.env.ECOMPANY_MASTER_KEY) {
    const key = Buffer.from(process.env.ECOMPANY_MASTER_KEY, 'hex');
    if (key.length === 32) return key;
    console.warn('[key-vault] ECOMPANY_MASTER_KEY 环境变量长度不正确(需64位hex)，忽略');
  }

  // 2. 从 .master-key 文件读取
  const keyFile = path.join(baseDir, '.master-key');
  if (fs.existsSync(keyFile)) {
    try {
      const key = Buffer.from(fs.readFileSync(keyFile, 'utf-8').trim(), 'hex');
      if (key.length === 32) return key;
    } catch (e) {
      console.warn('[key-vault] 读取 .master-key 失败:', e.message);
    }
  }

  // 3. 自动生成并保存
  const newKey = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, newKey.toString('hex'), { mode: 0o600 });
  console.log('[key-vault] 已生成新主密钥:', keyFile);
  return newKey;
}

// 加密单个值
function encrypt(value, masterKey) {
  if (!value || value.startsWith(ENC_PREFIX)) return value; // 空值或已加密
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 格式: enc:hex(iv+tag+ciphertext)
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('hex');
}

// 解密单个值
function decrypt(value, masterKey) {
  if (!value || !value.startsWith(ENC_PREFIX)) return value; // 非加密值原样返回
  try {
    const data = Buffer.from(value.slice(ENC_PREFIX.length), 'hex');
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf-8');
  } catch (e) {
    console.error('[key-vault] 解密失败:', e.message);
    return ''; // 解密失败返回空，不要暴露原始数据
  }
}

// 加密整个 apiKey 字段（用于写入文件前）
function encryptApiKeys(obj, fields, masterKey) {
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] && typeof result[f] === 'string' && !result[f].startsWith(ENC_PREFIX)) {
      result[f] = encrypt(result[f], masterKey);
    }
  }
  return result;
}

// 解密整个 apiKey 字段（用于读取文件后）
function decryptApiKeys(obj, fields, masterKey) {
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] && typeof result[f] === 'string' && result[f].startsWith(ENC_PREFIX)) {
      result[f] = decrypt(result[f], masterKey);
    }
  }
  return result;
}

module.exports = {
  getMasterKey,
  encrypt,
  decrypt,
  encryptApiKeys,
  decryptApiKeys,
  ENC_PREFIX,
  API_KEY_FIELDS: ['apiKey'] // ai-provider.json 中的加密字段
};
