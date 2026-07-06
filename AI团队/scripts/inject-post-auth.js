const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

c = c.replace(
  "x.setRequestHeader('Content-Type', 'application/json');\n    x.onload = function() {",
  "x.setRequestHeader('Content-Type', 'application/json');\n    if(AUTH_TOKEN)x.setRequestHeader('Authorization','Bearer '+AUTH_TOKEN);\n    x.onload = function() {"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('POST auth header added');
