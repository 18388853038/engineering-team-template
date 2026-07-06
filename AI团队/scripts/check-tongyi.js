const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
if (c.includes("'tongyi'")) console.log('tongyi case EXISTS');
else console.log('tongyi case MISSING!');
if (c.includes('dashscope')) console.log('dashscope URL EXISTS');
else console.log('dashscope URL MISSING!');
