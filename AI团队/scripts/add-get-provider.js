const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

const getRoute = `
registerRoute(['GET'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    json(res, { ok: true, provider: cfg.provider || 'deepseek', model: cfg.model || 'deepseek-chat', apiBase: cfg.apiBase || '' });
  } catch(e) {
    json(res, { ok: false, provider: 'deepseek', model: 'deepseek-chat' });
  }
});

`;

// Insert GET route before POST route
c = c.replace(
  "\nregisterRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {",
  getRoute + "\nregisterRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('GET provider endpoint added');
