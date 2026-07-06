const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Fix: when provider/model changes, save to ai-provider.json and update process.env
const oldProviderRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: true, provider: body.provider });
});`;

const newProviderRoute = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (body.provider) cfg.provider = body.provider;
    if (body.model) cfg.model = body.model;
    if (body.apiBase) cfg.apiBase = body.apiBase;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    json(res, { ok: true, provider: body.provider, model: body.model });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});`;

c = c.replace(oldProviderRoute, newProviderRoute);
fs.writeFileSync(f, c, 'utf-8');
console.log('Provider save fixed');
