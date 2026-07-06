/**
 * credential-store.js - 凭证统一仓库
 * 
 * 唯一凭证数据源，所有模块统一从这里读取 API Key
 * 支持版本号自增、状态管理、审计追溯
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'credential-store.json');

// 默认结构
const DEFAULT_STORE = {
  version: 0,
  lastUpdated: null,
  credentials: {},
  history: []
};

// 读取仓库
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[credential-store] 读取失败，使用默认:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STORE));
}

// 写入仓库（原子写入）
function saveStore(store) {
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, STORE_FILE);
}

// 掩码 Key：只保留前后4位
function maskKey(key) {
  if (!key || key.length < 10) return key || '';
  return key.substring(0, 6) + '****' + key.substring(key.length - 4);
}

/**
 * 获取指定 provider 的激活凭证
 * @param {string} provider - 提供商名称（deepseek, openai 等）
 * @returns {string|null} API Key 或 null
 */
function getApiKey(provider) {
  const store = loadStore();
  const cred = store.credentials[provider];
  if (cred && cred.status === 'active' && cred.key) {
    return cred.key;
  }
  return null;
}

/**
 * 设置/更新凭证
 * @param {string} provider - 提供商名称
 * @param {string} key - API Key
 * @param {string} note - 备注（可选）
 * @param {string} ip - 操作来源 IP（审计用）
 * @returns {object} 操作结果
 */
function setApiKey(provider, key, note, ip) {
  const store = loadStore();
  const oldCred = store.credentials[provider];

  // 版本自增
  store.version = (store.version || 0) + 1;
  store.lastUpdated = new Date().toISOString();

  // 旧 Key 标记为 expired
  if (oldCred) {
    oldCred.status = 'expired';
    oldCred.expiredAt = store.lastUpdated;
  }

  // 写入新凭证
  store.credentials[provider] = {
    id: 'cred_' + provider + '_' + Date.now(),
    key: key,
    status: 'active',
    createdAt: store.lastUpdated,
    activatedAt: store.lastUpdated,
    note: note || '用户手动配置',
    version: store.version
  };

  // 审计记录
  store.history.push({
    action: oldCred ? 'update' : 'create',
    provider: provider,
    oldKeyMask: oldCred ? maskKey(oldCred.key) : null,
    newKeyMask: maskKey(key),
    timestamp: store.lastUpdated,
    ip: ip || 'unknown',
    version: store.version
  });

  // 限制历史记录最多 200 条
  if (store.history.length > 200) {
    store.history = store.history.slice(-200);
  }

  saveStore(store);
  // 同步到 process.env（让 CEO 和 server-modern 也能用）
  var envMap = { deepseek: 'DEEPSEEK_API_KEY', tongyi: 'TONGYI_API_KEY', hunyuan: 'HUNYUAN_API_KEY' };
  var envName = envMap[provider] || (provider.toUpperCase() + '_API_KEY');
  process.env[envName] = key;
  return { success: true, version: store.version, provider: provider };
}

/**
 * 获取所有凭证状态（不返回 Key 明文，只返回掩码）
 * @returns {object} provider → { active: bool, maskedKey: string, version: number }
 */
function getStatus() {
  const store = loadStore();
  const result = {};
  for (const provider in store.credentials) {
    const cred = store.credentials[provider];
    result[provider] = {
      active: cred.status === 'active',
      status: cred.status,
      maskedKey: maskKey(cred.key),
      version: cred.version || 0,
      updatedAt: cred.activatedAt || cred.createdAt
    };
  }
  return result;
}

/**
 * 获取审计历史
 * @param {number} limit - 返回条数
 * @returns {Array}
 */
function getHistory(limit) {
  const store = loadStore();
  const hist = store.history || [];
  return hist.slice(-(limit || 50)).reverse();
}

/**
 * 检查是否有配置变更（通过版本号）
 * @param {number} knownVersion - 调用方已知的版本号
 * @returns {boolean} 是否有更新
 */
function hasUpdate(knownVersion) {
  const store = loadStore();
  return (store.version || 0) > knownVersion;
}

module.exports = {
  getApiKey,
  setApiKey,
  getStatus,
  getHistory,
  hasUpdate,
  maskKey
};
