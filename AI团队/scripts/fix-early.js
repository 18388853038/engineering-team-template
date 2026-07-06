const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find and fix the early return in getAIProvider()
const idx = c.indexOf("function getAIProvider()");
const earlyReturnStart = c.indexOf("if (process.env.DEEPSEEK_API_KEY)", idx);
const earlyReturnEnd = c.indexOf("}", earlyReturnStart) + 1;
const earlyReturnCode = c.substring(earlyReturnStart, earlyReturnEnd);

console.log('Found early return:', earlyReturnCode.substring(0, 100));

if (earlyReturnCode.includes("return p;") && earlyReturnCode.includes("DEEPSEEK_API_KEY")) {
  c = c.replace(earlyReturnCode, "// 已移除早期返回，统一从文件读取配置");
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed early return in getAIProvider()');
} else {
  console.log('Pattern not recognized');
}
