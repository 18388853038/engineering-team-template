const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// CRLF version - replace with CRLF line endings
c = c.replace(
  "// 404\r\n  json(res, { error: 'not found' }, 404);",
  "// SPA fallback (Vue Router)\r\n  const spaPath = path.join(DIST_V2, 'index.html');\r\n  if (fs.existsSync(spaPath)) {\r\n    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });\r\n    res.end(fs.readFileSync(spaPath, 'utf-8'));\r\n    return;\r\n  }\r\n\r\n  // 404\r\n  json(res, { error: 'not found' }, 404);"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('SPA fallback added (CRLF)');
