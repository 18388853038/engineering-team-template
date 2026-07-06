const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// The actual pattern in the file
c = c.replace(
  "AGENTS_MAP.ai_ceo.description + '\\n\\n'\n      + '## 你的身份'",
  "AGENTS_MAP.ai_ceo.description + '\\n\\n## 运行环境\\n- 你正在运行的模型: ' + (aiProv.model || 'deepseek') + '\\n- AI 提供商: ' + (aiProv.provider || 'deepseek') + '\\n\\n'\n      + '## 你的身份'"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Model info added');
