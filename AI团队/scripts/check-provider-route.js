const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
let idx = c.indexOf('settings/provider');
idx = c.lastIndexOf('registerRoute', idx);
console.log(c.substring(idx, idx + 600));
