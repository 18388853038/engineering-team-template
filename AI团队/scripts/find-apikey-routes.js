const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');

// Find the actual API route for apikey
let idx = c.indexOf("v4/settings/apikey");
let count = 0;
while (idx >= 0) {
  const lineStart = c.lastIndexOf('\n', idx) + 1;
  console.log('Match', count, 'at', idx, ':', c.substring(lineStart, lineStart + 120).trim());
  idx = c.indexOf("v4/settings/apikey", idx + 1);
  count++;
}
