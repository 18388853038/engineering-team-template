const fs = require('fs');
const path = require('path');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Add DIST_V2
c = c.replace(
  "const DIST = path.join(FRONTEND, 'dist');",
  "const DIST = path.join(FRONTEND, 'dist');\nconst DIST_V2 = path.resolve(BASE, '..', 'frontend-v2', 'dist');"
);

// Update index path to use DIST_V2
c = c.replace(
  "const indexPath = path.join(DIST, 'index.html');",
  "const indexPath = path.join(DIST_V2, 'index.html');"
);

// Update serve paths to prefer DIST_V2
c = c.replace(
  "const servePaths = [\n    path.join(FRONTEND, pathname.replace(/^\\//, '')),\n    path.join(DIST, pathname.replace(/^\\//, '')),\n  ];",
  "const servePaths = [\n    path.join(DIST_V2, pathname.replace(/^\\//, '')),\n    path.join(FRONTEND, pathname.replace(/^\\//, '')),\n    path.join(DIST, pathname.replace(/^\\//, '')),\n  ];"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Updated paths for frontend-v2');
