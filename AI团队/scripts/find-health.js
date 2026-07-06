const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
let idx = 0;
let count = 0;
while (true) {
  idx = c.indexOf('/api/health', idx);
  if (idx < 0) break;
  const start = c.lastIndexOf('registerRoute', idx);
  const lineEnd = c.indexOf('\n', start);
  console.log('#' + count + ' at', start, ':', c.substring(start + 14, lineEnd).substring(0, 80));
  idx++;
  count++;
}
