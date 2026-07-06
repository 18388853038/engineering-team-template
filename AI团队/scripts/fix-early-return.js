const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Remove the early return that bypasses file reading
const oldEarlyReturn = "  if (process.env.DEEPSEEK_API_KEY) {\n    p.apiKey = process.env.DEEPSEEK_API_KEY;\n    return p;\n  }";

const newEarlyReturn = "  // 优先从文件读取配置（支持多提供商切换）\n  process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';";

if (c.includes(oldEarlyReturn)) {
  c = c.replace(oldEarlyReturn, newEarlyReturn);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed: removed early return, now always reads config file');
} else {
  console.log('Pattern not found, checking...');
  const idx = c.indexOf("DEEPSEEK_API_KEY");
  if (idx >= 0) console.log('Found at', idx, ':', c.substring(idx, idx + 100));
}
