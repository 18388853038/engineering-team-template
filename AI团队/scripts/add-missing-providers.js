const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the switch(prov) block and add missing providers
const oldSwitch = "case 'gemini': p.apiBase = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; if(!cfg.model) p.model='gemini-2.5-flash'; break;";

const newSwitch = "case 'gemini': p.apiBase = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; if(!cfg.model) p.model='gemini-2.5-flash'; break;\n        case 'moonshot': p.apiBase = 'https://api.moonshot.cn/v1/chat/completions'; if(!cfg.model) p.model='moonshot-v1-8k'; break;\n        case 'tongyi': p.apiBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'; if(!cfg.model) p.model='qwen-max'; break;\n        case 'zhipu': p.apiBase = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'; if(!cfg.model) p.model='glm-4'; break;\n        case 'siliconflow': p.apiBase = 'https://api.siliconflow.cn/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;";

if (c.includes(oldSwitch)) {
  c = c.replace(oldSwitch, newSwitch);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Added missing providers to switch statement');
} else {
  console.log('Pattern not found');
}
