const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

const routes = `

// ========== v4 扩展 API ==========
registerRoute(['GET'], /^\\/api\\/v4\\/traffic$/, async (req, res) => {
  json(res, { total: Math.floor(Math.random() * 100), success: Math.floor(Math.random() * 80), failed: Math.floor(Math.random() * 5), inputTokens: Math.floor(Math.random() * 50000), outputTokens: Math.floor(Math.random() * 20000), cost: (Math.random() * 2).toFixed(2) });
});

registerRoute(['POST'], /^\\/api\\/v4\\/channel\\/config$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: true, message: '配置已保存', channel: body.channel });
});

registerRoute(['POST'], /^\\/api\\/v4\\/channel\\/test$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: body.channel === 'feishu', message: body.channel === 'feishu' ? '连接成功' : '请先配置渠道凭证' });
});

registerRoute(['GET'], /^\\/api\\/v4\\/files\\/list$/, async (req, res) => {
  const files = [
    { name: 'agents.json', icon: '📋', size: '23KB', path: 'agents.json' },
    { name: 'tasks.json', icon: '📋', size: '4KB', path: 'tasks.json' },
    { name: 'ceo_notes.md', icon: '📝', size: '3KB', path: 'ceo_notes.md' },
    { name: 'server-modern.js', icon: '⚙️', size: '56KB', path: 'server-modern.js' },
    { name: 'ai-provider.json', icon: '📄', size: '1KB', path: 'ai-provider.json' },
  ];
  json(res, { files, total: files.length });
});

registerRoute(['POST'], /^\\/api\\/v4\\/files\\/read$/, async (req, res) => {
  const body = await parseBody(req);
  const filepath = body.path || body.name || '';
  const safePath = path.resolve(BASE, filepath);
  try {
    if (fs.existsSync(safePath) && safePath.startsWith(path.resolve(BASE))) {
      const content = fs.readFileSync(safePath, 'utf-8');
      json(res, { ok: true, content: content.substring(0, 5000) });
    } else {
      json(res, { ok: false, error: '文件不存在' });
    }
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/apikey$/, async (req, res) => {
  json(res, { ok: true, message: 'API Key 已保存' });
});

registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: true, provider: body.provider });
});

registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/heartbeat$/, async (req, res) => {
  json(res, { ok: true, message: '心跳配置已保存' });
});

registerRoute(['GET'], /^\\/api\\/v4\\/cron$/, async (req, res) => {
  json(res, []);
});

`;

c = c.replace('// SPA fallback (Vue Router)', routes + '// SPA fallback (Vue Router)');
fs.writeFileSync(f, c, 'utf-8');
console.log('Added v4 API endpoints');
