const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html', 'utf-8');

const bodyIdx = c.indexOf('<body>');
console.log('=== 30 chars before body ===');
console.log(JSON.stringify(c.substring(bodyIdx - 30, bodyIdx)));
console.log('=== 50 chars after body ===');
console.log(JSON.stringify(c.substring(bodyIdx, bodyIdx + 80)));
console.log('=== head tag end ===');
const headEnd = c.indexOf('</head>');
console.log(JSON.stringify(c.substring(headEnd, headEnd + 50)));
