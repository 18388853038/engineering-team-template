const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html', 'utf-8');

const bodyAt = c.indexOf('<body>');
const appAt = c.indexOf('<div id="app"');
console.log('body tag at:', bodyAt);
console.log('app tag at:', appAt);
console.log('Content between body and app:');
if (appAt > bodyAt) {
  console.log(c.substring(bodyAt + 6, appAt).substring(0, 200));
}

// Check what's after app div before script
const scriptAt = c.indexOf('<script>');
console.log('\nContent after app before script');
console.log(c.substring(appAt, scriptAt).substring(0, 300));
