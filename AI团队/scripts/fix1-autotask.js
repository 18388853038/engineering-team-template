const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\modules\\v4-dispatch.js', 'utf-8');
fs.writeFileSync('F:\\v3.0_backup_2026-05-05\\backend\\modules\\v4-dispatch.js', c.replace(
  "status: 'pending',\n      createdAt: new Date().toISOString(),",
  "status: st.assigneeId ? 'in_progress' : 'pending',\n      createdAt: new Date().toISOString(),"
), 'utf-8');
console.log('1. Auto-assign: done');
