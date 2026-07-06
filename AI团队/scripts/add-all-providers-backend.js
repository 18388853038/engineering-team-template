const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Remove duplicate siliconflow case, add all missing providers
const oldSwitchEnd = "case 'siliconflow': p.apiBase = 'https://api.siliconflow.cn/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;\n        case 'siliconflow': p.apiBase = 'https://api.siliconflow.cn/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;\n        default: p.apiBase = 'https://api.deepseek.com/v1/chat/completions'; p.model='deepseek-chat'; break;";

const newSwitchEnd = "case 'siliconflow': p.apiBase = 'https://api.siliconflow.cn/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;\n        case 'baichuan': p.apiBase = 'https://api.baichuan-ai.com/v1/chat/completions'; if(!cfg.model) p.model='baichuan-4'; break;\n        case 'minimax': p.apiBase = 'https://api.minimaxi.com/v1/text/chatcompletion'; if(!cfg.model) p.model='minimax-text-01'; break;\n        case 'doubao': p.apiBase = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'; if(!cfg.model) p.model='doubao-pro-32k'; break;\n        case 'step': p.apiBase = 'https://api.stepfun.com/v1/chat/completions'; if(!cfg.model) p.model='step-2-16k'; break;\n        default: p.apiBase = 'https://api.deepseek.com/v1/chat/completions'; p.model='deepseek-chat'; break;";

if (c.includes(oldSwitchEnd)) {
  c = c.replace(oldSwitchEnd, newSwitchEnd);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Full provider list updated');
} else {
  console.log('Pattern not found');
}
