/**
 * eCompany Provider 健康检查 & 连接测试
 * 自动检测所有已配置 AI 提供商的可达性
 */

const fs = require('fs');
const path = require('path');

const PROVIDERS_MODULE = path.join(__dirname, 'ai-engine.js');
const KEYS_FILE = path.join(__dirname, '..', 'provider-keys.json');
const CONFIG_FILE = path.join(__dirname, '..', 'ai-provider.json');

/**
 * 使用 key-vault 解密 enc: 前缀的密钥
 */
function decryptProviderKey(encryptedKey) {
  if (!encryptedKey || !encryptedKey.startsWith('enc:')) return encryptedKey;
  try {
    const { getMasterKey, decrypt } = require('./key-vault');
    const baseDir = path.join(__dirname, '..');
    const masterKey = getMasterKey(baseDir);
    return decrypt(encryptedKey, masterKey);
  } catch(e) {
    return null;
  }
}

function loadKeys() {
  var keys = {};
  try { keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8')); } catch(e) {}
  return keys;
}

function loadConfig() {
  var cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch(e) {}
  return cfg;
}

/**
 * 测试单个提供商的连接
 */
async function testProvider(providerName, providerCfg) {
  var keys = loadKeys();
  var cfg = loadConfig();
  
  // 优先级: 环境变量 > ai-provider.json 中的 apiKey > provider-keys.json（解密后）
  var apiKey = process.env[providerCfg.apiKeyEnv];
  if (!apiKey && cfg.apiKey && providerName === 'deepseek') {
    // 当前活跃提供商从 ai-provider.json 读取明文 key
    apiKey = cfg.apiKey;
  }
  if (!apiKey) {
    var rawKey = keys[providerName];
    if (rawKey && rawKey.startsWith('enc:')) {
      apiKey = decryptProviderKey(rawKey);
    } else {
      apiKey = rawKey;
    }
  }
  
  if (!apiKey) {
    return { provider: providerName, status: 'skip', reason: '未配置 API Key' };
  }

  var start = Date.now();
  try {
    var res = await fetch(providerCfg.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: providerCfg.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0
      }),
      signal: AbortSignal.timeout(15000)
    });
    
    var latency = Date.now() - start;
    var ok = res.ok;
    
    if (ok) {
      return { provider: providerName, status: 'ok', latency: latency + 'ms', model: providerCfg.defaultModel };
    } else {
      var text = '';
      try { text = (await res.text()).substring(0, 80); } catch(e) {}
      return { provider: providerName, status: 'error', code: res.status, message: text, latency: latency + 'ms' };
    }
  } catch(e) {
    return { provider: providerName, status: 'error', message: e.message.substring(0, 80) };
  }
}

/**
 * 测试所有配置的提供商
 */
async function testAll() {
  // Load PROVIDERS from ai-engine
  var PROVIDERS = {};
  try { PROVIDERS = require(PROVIDERS_MODULE).PROVIDERS; } catch(e) {
    return { error: '无法加载 PROVIDERS: ' + e.message };
  }
  
  var results = [];
  var cfg = loadConfig();
  var activeProvider = cfg.provider || process.env.AI_PROVIDER || 'deepseek';
  
  for (var name of Object.keys(PROVIDERS)) {
    var r = await testProvider(name, PROVIDERS[name]);
    r.isActive = (name === activeProvider);
    results.push(r);
  }
  
  var ok = results.filter(function(r) { return r.status === 'ok'; }).length;
  var fail = results.filter(function(r) { return r.status === 'error'; }).length;
  var skip = results.filter(function(r) { return r.status === 'skip'; }).length;
  
  return {
    total: results.length,
    ok: ok,
    failed: fail,
    skipped: skip,
    activeProvider: activeProvider,
    providers: results
  };
}

module.exports = { testAll: testAll, testProvider: testProvider };
