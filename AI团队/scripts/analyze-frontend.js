const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html', 'utf-8');
const lines = c.split('\n');

// Find key functions
const keywords = ['fetch(', 'login', 'auth', 'token', 'verify', 'loadAgent', 'showPage', 'nav-click'];
let count = 0;
for (let i = 0; i < lines.length; i++) {
  for (const kw of keywords) {
    if (lines[i].toLowerCase().includes(kw)) {
      console.log(`Line ${i+1}: ${lines[i].substring(0,120).trim()}`);
      count++;
      if (count >= 20) { console.log('...'); process.exit(0); }
      break;
    }
  }
}
console.log('Total matches:', count);
