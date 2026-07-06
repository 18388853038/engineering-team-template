const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
const c = fs.readFileSync(f, 'utf-8');
const lines = c.split('\n');

// Check for broken HTML template issues
const issues = [];
let inScript = false;
let depth = 0;

lines.forEach((line, i) => {
  if (line.includes('<script>')) inScript = true;
  if (line.includes('</script>') && inScript) {
    inScript = false;
    return;
  }
  if (inScript) return; // skip script content

  // Track template depth
  depth += (line.match(/<template/g) || []).length;
  depth -= (line.match(/<\/template>/g) || []).length;
});

console.log('Total template depth (should be 0):', depth);

// Check for encoding issues (broken unicode)
let brokenChars = 0;
const badPattern = /[\uFFFD\uFFF0-\uFFFF]/g; // replacement chars and private use
const matches = c.match(badPattern);
if (matches) {
  console.log('Broken unicode chars found:', matches.length);
  matches.forEach((m, i) => {
    if (i < 10) {
      const idx = c.indexOf(m);
      const lineNum = c.substring(0, idx).split('\n').length;
      console.log(`  at line ${lineNum}: char code ${m.charCodeAt(0)}`);
    }
  });
} else {
  console.log('No broken unicode detected');
}

// Check the HTML structure around key areas
console.log('\n--- Navigation structure ---');
for (let i = 140; i < 150; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
