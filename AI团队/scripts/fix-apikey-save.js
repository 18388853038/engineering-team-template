const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the existing apikey route and replace it
const oldRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/apikey$/, async (req, res) => {
  json(res, { ok: true, message: 'API Key 已保存' });
});`;

const newRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/apikey$/, async (req, res) => {
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

if (c.includes(oldRoute)) {
  c = c.replace(oldRoute, newRoute);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed: API key now writes to ai-provider.json and env');
} else {
  console.log('Pattern not found, checking file content...');
  const idx = c.indexOf('settings/apikey');
  if (idx >= 0) console.log('Found at:', c.substring(idx - 50, idx + 100));
}
