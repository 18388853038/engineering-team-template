const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

const oldText = "agent.name_cn + '，担任 ' + agent.title + '。' + (agent.description || '') + '\\n\\n## 你的团队";
const newText = "agent.name_cn + '，担任 ' + agent.title + '。' + (agent.description || '') + '\\n\\n## 运行环境\\n- 你正在使用 ' + (aiProv.model || 'deepseek') + ' 模型。\\n\\n## 你的团队";

if (c.includes(oldText)) {
  c = c.replace(oldText, newText);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Updated employee prompt');
} else {
  console.log('Still not found');
}
