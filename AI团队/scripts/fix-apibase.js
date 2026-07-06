const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Fix: clear apiBase when provider changes so getAIProvider() auto-detects correct URL
const oldCode = "if (body.provider) cfg.provider = body.provider;\n    if (body.model) cfg.model = body.model;\n    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');\n    console.log('[config] 更新 AI 提供商: ' + cfg.provider + ', 模型: ' + cfg.model);";

const newCode = "if (body.provider) { cfg.provider = body.provider; cfg.apiBase = ''; }\n    if (body.model) cfg.model = body.model;\n    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');\n    console.log('[config] 更新 AI 提供商: ' + cfg.provider + ', 模型: ' + cfg.model);";

if (c.includes(oldCode)) {
  c = c.replace(oldCode, newCode);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed: apiBase cleared on provider change');
} else {
  // Fallback: try a shorter match
  const idx = c.indexOf("if (body.provider) cfg.provider = body.provider;");
  if (idx >= 0) {
    console.log('Found at', idx);
    console.log('Context:', c.substring(idx, idx + 250));
  } else {
    console.log('Pattern not found');
  }
}
