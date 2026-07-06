const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Add SPA fallback before the 404 handler
// Find the 404 handler and add SPA fallback before it
const notFoundHandler = c.indexOf("// 404\n  json(res, { error: 'not found' }, 404)");
if (notFoundHandler > 0) {
  const spaFallback = `
  // SPA fallback: serve index.html for unrecognized routes (Vue Router)
  const indexPath = path.join(DIST_V2, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(indexPath, 'utf-8'));
    return;
  }

  `;
  c = c.slice(0, notFoundHandler) + spaFallback + c.slice(notFoundHandler);
}

fs.writeFileSync(f, c, 'utf-8');
console.log('SPA fallback added');
