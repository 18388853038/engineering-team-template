const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
const idx = c.indexOf("function getAIProvider()");
const endIdx = c.indexOf("async function runCEOCEO", idx);
console.log(c.substring(idx, idx < endIdx ? endIdx : idx + 2000));
