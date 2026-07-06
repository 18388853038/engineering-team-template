const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Replace the stub POST provider route with actual implementation
const oldStub = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: true, provider: body.provider });
});`;

const newImpl = `registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (body.provider) cfg.provider = body.provider;
    if (body.model) cfg.model = body.model;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('[config] 已更新 AI 提供商: ' + cfg.provider + ', 模型: ' + cfg.model);
    json(res, { ok: true, provider: cfg.provider, model: cfg.model });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});`;

if (c.includes(oldStub)) {
  c = c.replace(oldStub, newImpl);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('POST provider route fixed - now actually writes to file');
} else {
  console.log('Pattern not found, checking...');
}
