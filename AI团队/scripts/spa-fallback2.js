const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the 404 handler and add SPA fallback before it
c = c.replace(
  "// 404\n  json(res, { error: 'not found' }, 404);",
  "// SPA fallback (Vue Router)\n  const spaPath = path.join(DIST_V2, 'index.html');\n  if (fs.existsSync(spaPath)) {\n    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });\n    res.end(fs.readFileSync(spaPath, 'utf-8'));\n    return;\n  }\n\n  // 404\n  json(res, { error: 'not found' }, 404);"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('SPA fallback added');
