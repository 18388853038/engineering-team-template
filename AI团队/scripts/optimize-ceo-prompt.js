const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Find the team section and optimize
const oldTeam = "公司共有 " + TEAM_AGENTS.length + " 名 AI 员工。\n      + '通过 query_team 可以查询每个人的详细信息。\n\n'";
const newTeam = "公司共有 41 名 AI 员工（管理层: 张明远CTO、赵启航CPO、李思源COO、王浩然CISO）。\n      + '可用 query_team 查询所有人。\n\n'";

if (c.includes(oldTeam)) {
  c = c.replace(oldTeam, newTeam);
  fs.writeFileSync(f, c, 'utf-8');
  console.log('CEO prompt optimized');
} else {
  console.log('Pattern not found');
  const idx = c.indexOf('TEAM_AGENTS.length');
  if (idx > 0) console.log('Found:', c.substring(idx - 20, idx + 150));
}
