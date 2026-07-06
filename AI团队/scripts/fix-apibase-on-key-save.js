const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Fix: when saving API key, also clear apiBase so getAIProvider() auto-detects
const oldSave = "cfg.apiKey = body.key;\n      if (body.provider) cfg.provider = body.provider;\n      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');\n      // 立即生效\n      process.env.DEEPSEEK_API_KEY = body.key;";

const newSave = "cfg.apiKey = body.key;\n      if (body.provider) { cfg.provider = body.provider; cfg.apiBase = ''; }\n      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');\n      process.env['DEEPSEEK_API_KEY'] = body.key;";

if (c.includes(oldSave)) {
  c = c.replace(oldSave, newSave);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed: apiBase cleared when saving key with provider change');
} else {
  console.log('Pattern not found');
}
