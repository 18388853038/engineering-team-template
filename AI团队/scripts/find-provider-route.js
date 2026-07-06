const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
const target = "registerRoute(['POST'], /^\\/api\\/v4\\/settings\\/provider$/";
const idx = c.indexOf(target);
if (idx >= 0) {
  console.log('Found POST provider route');
  // Show the full handler
  const end = c.indexOf('});', idx) + 3;
  console.log(c.substring(idx, Math.min(idx + 700, end + 50)));
} else {
  console.log('POST provider route NOT FOUND');
  // Search for any provider reference
  const providIdx = c.indexOf('v4/settings/provider');
  if (providIdx >= 0) console.log('Found at', providIdx, ':', c.substring(providIdx - 30, providIdx + 100));
}
