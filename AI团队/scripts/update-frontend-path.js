const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');
c = c.replace(
  "const FRONTEND = path.join(BASE, '..', 'frontend');",
  "const FRONTEND = path.join(BASE, '..', 'frontend-v2');"
);
fs.writeFileSync(f, c, 'utf-8');
console.log('Updated FRONTEND path');
