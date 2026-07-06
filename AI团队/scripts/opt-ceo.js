const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

const idx = c.indexOf('TEAM_AGENTS.length');
if (idx > 0) {
  console.log('Found:', c.substring(idx - 10, idx + 200));
  
  // Replace the verbose team prompt with concise version
  c = c.replace(
    "公司共有 ' + TEAM_AGENTS.length + ' 名 AI 员工。\n      + '通过 query_team 可以查询每个人的详细信息。\n\n",
    "公司共有 41 名 AI 员工。管理层: 张明远(CTO)、赵启航(CPO)、李思源(COO)、王浩然(CISO)。\n      + '使用 query_team 查询所有人。\n\n"
  );
  
  fs.writeFileSync(f, c, 'utf-8');
  console.log('CEO prompt optimized');
}
