const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html', 'utf-8');
const lines = c.split('\n');

// Show page structure
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t.startsWith('<!--') || t.startsWith('<div id=') || t.startsWith('<nav') || 
      t.startsWith('</div>') && i < 100) {
    console.log(`L${i+1}: ${t.substring(0,100)}`);
  }
}
console.log('---');
// Find main content area and script sections
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<script>')) console.log(`Script at L${i+1}`);
  if (lines[i].includes('</script>')) console.log(`End script at L${i+1}`);
  if (lines[i].includes('skData') || lines[i].includes('application/json')) console.log(`Data at L${i+1}: ${lines[i].substring(0,80)}`);
}
