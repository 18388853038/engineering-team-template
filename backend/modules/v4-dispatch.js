/**
 * eCompany v4 CEO 调度模块
 * 任务拆解 → 分发 → 追踪 → 验收
 * 集成到 server-modern.js 使用
 */

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ========== 数据 ==========
const AGENTS = JSON.parse(fs.readFileSync(path.join(BASE, 'agents.json'), 'utf-8') || '[]');
const AGENTS_MAP = {};
AGENTS.forEach(a => { AGENTS_MAP[a.id] = a; });

let TASKS = [];
try { TASKS = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8') || '[]'); } catch(e) {}

function saveTasks() {
  fs.writeFileSync(path.join(BASE, 'tasks.json'), JSON.stringify(TASKS, null, 2), 'utf-8');
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========== 1. 智能匹配员工 ==========
const SKILL_MAP = {
  // 前端
  'vue': ['ai_fe_vue', 'ai_sr_frontend', 'ai_fe_dir'],
  'react': ['ai_fe_react', 'ai_sr_frontend', 'ai_fe_dir'],
  '前端': ['ai_fe_dir', 'ai_sr_frontend', 'ai_fe_vue', 'ai_fe_react'],
  'ui': ['ai_ui_design', 'ai_fe_dir'],
  // 后端
  'python': ['ai_be_python', 'ai_sr_backend', 'ai_be_dir'],
  'java': ['ai_be_java', 'ai_be_dir'],
  'go': ['ai_be_go', 'ai_be_dir'],
  '后端': ['ai_be_dir', 'ai_sr_backend'],
  'api': ['ai_be_dir', 'ai_sr_backend'],
  '数据库': ['ai_db_admin', 'ai_sr_data'],
  // 架构
  '架构': ['ai_cto', 'ai_architect'],
  '系统设计': ['ai_cto', 'ai_architect'],
  // AI
  'ai': ['ai_sr_ai', 'ai_architect'],
  'llm': ['ai_sr_ai'],
  '大模型': ['ai_sr_ai'],
  // 安全
  '安全': ['ai_ciso', 'ai_sr_sec', 'ai_sec_dir'],
  '渗透': ['ai_sr_sec'],
  '审计': ['ai_sec_dir', 'ai_sr_sec'],
  // 测试
  '测试': ['ai_qa_dir', 'ai_test_auto', 'ai_test_manual'],
  '自动化测试': ['ai_test_auto', 'ai_qa_dir'],
  // DevOps
  '部署': ['ai_sr_devops', 'ai_sre'],
  'ci/cd': ['ai_sr_devops'],
  'docker': ['ai_sr_devops', 'ai_sre'],
  // 移动端
  'ios': ['ai_mobile_ios', 'ai_sr_mobile'],
  'android': ['ai_mobile_android', 'ai_sr_mobile'],
  // 全栈
  '全栈': ['ai_sr_fullstack', 'ai_sr_fullstack2', 'ai_sr_fullstack3'],
  // 文档
  '文档': ['ai_doc_dev'],
  // 产品
  '产品': ['ai_cpo'],
  '需求': ['ai_cpo'],
  // 运营
  '运营': ['ai_coo'],
  '项目管理': ['ai_coo'],
};

function matchEmployees(skill) {
  const skillLower = skill.toLowerCase();
  // 精确匹配
  for (const [key, ids] of Object.entries(SKILL_MAP)) {
    if (skillLower.includes(key)) return ids.map(id => AGENTS_MAP[id]).filter(Boolean);
  }
  // 模糊匹配：在技能描述中搜索
  return AGENTS.filter(a =>
    (a.skills || []).some(s => s.toLowerCase().includes(skillLower))
  ).slice(0, 3);
}

// ========== 2. 任务拆解 ==========
function decomposeMission(mission) {
  // 常见任务模板匹配
  const templates = [
    // 登录系统
    { match: /登录|注册|认证|auth/i, subtasks: [
      { title: '认证方案设计', type: '架构', assign: 'ai_cto', assignName: '张明远' },
      { title: '安全审计认证方案', type: '安全', assign: 'ai_sr_sec', assignName: '段志强' },
      { title: '登录页面前端实现', type: '前端', assign: 'ai_fe_vue', assignName: '苏雨晴' },
      { title: 'JWT/会话API后端实现', type: '后端', assign: 'ai_be_python', assignName: '曹振宇' },
      { title: '登录流程自动化测试', type: '测试', assign: 'ai_test_auto', assignName: '沈嘉文' },
    ]},
    // 安全（优先级高于
    { match: /api|接口|后端|微服务/i, subtasks: [
      { title: 'API架构设计', type: '架构', assign: 'ai_cto', assignName: '张明远' },
      { title: 'API接口实现', type: '后端', assign: 'ai_be_python', assignName: '曹振宇' },
      { title: '数据库设计', type: '数据', assign: 'ai_db_admin', assignName: '邓志远' },
      { title: 'API接口测试', type: '测试', assign: 'ai_test_auto', assignName: '沈嘉文' },
    ]},
    // 数据库
    { match: /数据库|数据仓库|etl|数据迁移/i, subtasks: [
      { title: '数据架构设计', type: '架构', assign: 'ai_architect', assignName: '孙立新' },
      { title: '数据库实施/迁移', type: '数据', assign: 'ai_db_admin', assignName: '邓志远' },
      { title: '数据验证测试', type: '测试', assign: 'ai_test_manual', assignName: '邱晓琳' },
    ]},
    // AI/LLM
    { match: /ai|llm|大模型|rag|智能/i, subtasks: [
      { title: 'AI方案设计', type: 'AI', assign: 'ai_sr_ai', assignName: '何晓峰' },
      { title: 'RAG系统实现', type: 'AI', assign: 'ai_sr_ai', assignName: '何晓峰' },
      { title: '前后端集成', type: '全栈', assign: 'ai_sr_fullstack', assignName: '郑文杰' },
      { title: '安全合规审查', type: '安全', assign: 'ai_ciso', assignName: '王浩然' },
    ]},
    // 安全审计
    { match: /安全|渗透|审计|漏洞/i, subtasks: [
      { title: '安全风险评估', type: '安全', assign: 'ai_ciso', assignName: '王浩然' },
      { title: '代码安全审计', type: '安全', assign: 'ai_sr_sec', assignName: '段志强' },
      { title: '渗透测试', type: '安全', assign: 'ai_sec_engineer1', assignName: '程思远' },
      { title: '安全加固报告', type: '安全', assign: 'ai_sec_engineer2', assignName: '萧若兰' },
    ]},
    // 部署/运维
    { match: /部署|运维|发布|ci|cd|上线/i, subtasks: [
      { title: '部署方案设计', type: 'DevOps', assign: 'ai_sr_devops', assignName: '高天翔' },
      { title: 'Docker/K8s配置', type: 'DevOps', assign: 'ai_sr_devops', assignName: '高天翔' },
      { title: '监控配置', type: 'SRE', assign: 'ai_sre', assignName: '白明宇' },
      { title: '部署演练与回滚方案', type: 'SRE', assign: 'ai_sre', assignName: '白明宇' },
    ]},
    // 文档
    { match: /文档|手册|说明|教程/i, subtasks: [
      { title: '技术文档编写', type: '文档', assign: 'ai_doc_dev', assignName: '欧阳明月' },
      { title: 'API文档生成', type: '文档', assign: 'ai_doc_dev', assignName: '欧阳明月' },
      { title: '文档评审', type: '产品', assign: 'ai_cpo', assignName: '赵启航' },
    ]},
    // 产品规划
    { match: /产品|规划|路线图|需求/i, subtasks: [
      { title: '需求分析', type: '产品', assign: 'ai_cpo', assignName: '赵启航' },
      { title: '产品方案设计', type: '产品', assign: 'ai_cpo', assignName: '赵启航' },
      { title: '技术可行性评估', type: '架构', assign: 'ai_cto', assignName: '张明远' },
      { title: '项目排期', type: '运营', assign: 'ai_coo', assignName: '李思源' },
    ]},
    // 移动端
    { match: /移动端|app|ios|android|手机/i, subtasks: [
      { title: '移动端架构设计', type: '架构', assign: 'ai_sr_mobile', assignName: '宋明辉' },
      { title: 'iOS端实现', type: 'iOS', assign: 'ai_mobile_ios', assignName: '韩旭东' },
      { title: 'Android端实现', type: 'Android', assign: 'ai_mobile_android', assignName: '陆子轩' },
      { title: '移动端测试', type: '测试', assign: 'ai_test_manual', assignName: '邱晓琳' },
    ]},
  ];

  // 查找最佳匹配模板
  for (const t of templates) {
    if (t.match.test(mission)) {
      return t.subtasks.map((st, i) => ({
        id: uuid(),
        seq: i + 1,
        title: st.title,
        type: st.type,
        assigneeId: st.assign,
        assigneeName: st.assignName,
        status: 'pending',
      }));
    }
  }

  // 无模板匹配 -> 通用拆解
  return [
    { id: uuid(), seq: 1, title: '需求分析与方案设计', type: '架构', assigneeId: 'ai_cto', assigneeName: '张明远', status: 'pending' },
    { id: uuid(), seq: 2, title: '核心功能实现', type: '开发', assigneeId: 'ai_be_dir', assigneeName: '周泽宇', status: 'pending' },
    { id: uuid(), seq: 3, title: '测试验证', type: '测试', assigneeId: 'ai_qa_dir', assigneeName: '吴文斌', status: 'pending' },
    { id: uuid(), seq: 4, title: '安全审查', type: '安全', assigneeId: 'ai_ciso', assigneeName: '王浩然', status: 'pending' },
    { id: uuid(), seq: 5, title: '文档编写', type: '文档', assigneeId: 'ai_doc_dev', assigneeName: '欧阳明月', status: 'pending' },
  ];
}

// ========== 3. 创建任务批次 ==========
function createBatch(mission, subtasks) {
  const batchId = uuid();
  const batch = {
    id: batchId,
    mission,
    status: 'active',
    createdAt: new Date().toISOString(),
    subtasks: subtasks.map(st => ({
      ...st,
      id: uuid(),
      batchId,
      status: st.assigneeId ? 'in_progress' : 'pending',
      createdAt: new Date().toISOString(),
      result: null,
      completedAt: null,
    })),
  };

  // 写入任务列表
  batch.subtasks.forEach(st => {
    TASKS.push({
      id: st.id,
      title: st.title,
      description: `[${batchId}] ${mission} - ${st.title}`,
      status: 'pending',
      priority: 'high',
      assigneeId: st.assigneeId,
      assigneeName: st.assigneeName,
      batchId,
      creator: 'ai_ceo',
      createdAt: st.createdAt,
    });
  });
  saveTasks();

  return batch;
}

// ========== 4. 更新子任务状态 ==========
function updateSubtask(taskId, updates) {
  const idx = TASKS.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  TASKS[idx] = { ...TASKS[idx], ...updates, updatedAt: new Date().toISOString() };
  saveTasks();
  return TASKS[idx];
}

// ========== 5. 查询批次状态 ==========
function getBatchStatus(batchId) {
  const tasks = TASKS.filter(t => t.batchId === batchId);
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;

  return {
    batchId,
    total, completed, failed, pending, inProgress,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    tasks,
  };
}

// ========== 6. 生成验收报告 ==========
function generateReport(batchId) {
  const status = getBatchStatus(batchId);
  const lines = [];
  lines.push(`# CEO验收报告`);
  lines.push(`批次: ${batchId}`);
  lines.push(`完成度: ${status.completed}/${status.total} (${status.progress}%)`);
  lines.push('');
  lines.push(`## 子任务详情`);
  status.tasks.forEach(t => {
    const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'in_progress' ? '🔄' : '⏳';
    lines.push(`${icon} **${t.title}** — ${t.assigneeName || '未分配'} [${t.status}]`);
    if (t.result) lines.push(`   > ${t.result.slice(0, 200)}`);
  });
  lines.push('');
  lines.push(`## 结论`);
  if (status.failed > 0) {
    lines.push(`⚠️ 有 ${status.failed} 个子任务未通过，需要调整后重新验收。`);
  } else if (status.progress < 100) {
    lines.push(`🔄 还有 ${status.pending + status.inProgress} 个子任务在执行中。`);
  } else {
    lines.push(`✅ 全部子任务完成，可以提交老板确认。`);
  }

  return lines.join('\n');
}

// ========== 7. HTTP 路由注册 ==========
function registerV4Routes(registerRoute, parseBody, json) {
  // 拆解任务
  registerRoute(['POST'], /^\/api\/v4\/decompose$/, async (req, res) => {
    const body = await parseBody(req);
    const { mission } = body;
    if (!mission) { json(res, { error: '缺少mission' }, 400); return; }
    const subtasks = decomposeMission(mission);
    json(res, { ok: true, mission, subtasks });
  });

  // 分发任务
  registerRoute(['POST'], /^\/api\/v4\/dispatch$/, async (req, res) => {
    const body = await parseBody(req);
    const { mission, subtasks } = body;
    if (!mission || !subtasks) { json(res, { error: '缺少mission/subtasks' }, 400); return; }
    const batch = createBatch(mission, subtasks);
    json(res, { ok: true, batchId: batch.id, subtasks: batch.subtasks });
  });

  // 查询状态
  registerRoute(['GET'], /^\/api\/v4\/status\/(.+)$/, async (req, res, m) => {
    const batchId = m[1];
    const status = getBatchStatus(batchId);
    json(res, { ok: true, ...status });
  });

  // 提交成果
  registerRoute(['POST'], /^\/api\/v4\/submit$/, async (req, res) => {
    const body = await parseBody(req);
    const { taskId, result, status } = body;
    if (!taskId) { json(res, { error: '缺少taskId' }, 400); return; }
    const updated = updateSubtask(taskId, { result, status: status || 'completed', completedAt: new Date().toISOString() });
    json(res, { ok: true, task: updated });
  });

  // 验收
  registerRoute(['POST'], /^\/api\/v4\/review$/, async (req, res) => {
    const body = await parseBody(req);
    const { batchId } = body;
    if (!batchId) { json(res, { error: '缺少batchId' }, 400); return; }
    const report = generateReport(batchId);
    json(res, { ok: true, report });
  });

  // 查询员工
  registerRoute(['GET'], /^\/api\/v4\/employees$/, async (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const skill = url.searchParams.get('skill') || '';
    const role = url.searchParams.get('role') || '';

    let result = [...AGENTS];
    if (skill) result = matchEmployees(skill);
    if (role) result = result.filter(e => e.title && e.title.includes(role));

    json(res, {
      ok: true,
      total: result.length,
      employees: result.map(e => ({
        id: e.id, name: e.name_cn, title: e.title,
        icon: e.icon, skills: (e.skills || []).slice(0, 5),
        levels: e.skill_levels, status: e.status,
      }))
    });
  });
}

module.exports = { registerV4Routes, decomposeMission, createBatch, getBatchStatus, generateReport, matchEmployees };
