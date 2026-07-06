const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');

// Find all POST provider routes
let count = 0;
let idx = 0;
while (true) {
  idx = c.indexOf('/api/v4/settings/provider', idx);
  if (idx < 0) break;
  const lineStart = c.lastIndexOf('\n', idx) + 1;
  console.log('Found at', idx, ':', c.substring(lineStart, lineStart + 120).trim());
  idx++;
  count++;
}
console.log('Total:', count);
