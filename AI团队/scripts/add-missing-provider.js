const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the end of settings/apikey route and insert settings/provider after it
const apikeyEnd = c.indexOf("json(res, { ok: false, error: 'Key 无效' });", c.indexOf('settings/apikey'));
if (apikeyEnd > 0) {
  const afterApikey = apikeyEnd + 80; // go past the line
  // Find the next route registration or section
  const nextRoute = c.indexOf("\nregisterRoute", afterApikey);
  
  const providerRoute = `

registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (body.provider) cfg.provider = body.provider;
    if (body.model) cfg.model = body.model;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('[config] 更新 AI 提供商: ' + cfg.provider + ', 模型: ' + cfg.model);
    json(res, { ok: true, provider: cfg.provider, model: cfg.model });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['GET'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    json(res, { ok: true, provider: cfg.provider || 'deepseek', model: cfg.model || 'deepseek-chat', apiBase: cfg.apiBase || '' });
  } catch(e) {
    json(res, { ok: false, provider: 'deepseek', model: 'deepseek-chat' });
  }
});

`;
  c = c.substring(0, nextRoute) + providerRoute + c.substring(nextRoute);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Added POST and GET provider routes');
} else {
  console.log('apikey endpoint not found');
}
