const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Add model info to CEO system prompt
// Find the line with agent description and add model info after it
c = c.replace(
  "AGENTS_MAP.ai_ceo.description + '\\n\\n' + '## 你的身份'",
  "AGENTS_MAP.ai_ceo.description + '\\n\\n## 运行环境\\n- **模型**: ' + (aiProv.model || 'deepseek') + '\\n- **提供商**: ' + (aiProv.provider || 'deepseek') + '\\n- **API**: ' + (aiProv.apiBase || '') + '\\n\\n' + '## 你的身份'"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Added model info to CEO prompt');
