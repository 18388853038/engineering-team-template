const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Add model info after description in CEO prompt
c = c.replace(
  "AGENTS_MAP.ai_ceo.description + '\\n\\n' +",
  "AGENTS_MAP.ai_ceo.description + '\\n\\n## 运行环境\\n- 你正在运行的模型: ' + (aiProv.model || 'deepseek') + '\\n- AI 提供商: ' + (aiProv.provider || 'deepseek') + '\\n\\n' +"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Model info added to CEO prompt');
