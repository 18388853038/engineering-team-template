const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

const oldHealth = "registerRoute(['GET'], /^\\/api\\/health$/, async (req, res) => {\n  json(res, { ok: true, uptime: process.uptime(), version: 'v3.1', time: new Date().toISOString() });\n});";

const newHealth = `registerRoute(['GET'], /^\\/api\\/health$/, async (req, res) => {
  const mem = process.memoryUsage();
  const dbOk = fs.existsSync(path.join(BASE, 'ecompany.db'));
  const agentsOk = fs.existsSync(path.join(BASE, 'agents.json'));
  const stats = global.__apiStats || { total:0 };
  json(res, {
    ok: true, status: 'healthy', version: 'v3.1',
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString(),
    memory: Math.round(mem.rss / 1024 / 1024) + 'MB',
    node: process.version,
    checks: {
      database: dbOk ? 'ok' : 'missing',
      agents: agentsOk ? 'ok' : 'missing',
    },
    api: { total: stats.total }
  });
});`;

if (c.includes(oldHealth)) {
  c = c.replace(oldHealth, newHealth);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Health endpoint enhanced');
} else {
  console.log('Pattern not found');
}
