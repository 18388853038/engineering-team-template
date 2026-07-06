const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
// Find the CEO loop and show key parts
const idx = c.indexOf("for (var iter = 0; iter < MAX_ITERATIONS; iter++)");
const endIdx = c.indexOf("return { reply: '已处理完毕。'", idx);
console.log(c.substring(idx, endIdx + 60));
