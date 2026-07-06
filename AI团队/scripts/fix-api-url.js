const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Change hardcoded API base to use current host
c = c.replace(
  "_base: 'http://127.0.0.1:8003'",
  "_base: window.location.protocol + '//' + window.location.host"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('API base now uses current host');
