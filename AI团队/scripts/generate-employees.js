/**
 * eCompany v4.0 — 批量生成员工 Agent 身份文件
 * 读取 agents.json → 生成 IDENTITY.md + SKILLS.md
 */
const fs = require('fs');
const path = require('path');

const agents = JSON.parse(fs.readFileSync('F:/v3.0_backup_2026-05-05/backend/agents.json', 'utf-8'));
const BASE = 'F:/v3.0_backup_2026-05-05/子龙虾/员工';

// 分类映射
const CATEGORY_MAP = {
  ceo: '管理层',
  c_suite: '管理层',
  director: '管理层',
  senior: '资深工程师',
  staff: '工程师',
  fullstack: '全栈',
};

const CAT_ICONS = {
  ceo: '👑', c_suite: '🏛️', director: '📐',
  senior: '⭐', staff: '🔧', fullstack: '🌐',
};

function safeId(name) {
  return name.replace(/[\s\\\/:*?"<>|]/g, '_');
}

agents.forEach((agent, idx) => {
  const dirName = `${String(idx+1).padStart(2,'0')}_${safeId(agent.name_cn)}_${agent.id}`;
  const agentDir = path.join(BASE, dirName);
  fs.mkdirSync(agentDir, { recursive: true });

  const category = CATEGORY_MAP[agent.category] || '其他';
  const icon = CAT_ICONS[agent.category] || '🤖';
  const skillList = agent.skills.map((s, i) =>
    `  - ${s} (${agent.skill_levels[i] || 'intermediate'})`
  ).join('\n');

  // IDENTITY.md
  const identity = `# ${icon} ${agent.name_cn} — ${agent.title}

**身份:** ${agent.name_cn}，eCompany ${category}
**代号:** ${agent.id}
**汇报对象:** ${agent.reports_to ? agents.find(a => a.id === agent.reports_to)?.name_cn || agent.reports_to : 'CEO小龙'}
**状态:** ${agent.status === 'online' ? '🟢 在线' : '⚫ 离线'}

## 角色描述

${agent.description}

## 技能专长

${skillList}

## 工作原则

1. 接到任务后先确认理解，再开始执行
2. 遇到阻塞或不确定立即上报，不硬扛
3. 完成的成果须自查后再提交
4. 保守机密，不越权不越界

## 与CEO小龙的工作关系

- 小龙是我的调度中枢
- 任务由小龙分发，成果向小龙提交
- 跨团队协作通过小龙协调
- 工作时间由小龙统一安排

## 承诺

对小龙负责，对公司负责。交付即承诺。
`;

  fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), identity, 'utf-8');

  // SKILLS.md - 详细技能说明
  const skills = `# ${agent.name_cn} 技能详表

## 技能等级说明
| 等级 | 含义 |
|:----:|------|
| expert | 精通：能独立解决复杂问题，可指导他人 |
| advanced | 熟练：能独立完成任务，偶尔需指导 |
| intermediate | 中等：能完成常规任务，复杂问题需协助 |

## 技能清单

${agent.skills.map((s, i) => `### ${i+1}. ${s}
- **等级:** ${agent.skill_levels[i] || 'intermediate'}
- **描述:** 来自 eCompany 员工档案
- **用途:** 支撑 ${agent.title} 角色的核心能力`).join('\n\n')}

---

_由CEO小龙统一管理 · 技能可随时间成长_
`;

  fs.writeFileSync(path.join(agentDir, 'SKILLS.md'), skills, 'utf-8');

  console.log(`[${idx+1}/41] ✅ ${agent.name_cn} (${agent.id})`);
});

console.log('\n🎉 全部 41 名员工身份文件已生成！');
console.log(`📂 位置: ${BASE}`);
