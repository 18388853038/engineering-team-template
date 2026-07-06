const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Update the apikey save endpoint to store keys per-provider
const oldKeyRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/apikey$/, async (req, res) => {
  const body = await parseBody(req);
  if (body.key && body.key.length > 10) {
    try {
      // 写入 ai-provider.json
      const cfgPath = path.join(BASE, 'ai-provider.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      cfg.apiKey = body.key;
      if (body.provider) cfg.provider = body.provider;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
      // 立即生效
      process.env.DEEPSEEK_API_KEY = body.key;
      json(res, { ok: true, message: 'API Key 已保存并生效' });
    } catch(e) {
      json(res, { ok: false, error: e.message });
    }
  } else {
    json(res, { ok: false, error: 'Key 无效' });
  }
});`;

const newKeyRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/apikey$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body.key || body.key.length < 10) {
    json(res, { ok: false, error: 'Key 无效' });
    return;
  }
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    // 如果是当前服务商，直接更新
    if (!body.provider || body.provider === cfg.provider) {
      cfg.apiKey = body.key;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
      process.env.DEEPSEEK_API_KEY = body.key;
      json(res, { ok: true, message: 'API Key 已保存并生效' });
    } else {
      // 非当前服务商，保存到 keys 映射
      const keysPath = path.join(BASE, 'provider-keys.json');
      let keys = {};
      try { keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8')); } catch(e) {}
      keys[body.provider] = body.key;
      fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2), 'utf-8');
      json(res, { ok: true, message: body.provider + ' 的 API Key 已保存' });
    }
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});`;

c = c.replace(oldKeyRoute, newKeyRoute);

// Also update getAIProvider to try loading from ai-provider.json first, then provider-keys.json
const oldGetAIProvider = `function getAIProvider() {
  var p = { provider: 'deepseek', apiKey: '', apiBase: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' };
  if (process.env.DEEPSEEK_API_KEY) {
    p.apiKey = process.env.DEEPSEEK_API_KEY;
    return p;
  }
  try {
    var cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));`;

const newGetAIProvider = `function getAIProvider() {
  var p = { provider: 'deepseek', apiKey: '', apiBase: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' };
  try {
    var cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));`;

c = c.replace(oldGetAIProvider, newGetAIProvider);

// Also update the part that sets process.env from ai-provider.json
const oldEnvSet = `// 检查 env 是否有 provider 对应的 key
  const providerCfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));`; // This might not match

// Instead, update the fallback section of getAIProvider where it reads from the file
// Look for where it sets p.apiKey from cfg.apiKey and add provider-keys.json fallback
c = c.replace(
  "if (cfg.apiKey) p.apiKey = cfg.apiKey;",
  "if (cfg.apiKey) p.apiKey = cfg.apiKey;\n    // 尝试从 provider-keys.json 加载非当前服务商的 Key\n    try {\n      var allKeys = JSON.parse(fs.readFileSync(path.join(BASE, 'provider-keys.json'), 'utf-8'));\n      if (allKeys[p.provider] && (!cfg.apiKey || cfg.provider !== p.provider)) {\n        p.apiKey = allKeys[p.provider];\n      }\n    } catch(e) {}"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Updated multi-provider key storage');
