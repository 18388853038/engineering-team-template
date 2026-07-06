const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the non-CEO chat system prompt - the specific line we need
const oldText = "'你是 ' + agent.name_cn + '，担任 ' + agent.title + '。' + (agent.description || '') + '\\n\\n' +";
const newText = "'你是 ' + agent.name_cn + '，担任 ' + agent.title + '。' + (agent.description || '') + '\\n\\n## 运行环境\\n- 你正在使用 ' + (aiProv.model || 'deepseek') + ' 模型。\\n\\n' +";

if (c.includes(oldText)) {
  c = c.replace(oldText, newText);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Updated employee prompt');
} else {
  console.log('Text not found');
  const idx = c.indexOf("agent.name_cn + '，担任 '");
  if (idx >= 0) console.log('Found nearby:', c.substring(idx, idx + 200));
}
