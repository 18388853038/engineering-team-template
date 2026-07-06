const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Direct text replacement - remove the rigid workflow section
// Find text between "（delegate）" and "## 你的团队"
const startMarker = "（delegate）\\n\\n'";
const endMarker = "## 你的团队";

const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker, startIdx + 50);

if (startIdx >= 0 && endIdx >= startIdx) {
  const replacement = "（delegate）\\n\\n' +\n      '\\n\\n' +\n      '工作时请善用上述工具，关键信息记录到 ceo_notes.md。\\n' +\n      '\\n' +\n      '";
  c = c.substring(0, startIdx + startMarker.length) + replacement + c.substring(endIdx);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('CEO prompt simplified by removing rigid workflow');
} else {
  console.log('Markers not found');
  if (startIdx < 0) console.log('startMarker not found');
  if (endIdx < 0) console.log('endMarker not found');
}
