const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Fix: always try provider-keys.json as override for non-current-provider keys
const oldLogic = "if (cfg.apiKey) p.apiKey = cfg.apiKey;\n    // 尝试从 provider-keys.json 加载非当前服务商的 Key\n    try {\n      var allKeys = JSON.parse(fs.readFileSync(path.join(BASE, 'provider-keys.json'), 'utf-8'));\n      if (allKeys[p.provider] && (!cfg.apiKey || cfg.provider !== p.provider)) {\n        p.apiKey = allKeys[p.provider];\n      }\n    } catch(e) {}";

const newLogic = "if (cfg.apiKey) p.apiKey = cfg.apiKey;\n    // 优先从 provider-keys.json 加载当前服务商的专有 Key（覆盖全局 Key）\n    try {\n      var allKeys = JSON.parse(fs.readFileSync(path.join(BASE, 'provider-keys.json'), 'utf-8'));\n      if (allKeys[p.provider]) {\n        p.apiKey = allKeys[p.provider];\n      }\n    } catch(e) {}";

if (c.includes(oldLogic)) {
  c = c.replace(oldLogic, newLogic);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed key fallback logic');
} else {
  console.log('Pattern not found');
  // Find what's actually around there
  const idx = c.indexOf("provider-keys.json");
  if (idx > 0) {
    console.log('Found at', idx, ':', c.substring(idx-5, idx+200));
  }
}
