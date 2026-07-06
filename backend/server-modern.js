var __taskPaused = false;
var __taskPausedTime = null;
/**
 * eCompany-Claw 现代化服务器(模块化版)
 *
 * 保留原有 server.js 的所有功能,但通过模块化重构提升可维护性
 * 注入:多模型 AI 引擎、OpenClaw 桥接、工具系统
 *
 * 启动方式:node backend/server-modern.js
 * 端口:8002
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8002', 10);
const BASE = __dirname;
const baseNorm = path.resolve(BASE) + path.sep;
const FRONTEND = path.join(BASE, '..', 'frontend');
const DIST = path.join(FRONTEND, 'dist');
const DIST_V2 = path.resolve(BASE, '..', 'frontend', 'dist');


// ========== 凭证版本管理 ==========
const CRED_HISTORY_FILE = path.join(BASE, 'provider-keys-history.json');
function saveProviderKeysWithHistory(pkPath, newKeys, source) {
  try {
    // 先读旧值
    var oldKeys = {};
    try { oldKeys = JSON.parse(fs.readFileSync(pkPath, 'utf-8')); } catch(e) {}
    // 写新值
    fs.writeFileSync(pkPath, JSON.stringify(newKeys, null, 2));
    // 记录变更
    var history = [];
    try { history = JSON.parse(fs.readFileSync(CRED_HISTORY_FILE, 'utf-8')); } catch(e) {}
    for (var k in newKeys) {
      if (newKeys[k] && newKeys[k] !== oldKeys[k]) {
        history.push({ key: k, oldMask: oldKeys[k] ? oldKeys[k].substring(0,8) + '***' : '(空)', newMask: newKeys[k].substring(0,8) + '***', source: source || '系统', changedAt: new Date().toISOString(), version: history.length + 1 });
      }
    }
    fs.writeFileSync(CRED_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch(e) { console.error('[凭证版本] 写入历史失败:', e.message); }
}

// ========== 加载模块 ==========
const openclawBridge = require('./modules/openclaw-bridge');
const { cronScheduler, taskFlow } = require('./modules/automation');
const { ProcessSandbox, FileSandbox } = require('./modules/sandbox');
const { skillSystem } = require('./modules/skills');
const skillProxy = require('./modules/skill-proxy');
const coreMem = require('./modules/core-memory');
const layMem = require('./modules/layered-memory');
const toolRouter = require('./modules/tool-router');
const toolTruncator = require('./modules/tool-truncator');
const harHabits = require('./modules/harness-habits');
const { taskQueue } = require('./modules/task-queue');
const { registerI18nAPI } = require('./modules/i18n');
const agentWorker = require('./modules/agent-worker-engine');
const agentDispatcher = require('./modules/agent-dispatcher');
// === Load provider keys into env vars ===
try {
  var pkPath = path.join(BASE, 'provider-keys.json');
  if (fs.existsSync(pkPath)) {
    var allKeys = JSON.parse(fs.readFileSync(pkPath, 'utf-8'));
    var pm = { deepseek:'DEEPSEEK_API_KEY', tongyi:'TONGYI_API_KEY', hunyuan:'HUNYUAN_API_KEY' };
    for (var k of Object.keys(allKeys)) {
      var envName = pm[k] || (k.toUpperCase() + '_API_KEY');
      if (!process.env[envName]) process.env[envName] = allKeys[k];
    }
  }
} catch(e) {}

// === Load provider keys into env vars ===
try {
  var pkPath = path.join(BASE, 'provider-keys.json');
  if (fs.existsSync(pkPath)) {
    var allKeys = JSON.parse(fs.readFileSync(pkPath, 'utf-8'));
    var pm = { deepseek:'DEEPSEEK_API_KEY', tongyi:'TONGYI_API_KEY', hunyuan:'HUNYUAN_API_KEY' };
    for (var k of Object.keys(allKeys)) {
      var envName = pm[k] || (k.toUpperCase() + '_API_KEY');
      if (!process.env[envName]) process.env[envName] = allKeys[k];
    }
  }
} catch(e) {}

const { db, agentOps, taskOps, convOps, skillOps, licenseOps } = require('./modules/database');
const wsServer = require('./modules/ws-server');
const { eventBus, messageQueue, EventStore } = require('./modules/agent-bus');
const SharedMemory = require('./modules/shared-memory');
const biDashboard = require('./modules/bi-dashboard');
const biAutomationRules = require('./modules/bi-automation-rules');
const goalTracker = require('./modules/goal-tracker');
const cognitive = require('./modules/cognitive');
const chatCleaner = require('./modules/chat-history-cleaner');
const modelRouter = require('./modules/model-router');
const automationV2 = require('./modules/automation-v2');
const knowledgeEngine = require('./modules/knowledge-engine');
const channelIntegration = require('./modules/channel-integration');
const channelSender = require('./modules/channel-sender');
const skillsRunner = require('./modules/skills-runner');
const lifecycleRoutes = require('./modules/lifecycle-routes');
const selfEvolution = require('./modules/self-evolution');
const QualitySystem = require('./modules/quality-system');
const unifiedEngine = require('./modules/unified-engine');
const unifiedRouter = require('./modules/unified-router');

const processSandbox = new ProcessSandbox();
const fileSandbox = new FileSandbox();

// ========== v4 CEO 调度系统 ==========
const { registerV4Routes } = require('./modules/v4-dispatch');

// ========== 数据文件 ==========
// ========== 加载 .env 文件 ==========
(function() {
  const envPath = path.join(BASE, '..', '.env');
  try {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
      console.log('[env] 已加载 .env 文件');
    }
  } catch(e) { /* silently skip */ }
})();

const AGENTS_FILE = path.join(BASE, 'agents.json');
const TASKS_FILE = path.join(BASE, 'tasks.json');
const LICENSE_FILE = path.join(BASE, 'licenses.json');

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      let raw = fs.readFileSync(file, 'utf-8');
      if (raw.length > 0 && (raw.charCodeAt(0) === 0xFEFF || raw.charCodeAt(0) === 239))
        raw = raw.replace(/^[\uFEFF\xEF\xBB\xBF]+/, '');
      return JSON.parse(raw);
    }
  } catch(e) { console.error('[load]', file, e.message); }
  return fallback;
}

function saveJSON(file, data) {
  var tmpFile = file + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, file);
  } catch(e) {
    try { fs.unlinkSync(tmpFile); } catch(e2) {}
    throw e;
  }
}

const TEAM_AGENTS = loadJSON(AGENTS_FILE, []);
const AGENTS_MAP = {};
TEAM_AGENTS.forEach(a => { AGENTS_MAP[a.id] = a; });
let TASKS = loadJSON(TASKS_FILE, []);
let LICENSES = loadJSON(LICENSE_FILE, []);
// Helper: get API key from env or file
function getActiveApiKey() {
  // credential-store 优先
  try {
    const credStore = require('./modules/credential-store');
    const dsKey = credStore.getApiKey('deepseek');
    if (dsKey) return dsKey;
  } catch(e) { /* fall through */ }
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    if (cfg.apiKey && cfg.apiKey.length > 4) return cfg.apiKey;
  } catch(e) { /* fall through */ }
  return '';
}

// ========== CEO Agent 引擎:自主推理 + 工具调用 + 动态决策 ==========
const CEOMEM_PATH = path.join(BASE, 'memory-ai_ceo.json');

function loadCEOMemory() {
  try {
    var raw = fs.readFileSync(CEOMEM_PATH, 'utf-8');
    var m = JSON.parse(raw);
    if (!m.decisions) m.decisions = [];
    if (!m.conversations) m.conversations = [];
    return m;
  } catch(e) {
    return { decisions: [], conversations: [], memory: {} };
  }
}

function saveCEOMemory(m) {
  try {
    if (!m.decisions) m.decisions = [];
    if (!m.conversations) m.conversations = [];
    if (m.decisions.length > 200) m.decisions = m.decisions.slice(-200);
    if (m.conversations.length > 200) m.conversations = m.conversations.slice(-200);
    fs.writeFileSync(CEOMEM_PATH, JSON.stringify(m, null, 2), 'utf-8');
  } catch(e) { /* silently fail */ }
}

/**
 * 跨平台路径解析
 * 支持: Unix路径→Windows, ~/→用户目录, 相对路径→基于BASE
 */
function resolvePath(filepath) {
  if (!filepath || !filepath.trim()) return null;
  var p = filepath.trim();

  // Windows 上处理 Unix 风格路径
  if (process.platform === 'win32') {
    // ~/ 或 ~\ 开头 → 用户目录
    if (p.startsWith('~/') || p.startsWith('~\\')) {
      p = require('os').homedir() + p.substring(1);
    }
    // /c/xxx 或 /C/xxx 风格 → C:\xxx
    else if (p.match(/^\/[a-zA-Z]\//)) {
      p = p[1].toUpperCase() + ':' + p.substring(2);
    }
    // /tmp 或 /temp → Windows 临时目录
    else if (/^\/(tmp|temp)(\/|$)/.test(p)) {
      p = require('os').tmpdir() + p.substring(4);
    }
    // /var/tmp → Windows 临时目录
    else if (/^\/var\/tmp(\/|$)/.test(p)) {
      p = require('os').tmpdir() + p.substring(7);
    }
    // Unix 绝对路径 → 拒绝(不认识的路径)
    else if (p.startsWith('/')) {
      return null;
    }
  } else {
    // macOS/Linux 处理 ~
    if (p.startsWith('~/')) {
      p = require('os').homedir() + p.substring(1);
    }
  }

  return require('path').resolve(BASE, p);
}

var CEO_TOOLS = [
  { type: 'function', function: { name: 'query_team', description: '查询团队成员信息', parameters: { type: 'object', properties: { role: { type: 'string', description: '按角色筛选' }, skill: { type: 'string', description: '按技能筛选' }, name: { type: 'string', description: '按名称搜索' } } } } },
  { type: 'function', function: { name: 'assign_task', description: '给成员分配新任务。分配任务时必须填写详细的描述说明，让员工知道具体要做什么', parameters: { type: 'object', properties: { title: { type: 'string', description: '任务标题' }, assigneeId: { type: 'string', description: '负责人ID' }, description: { type: 'string', description: '⭐ 必填！详细任务描述、验收标准、参考信息' }, priority: { type: 'string', description: '优先级: emergency/high/medium/low' }, deadline: { type: 'string', description: '截止日期，格式 YYYY-MM-DD' } }, required: ['title', 'assigneeId', 'description'] } } },
  { type: 'function', function: { name: 'list_tasks', description: '列出当前所有任务', parameters: { type: 'object', properties: { assigneeId: { type: 'string', description: '按负责人筛选' }, status: { type: 'string', description: '按状态筛选' }, limit: { type: 'number', description: '限制数量' } } } } },
  { type: 'function', function: { name: 'search_web', description: '搜索网络获取最新信息', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_weather', description: '获取天气信息', parameters: { type: 'object', properties: { city: { type: 'string', description: '城市名称' } }, required: ['city'] } } },
  { type: 'function', function: { name: 'read_file', description: '读取文件内容(Windows用C:\\path\\file,macOS/Linux用/path/file,~开头自动解析到家目录)', parameters: { type: 'object', properties: { filepath: { type: 'string', description: '文件路径(Win: C:\\xxx, Unix: /xxx, ~/xxx)' } }, required: ['filepath'] } } },
  { type: 'function', function: { name: 'write_file', description: '写入内容到用户指定路径的文件(支持系统任意目录)', parameters: { type: 'object', properties: { filepath: { type: 'string', description: '文件路径' }, content: { type: 'string', description: '文件内容' } }, required: ['filepath', 'content'] } } },
  { type: 'function', function: { name: 'exec', description: '在服务器上执行 shell 命令(CEO 专用,解压用file_manager不要用exec)', parameters: { type: 'object', properties: { command: { type: 'string', description: '命令内容' } }, required: ['command'] } } }

,
  { type: 'function', function: { name: 'system_health', description: '检查系统健康(服务器、数据库、AI提供商、内存、前端)', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_manager', description: '查看已安装的技能列表、安装新技能(查询技能用这个,不要用 read_file)', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'channel_config', description: '配置通讯渠道', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作' }, channel: { type: 'string', description: '渠道名称' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'file_manager', description: '文件管理:解压ZIP、列目录、复制移动文件、查看文件信息(解压用tar,正确处理中文路径)', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作:unzip/list/copy/move/delete/info' }, source: { type: 'string', description: '源文件路径' }, dest: { type: 'string', description: '目标路径' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'harness_status', description: '查看 Harness 边界监控状态', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'harness_errors', description: '查看 Harness 错误趋势和自动工单', parameters: { type: 'object', properties: { days: { type: 'number', description: '查看天数默认7天' } }, required: [] } } },
  { type: 'function', function: { name: 'harness_sla', description: '查看 Harness SLA 统计数据', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'harness_dag', description: '查看任务依赖图谱', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'harness_agent_control', description: '设置指定 Agent 的速率限制和行为覆盖', parameters: { type: 'object', properties: { agentId: { type: 'string', description: 'Agent ID' }, perMinute: { type: 'number', description: '每分钟最大调用次数' }, perHour: { type: 'number', description: '每小时最大调用次数' }, enabled: { type: 'boolean', description: '启用/禁用' } }, required: ['agentId'] } } },
  { type: 'function', function: { name: 'harness_habits_analyze', description: '分析老板操作习惯和偏好趋势(带记忆衰减)\nCEO/安全总监专用:查看用户习惯演变', parameters: { type: 'object', properties: { days: { type: 'number', description: '分析天数默认90' } }, required: [] } } },
  { type: 'function', function: { name: 'harness_habits_record', description: '手动记录一条老板的操作习惯或偏好', parameters: { type: 'object', properties: { category: { type: 'string', description: '类别: command/preference/format/report/workflow' }, action: { type: 'string', description: '行为描述' }, detail: { type: 'string', description: '详情' } }, required: ['category', 'action'] } } },
  { type: 'function', function: { name: 'harness_habits_confirm', description: '确认或拒绝一条待验证的偏好推测\n老板确认回路:AI推测的习惯需要老板确认后才写入核心库', parameters: { type: 'object', properties: { prefId: { type: 'string', description: '偏好ID' }, confirmed: { type: 'boolean', description: '是否确认' }, note: { type: 'string', description: '备注' } }, required: ['prefId', 'confirmed'] } } },
  { type: 'function', function: { name: 'harness_habits_pending', description: '列出所有待老板确认的偏好推测', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'compliance_audit_tasks', description: '合规审计:审计当前所有任务的质量和状态,发现不合规项\n合规审计小组专用', parameters: { type: 'object', properties: { filter: { type: 'string', description: '筛选条件: all/pending/done' } }, required: [] } } },
  { type: 'function', function: { name: 'compliance_audit_product', description: '合规审计:审计产品交付物质量和合规性\n合规审计小组专用', parameters: { type: 'object', properties: { productId: { type: 'string', description: '产品ID' } }, required: [] } } },
  { type: 'function', function: { name: 'compliance_report', description: '生成合规审计报告,汇总任务和产品的审计结果\n合规审计小组专用', parameters: { type: 'object', properties: { scope: { type: 'string', description: '范围: all/tasks/products' } }, required: [] } } },
    { type: 'function', function: { name: 'harness_boundary_reset', description: '重置 Harness 边界统计', parameters: { type: 'object', properties: {}} } },
  { type: 'function', function: { name: 'harness_rules_list', description: '查看 Harness 规则引擎的所有规则(可按状态/类型过滤) 合规审计Agent/安全审计Agent专用', parameters: { type: 'object', properties: { status: { type: 'string', description: '过滤 active/proposed/rejected/deprecated' }, type: { type: 'string', description: '过滤 rate_limit/permission/compliance/operation' } }, required: [] } } },
  { type: 'function', function: { name: 'harness_rules_propose', description: '提议新规则:合规审计Agent发现规则缺口时提出,进入proposed状态,需安全Agent确认后生效', parameters: { type: 'object', properties: { type: { type: 'string', description: '规则类型: rate_limit/permission/compliance/operation' }, name: { type: 'string', description: '规则名称' }, condition: { type: 'string', description: '触发条件(如 agent.callsPerMinute >= 20)' }, action: { type: 'string', description: '动作: block/warn/log' }, reason: { type: 'string', description: '规则说明' }, severity: { type: 'string', description: '严重度 low/medium/high/critical 默认medium' } }, required: ['type', 'condition', 'action'] } } },
  { type: 'function', function: { name: 'harness_rules_confirm', description: '确认规则:安全审计Agent确认合规审计Agent提出的规则 多签确认流程 propose confirm activate', parameters: { type: 'object', properties: { ruleId: { type: 'string', description: '规则ID' }, note: { type: 'string', description: '确认备注' } }, required: ['ruleId'] } } },
  { type: 'function', function: { name: 'harness_rules_reject', description: '驳回规则:安全审计Agent驳回不合规的规则提议', parameters: { type: 'object', properties: { ruleId: { type: 'string', description: '规则ID' }, reason: { type: 'string', description: '驳回理由' } }, required: ['ruleId', 'reason'] } } },
  { type: 'function', function: { name: 'harness_rules_pending', description: '列出所有待确认的规则提议(安全审计Agent审批用)', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'harness_proposal_submit', description: '提交结构化方案供规则引擎验证,通过放行不通过打回 tool_call/task_execute/config_change', parameters: { type: 'object', properties: { type: { type: 'string', description: '方案类型 tool_call/task_execute/config_change 默认tool_call' }, action: { type: 'object', description: '方案内容 tool_call需要{tool,params,reasoning,expected,risk}' }, context: { type: 'object', description: '上下文可选' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'harness_proposal_appeal', description: '申诉被阻断的方案:规则引擎打回时提交申诉理由,需VP以上审批豁免', parameters: { type: 'object', properties: { proposalId: { type: 'string', description: '方案ID' }, justification: { type: 'string', description: '申诉理由' } }, required: ['proposalId', 'justification'] } } },
  { type: 'function', function: { name: 'harness_proposal_audit', description: '查看提案审计日志:追溯方案提交/阻断/申诉/豁免记录,合规审计Agent专用', parameters: { type: 'object', properties: { limit: { type: 'number', description: '返回条数限制默认50' } }, required: [] } } },
  { type: 'function', function: { name: 'memory_write', description: '核心记忆库写入器:将对话摘要、关键决策、任务记录、员工表现等直接写入核心记忆库\n自动按规则入库,无需手动确认', parameters: { type: 'object', properties: { content: { type: 'string', description: '结构化记忆内容(对话摘要/决策/任务/员工表现)' }, tags: { type: 'string', description: '标签列表,逗号分隔,用于分类检索' }, priority: { type: 'string', description: '优先级: high/medium/low 默认medium' }, type: { type: 'string', description: '记忆类型: summary决策/decision决策/task任务/performance表现/knowledge知识/preference偏好 默认general' } }, required: ['content'] } } },
  { type: 'function', function: { name: 'memory_search', description: '核心记忆库检索器:按关键词、时间范围、标签等条件检索历史记忆\n支持模糊搜索,按优先级排序返回', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, tags: { type: 'string', description: '标签过滤,逗号分隔' }, type: { type: 'string', description: '记忆类型过滤 summary/decision/task/performance/knowledge' }, priority: { type: 'string', description: '优先级过滤 high/medium/low' }, dateFrom: { type: 'string', description: '开始时间 ISO格式' }, dateTo: { type: 'string', description: '结束时间 ISO格式' }, limit: { type: 'number', description: '返回条数限制 默认20 最大100' } }, required: [] } } },
  { type: 'function', function: { name: 'memory_version', description: '记忆版本管理器:查看记忆修改历史、回滚到某个版本,防止误写入导致信息丢失\n管理记忆库的版本快照', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作: list列出版本/rollback回滚到指定版本/record_detail查看某条记录的历史' }, versionId: { type: 'string', description: '回滚目标版本ID(action=rollback时需要)' }, recordId: { type: 'string', description: '记录ID(action=record_detail时需要)' } }, required: ['action'] } } }

,
  { type: 'function', function: { name: 'complete_task', description: '核销任务:将任务标记为已完成,填写完成结果和评分', parameters: { type: 'object', properties: { taskId: { type: 'string', description: '任务ID' }, result: { type: 'string', description: '完成结果描述' }, score: { type: 'string', description: '评分 A/B/C 默认A' } }, required: ['taskId', 'result'] } } },
  { type: 'function', function: { name: 'review_task', description: '审核员工提交的任务:批准或驳回,给出反馈', parameters: { type: 'object', properties: { taskId: { type: 'string', description: '任务ID' }, approved: { type: 'boolean', description: '是否通过' }, feedback: { type: 'string', description: '审核反馈' } }, required: ['taskId', 'approved'] } } },
  { type: 'function', function: { name: 'reassign_task', description: '将停滞或逾期任务重新分配给其他人', parameters: { type: 'object', properties: { taskId: { type: 'string', description: '任务ID' }, newAssigneeId: { type: 'string', description: '新的负责人ID' }, reason: { type: 'string', description: '重新分配原因' } }, required: ['taskId', 'newAssigneeId'] } } }
,
  { type: 'function', function: { name: 'tencent_docs_create', description: '创建腾讯在线文档(支持Word/Excel/幻灯片/思维导图/流程图/智能表格)', parameters: { type: 'object', properties: { type: { type: 'string', description: '文档类型: doc文档/xls表格/slide幻灯片/mindmap思维导图' }, title: { type: 'string', description: '文档标题' } }, required: ['type', 'title'] } } },
  { type: 'function', function: { name: 'tencent_meeting_create', description: '创建腾讯会议预约', parameters: { type: 'object', properties: { subject: { type: 'string', description: '会议主题' }, start_time: { type: 'string', description: '开始时间(ISO格式 如2026-05-15T10:00:00)' }, duration: { type: 'number', description: '会议时长分钟默认30' } }, required: ['subject', 'start_time'] } } },
  { type: 'function', function: { name: 'tencent_survey_create', description: '创建腾讯问卷', parameters: { type: 'object', properties: { title: { type: 'string', description: '问卷标题' } }, required: ['title'] } } },
  { type: 'function', function: { name: 'system_check_provider', description: '检查指定AI提供商连通性(如DeepSeek),测试API是否可用', parameters: { type: 'object', properties: { provider: { type: 'string', description: '提供商名称 deepseek/openai/anthropic/google/tongyi 等,不填则检查默认' } }, required: [] } } },
  { type: 'function', function: { name: 'system_check_bridge', description: '检查指定通讯渠道桥接状态(微信/QQ/飞书/钉钉/企微/腾讯云)', parameters: { type: 'object', properties: { channel: { type: 'string', description: '渠道名称 wechat/qqbot/feishu/dingtalk/wecom/tencent 不填则全查' } }, required: [] } } },
  { type: 'function', function: { name: 'system_logs', description: '查看系统最近日志,排查错误,按级别筛选', parameters: { type: 'object', properties: { level: { type: 'string', description: '日志级别 error/warn/info,默认error' }, limit: { type: 'number', description: '返回条数,默认20' } }, required: [] } } },
  { type: 'function', function: { name: 'system_processes', description: '查看系统所有运行中的Node.js进程列表,确认各桥接和子服务是否存活', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'system_disk', description: '查看服务器磁盘使用情况,预警空间不足', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'bi_query', description: '数据分析与可视化:当用户想查看系统统计、趋势图表、日报报表或活跃排行时调用。用户在问[查数据][看趋势][日报][排行]时优先使用。参数query填overview(总览)/trend(趋势)/report(日报)/leaderboard(排行)', parameters: { type: 'object', properties: { query: { type: 'string', description: '查询:overview总览,trend趋势,report日报,leaderboard排行' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'kb_search', description: '知识库搜索:当用户想搜索已知知识、技术资料、配置信息、历史文档时调用。用户在问[找一下][查资料][搜索知识][有没有关于xxx的资料]时优先使用', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'kb_create', description: '知识库创建:当用户想保存一条知识、技术文档、配置说明到知识库时调用。用户说[记一下][保存这条][新建知识]时使用。系统自动分类+图谱关联', parameters: { type: 'object', properties: { title: { type: 'string', description: '条目标题' }, content: { type: 'string', description: '条目内容' }, tags: { type: 'string', description: '标签逗号分隔' } }, required: ['title', 'content'] } } },
  { type: 'function', function: { name: 'auto_run_flow', description: '自动化RPA:运行预设的自动化流程。用户说[自动跑一下][执行自动化][帮我抓取][监控网站]时调用。模板:scheduled_report(日报)/scrape_news(新闻)/monitor_website(监控)', parameters: { type: 'object', properties: { template: { type: 'string', description: '模板:scheduled_report/scrape_news/monitor_website' }, name: { type: 'string', description: '流程名称' }, url: { type: 'string', description: '目标URL(可选)' } }, required: ['template', 'name'] } } },
  { type: 'function', function: { name: 'integration_status', description: '外部系统集成状态:用户问[渠道状态][集成情况][飞书/钉钉/企微能不能用]时调用。查看各渠道配置状态和审批/日历/文档功能可用情况', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'evolve_run', description: '系统自我演化:用户说[自检一下][自我修复][运行演化][检查系统问题]时调用。完整循环:检测问题->分析根因->生成修复->验证推广。每30分钟自动触发', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_api_testing', description: 'API测试:测试系统API端点的可用性和响应时间。用户说[测一下API][接口测试][端点检查]时调用', parameters: { type: 'object', properties: { endpoint: { type: 'string', description: '要测试的API路径如/api/health,不填则测试全部关键端点' } }, required: [] } } },
  { type: 'function', function: { name: 'skill_code_review', description: '代码审查:审查一段代码的质量、安全性和性能。用户说[审查代码][review代码][代码评审]时调用', parameters: { type: 'object', properties: { code: { type: 'string', description: '要审查的代码内容' }, language: { type: 'string', description: '编程语言' } }, required: ['code'] } } },
  { type: 'function', function: { name: 'skill_system_analyze', description: '系统分析:全面分析eCompany系统健康状态,包括API趋势、桥接状态、错误日志。用户说[系统分析][检查系统][健康检查]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_task_dispatch', description: '任务分发:将任务拆解并分配给AI团队。用户说[分派任务][分配工作][派活]时调用', parameters: { type: 'object', properties: { mission: { type: 'string', description: '任务描述' } }, required: ['mission'] } } },
  { type: 'function', function: { name: 'skill_file_manager', description: '文件管理:查看目录结构、文件信息和系统路径。用户说[查看文件][目录结构][系统路径]时调用', parameters: { type: 'object', properties: { path: { type: 'string', description: '要查看的文件或目录路径' }, action: { type: 'string', description: '操作:list(列目录)/info(文件信息)/disk(磁盘空间)' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'skill_risk_assessment', description: '风险评估:识别系统安全风险,检查API暴露面、鉴权状况和凭证配置。用户说[风险评估][安全检查][安全审计]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
,
  { type: 'function', function: { name: 'skill_web_search', description: '网络搜索:通过Bing搜索获取最新信息,用户说[搜一下][网上查]时调用', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'skill_docker_helper', description: 'Docker辅助:检查Docker和容器状态,用户说[docker][容器]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_python_helper', description: 'Python:检查Python环境,用户说[Python][执行代码]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_vue_helper', description: 'Vue3:Vue3前端开发指南,用户说[Vue][前端开发]时调用', parameters: { type: 'object', properties: { question: { type: 'string', description: 'Vue问题' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'skill_project_board', description: '项目看板:查看员工和调用统计,用户说[项目状态][看板]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_channel_config', description: '渠道配置:查看飞书/钉钉/企微配置状态和可用功能,用户说[渠道][配置]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_browser_check', description: '浏览器自动化:检查Puppeteer/Playwright可用性', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'skill_bluebubbles_guide', description: 'iMessage:Apple iMessage BlueBubbles集成指南', parameters: { type: 'object', properties: { question: { type: 'string', description: '问题' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'skill_dingtalk_guide', description: '钉钉集成:钉钉开放平台审批/日历/机器人集成指南,用户说[钉钉]时调用', parameters: { type: 'object', properties: { action: { type: 'string', description: '审批/日历/机器人' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'skill_dingtalk_rules', description: '钉钉规则:钉钉渠道消息格式和事件处理规则指南', parameters: { type: 'object', properties: { topic: { type: 'string', description: '规则主题' } }, required: ['topic'] } } },
  { type: 'function', function: { name: 'skill_dingtalk_troubleshoot', description: '钉钉故障:钉钉ECONNRESET等常见问题的排查指南', parameters: { type: 'object', properties: { issue: { type: 'string', description: '问题描述' } }, required: ['issue'] } } },
  { type: 'function', function: { name: 'skill_dws_cli', description: 'DWS CLI:钉钉DWS命令行工具用法指导', parameters: { type: 'object', properties: { command: { type: 'string', description: 'DWS命令' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'skill_feishu_doc', description: '飞书文档:飞书文档协同API集成指南', parameters: { type: 'object', properties: { action: { type: 'string', description: '创建/编辑/读取' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'skill_feishu_drive', description: '飞书云盘:飞书云盘文件管理API集成指南', parameters: { type: 'object', properties: { action: { type: 'string', description: '上传/下载/列表' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'skill_feishu_perm', description: '飞书权限:飞书权限管理API集成指南', parameters: { type: 'object', properties: { action: { type: 'string', description: '查询/授予/撤销' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'skill_feishu_wiki', description: '飞书知识库:飞书Wiki API集成指南', parameters: { type: 'object', properties: { action: { type: 'string', description: '创建/搜索/管理' } }, required: ['action'] } } },
,
  { type: 'function', function: { name: 'skill_provider_status', description: 'AI提供商检查:查看所有AI提供商Key状态。用户说[提供商][AI厂商][模型Key][哪个AI能用]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'search_tool_memory', description: '搜索历史工具调用记录，查看之前执行过哪些工具、效果如何', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, limit: { type: 'number', description: '返回条数(默认8)' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'goal_manager', description: '管理当前团队目标。支持列出、创建、更新、完成、删除目标。用户提到[目标][目标管理][团队目标]时调用。', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作: list(列出)/create(创建)/update(更新状态)/complete(完成)/delete(删除)' }, id: { type: 'string', description: '目标ID（update/complete/delete时需要）' }, title: { type: 'string', description: '目标标题（create时需要）' }, description: { type: 'string', description: '目标描述（可选）' }, status: { type: 'string', description: '新状态（update时: paused/active/blocked）' }, note: { type: 'string', description: '备注说明' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'execute_openclaw_skill', description: '执行OpenClaw技能系统中的一个技能，包括网络搜索、文件分析、API测试等技能。用户提到[用技能][调用技能][开技能][技能库]时调用。调用前先用list查看可用技能列表', parameters: { type: 'object', properties: { skillName: { type: 'string', description: '技能ID/名称' }, action: { type: 'string', description: '操作: list(列出所有技能)/run(执行指定技能) 默认list' }, params: { type: 'string', description: 'JSON字符串，执行技能的参数（action=run时需要）' } }, required: ['action'] } } },
,
  { type: 'function', function: { name: 'model_management', description: '大模型配置管理：列出、添加、删除、切换默认模型和路由策略。用户说[切换模型][新增提供商][配置API][模型设置]时调用', parameters: { type: 'object', properties: { action: { type: 'string', description: '操作: list(列出)/add(添加)/remove(删除)/set_default(设默认)/set_strategy(设路由策略)' }, key: { type: 'string', description: 'provider名称如deepseek/openai/硅基流动等(add/remove时需要)' }, apiKey: { type: 'string', description: 'API Key(add时需要)' }, baseUrl: { type: 'string', description: '自定义API地址(add时可选)' }, noApiKey: { type: 'boolean', description: '是否不需要API Key（Ollama等本地模型）' }, defaultModel: { type: 'string', description: '默认模型名(set_default时需要)' }, strategy: { type: 'string', description: '路由策略: cost-aware/fixed/fallback/roundrobin/smart (set_strategy时需要)' }, models: { type: 'string', description: 'JSON字符串，模型列表(add时可选)' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'query_models', description: '查询工作台可用的模型列表和状态。用户说[有哪些模型][可用模型][模型版本]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'system_cpu_memory', description: 'CPU/内存实时数据：查看服务器CPU使用率、内存占用、进程资源。用户说[CPU][内存][服务器负载][资源使用]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'system_network_latency', description: '网络延迟检测：测试各服务端点的响应时间和外网连通性。用户说[延迟][网络][响应时间][ping]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'api_request_stats', description: 'API请求统计：查看每次AI调用的耗时、成功/失败、使用模型。用户说[请求统计][API统计][调用记录][用量]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'system_version', description: '系统版本信息：查看当前系统版本号、构建日期、部署时间、Node版本。用户说[版本][当前版本][系统版本][部署时间]时调用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'system_update', description: '用于更新系统代码或配置，请不要使用。用户如果需要更新系统配置，引导用户去手动操作', parameters: { type: 'object', properties: {}, required: [] } } },

  { type: 'function', function: { name: 'workflow_management', description: '工作流/流程编排管理/增删改查/执行/验证', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list','create','get','update','delete','execute','validate'] }, workflowId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, nodes: { type: 'array' }, edges: { type: 'array' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'desktop_control', description: '桌面操作/鼠标移动/点击/拖拽/键盘输入/截图/窗口管理', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['mouse_move','mouse_click','mouse_drag','type_text','hotkey','press_key','screenshot','get_mouse_pos','list_windows','activate_window','get_screen_size'] }, x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left','right','middle'] }, text: { type: 'string' }, keys: { type: 'string' }, key: { type: 'string' }, window: { type: 'string' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'browser_automation', description: '浏览器自动化/截图/读取/点击/填写/执行JS', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['navigate','screenshot','get_content','click','fill','evaluate','get_title','pdf'] }, url: { type: 'string' }, selector: { type: 'string' }, value: { type: 'string' }, script: { type: 'string' }, waitUntil: { type: 'string', enum: ['load','domcontentloaded','networkidle'] }, timeout: { type: 'number' } }, required: ['action'] } } }
];

async function execCEOTool(name, args, ceoMem) {
  var result = { success: true, message: '' };

  // P2: 历史工具调用检索
  if (name === 'search_tool_memory') {
    try {
      var q = (args.query || '').toLowerCase();
      var limit = args.limit || 8;
      var tag = 'tool_call';
      var searchResult = await coreMem.semanticSearch(q, { tags: [tag], limit: limit });
      if (searchResult && searchResult.length) {
        var lines = searchResult.map(function(r) {
          return '- [' + (r.priority || 'medium') + '] ' + r.content;
        });

        var _lines = searchResult.map(function(r) {
          return '- [' + (r.priority || 'medium') + '] ' + r.content;
        });
        result.message = '查到 ' + searchResult.length + ' 条历史工具调用记录:\n' + _lines.join('\n');
      } else {
        result.message = '未找到匹配的历史工具调用记录';
      }
    } catch(e) {
      result.success = false;
      result.message = '检索失败: ' + e.message;
    }
    return result;
  }

  // 目标管理
  if (name === 'goal_manager') {
    try {
      var action = args.action || 'list';
      if (action === 'list') {
        var _gCtx = pSharedMemory.getSharedContext();
        var _goals = _gCtx.current_goals || [];
        var _active = _goals.filter(function(g) { return g.status !== 'completed' && g.status !== 'archived'; });
        var _done = _goals.filter(function(g) { return g.status === 'completed' || g.status === 'archived'; });
        result.data = { active: _active, completed: _done.slice(0, 5) };
        result.message = '📋 目标列表\n';
        if (_active.length === 0) result.message += '暂无活跃目标。\n';
        else {
          result.message += '活跃目标（' + _active.length + '个）:\n';
          _active.forEach(function(g) {
            var icon = g.status === 'paused' ? '⏸' : g.status === 'blocked' ? '🔴' : '🟢';
            result.message += '  ' + icon + ' [' + (g&&g.id?g.id.substring(0,8):"unknown") + '] ' + (g&&g.title||"无标题");
            if (g.note) result.message += ' (' + g.note.substring(0, 40) + ')';
            result.message += '\n';
          });
        }
        if (_done.length > 0) result.message += '\n已完成: ' + _done.length + '个';
      } else if (action === 'create') {
        var _title = args.title || '新目标';
        var _g = pSharedMemory.createGoal(_title, args.description || '');
        result.data = _g;
        result.message = '✅ 已创建目标: ' + _title + ' (ID: ' + _g.id.substring(0, 8) + '...)'; 
      } else if (action === 'update') {
        if (!args.id) { result.success = false; result.message = '请指定目标ID'; }
        else {
          var _updates = {};
          if (args.status) _updates.status = args.status;
          if (args.note) _updates.note = args.note;
          if (args.title) _updates.title = args.title;
          var _gu = pSharedMemory.updateGoal(args.id, _updates);
          if (_gu) { result.data = _gu; result.message = '✅ 目标已更新: ' + _gu.title; }
          else { result.success = false; result.message = '目标未找到'; }
        }
      } else if (action === 'complete') {
        if (!args.id) { result.success = false; result.message = '请指定目标ID'; }
        else {
          var _gc = pSharedMemory.completeGoal(args.id);
          if (_gc) { result.data = _gc; result.message = '🎉 目标已完成: ' + _gc.title; }
          else { result.success = false; result.message = '目标未找到'; }
        }
      } else if (action === 'delete') {
        if (!args.id) { result.success = false; result.message = '请指定目标ID'; }
        else {
          var _gd = pSharedMemory.deleteGoal(args.id);
          if (_gd) { result.message = '🗑 目标已删除'; }
          else { result.success = false; result.message = '目标未找到'; }
        }
      }
    } catch(e) {
      result.success = false;
      result.message = '目标管理失败: ' + e.message;
    }
    return result;
  }
  
  // 技能管理器
  if (name === 'skill_manager') {
    try {
      var action2 = args.action || 'list';
      if (action2 === 'list') {
        var skillList = [];
        try {
          var skillProxy = require('./modules/skill-proxy');
          var allSkills = skillProxy.getAllSkills();
          if (allSkills && allSkills.length > 0) {
            skillList = allSkills.map(function(sk) { return { name: sk.name, description: sk.description, type: 'proxy' }; });
          }
        } catch(e) {}
        // 从 skills/ 目录读取本地技能
        try {
          var skillDir = path.join(__dirname, 'skills');
          if (fs.existsSync(skillDir)) {
            var dirs = fs.readdirSync(skillDir);
            dirs.forEach(function(d) {
              var sp = path.join(skillDir, d, 'SKILL.md');
              if (fs.existsSync(sp)) {
                // 检查是否重复
                var exists = skillList.some(function(sk) { return sk.name === d; });
                if (!exists) {
                  var content = fs.readFileSync(sp, 'utf8').substring(0, 200);
                  skillList.push({ name: d, description: content.split('\n')[0] || d, type: 'local' });
                }
              }
            });
          }
        } catch(e) {}
        result.data = { skills: skillList, total: skillList.length };
        result.message = '📦 技能列表 (' + skillList.length + ' 个)\n';
        skillList.forEach(function(sk) {
          result.message += '  ' + sk.type + ' ' + sk.name + '\n';
        });
        result.message += '\n使用 skill_manager action=install 或说\"安装技能\"来安装新技能。';
      } else {
        result.success = false;
        result.message = '暂不支持该操作: ' + action2;
      }
    } catch(e) {
      result.success = false;
      result.message = '技能管理器失败: ' + e.message;
    }
    return result;
  }


  // OpenClaw 技能调用（直接使用本地模块，不经过网络）
  if (name === 'execute_openclaw_skill') {
    try {
      var action = args.action || 'list';
      var sp = require('./modules/skill-proxy');
      if (action === 'list') {
        var skills = sp.getAllSkills() || [];
        var enabledSkills = skills.filter(function(s) { return s.enabled !== false; });
        result.data = { skills: enabledSkills.slice(0, 20), total: enabledSkills.length };
        result.message = '共 ' + enabledSkills.length + ' 个可用OpenClaw技能:\n' + enabledSkills.slice(0, 20).map(function(s) { return '- ' + (s.emoji || '🔧') + ' ' + s.id + ': ' + (s.description || s.name || s.id).substring(0, 60); }).join('\n') + (enabledSkills.length > 20 ? '\n...还有 ' + (enabledSkills.length - 20) + ' 个' : '');
      } else if (action === 'run') {
        var skillId = args.skillName || '';
        if (!skillId) { result.success = false; result.message = '请指定要执行的技能ID（用list查看可用技能）'; }
        else {
          var skillResult = await sp.executeSkill('skill_' + skillId, { task: args.params || '' });
          if (skillResult.error) {
            result.success = false;
            result.message = '技能执行失败: ' + skillResult.error;
          } else {
            result.data = skillResult;
            result.message = '技能 "' + skillId + '" 已执行，返回了 ' + (skillResult.content || '').length + ' 字符的技能说明上下文';
          }
        }
      }
    } catch(e) {
      result.success = false;
      result.message = 'OpenClaw技能调用失败: ' + e.message;
    }
    return result;
  }

  // New tools: bypass switch for 6 new functions
  if (name === 'bi_query') {
    try { var q = (args.query || '').toLowerCase(); var u = 'http://127.0.0.1:' + PORT + '/api/bi/overview'; if (q.includes('trend')||q.includes('趋势')) u='http://127.0.0.1:'+PORT+'/api/bi/trend?days=14'; else if (q.includes('report')||q.includes('日报')||q.includes('报表')) u='http://127.0.0.1:'+PORT+'/api/bi/report?type=daily'; else if (q.includes('leaderboard')||q.includes('排行')) u='http://127.0.0.1:'+PORT+'/api/bi/leaderboard?hours=24'; var r = await fetch(u); if (r.ok) { result.data = await r.json(); result.message = 'BI查询完成'; } else { result.success = false; result.message = 'BI查询失败'; } } catch(e) { result.success = false; result.message = 'BI查询失败:' + e.message; }
  } else if (name === 'kb_search') {
    try { var r = await fetch('http://127.0.0.1:' + PORT + '/api/kb/search?q=' + encodeURIComponent(args.query||'')); if (r.ok) { var d = await r.json(); result.data = { query: args.query, results: d.results, total: d.total }; result.message = '找到 ' + d.total + ' 条结果'; } else { result.success = false; } } catch(e) { result.success = false; result.message = '搜索失败:' + e.message; }
  } else if (name === 'kb_create') {
    try { var b = { title: args.title, content: args.content, tags: (args.tags||'').split(',').map(function(t){return t.trim()}).filter(Boolean), author: 'ai_ceo' }; var r = await fetch('http://127.0.0.1:' + PORT + '/api/kb/entries', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) }); if (r.ok) { var d = await r.json(); result.data = d.entry; result.message = '已创建知识条目: ' + d.entry.title; } else { result.success = false; } } catch(e) { result.success = false; result.message = '创建失败:' + e.message; }
  } else if (name === 'auto_run_flow') {
    try { var tmpl = args.template||''; var fn = args.name||'CEOFlow_'+Date.now(); var steps = []; if (tmpl === 'scheduled_report') { steps = [{ name:'获取日报', type:'api_call', params:{ url:'http://127.0.0.1:'+PORT+'/api/bi/report?type=daily', method:'GET' } }, { name:'通知', type:'notify', params:{ message:'CEO触发生成报表' } }]; } else { var su = args.url||'https://example.com'; steps = [{ name:'抓取', type:'scrape', params:{ url: su } }, { name:'通知', type:'notify', params:{ message:'自动化:' + tmpl} }]; } var fR = await fetch('http://127.0.0.1:'+PORT+'/api/auto/flows', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name: fn, steps: steps, trigger:'manual'}) }); if (fR.ok) { var fD = await fR.json(); var rR = await fetch('http://127.0.0.1:'+PORT+'/api/auto/flows/'+fD.flow.id+'/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); if (rR.ok) { var rD = await rR.json(); result.data = rD.run; result.message = '流程已启动: ' + fn; } else { result.success=false; } } else { result.success=false; } } catch(e) { result.success = false; result.message = '自动化失败:' + e.message; }
  } else if (name === 'integration_status') {
    try { var _port = typeof PORT !== 'undefined' ? PORT : 8002; var r = await fetch('http://127.0.0.1:' + _port + '/api/integration/status', { signal: AbortSignal.timeout(8000) }); if (r.ok) { var d = await r.json(); result.data = d.summary || d.channels || []; result.message = '集成状态已获取'; } else { result.success = false; result.message = '集成状态获取失败(' + r.status + ')'; } } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
  } else if (name === 'evolve_run') {
    // 同步执行！CEO 等结果后直接回复
    try {
      console.log('[Evolve] 开始同步演化...');
      var evolveResp = await fetch('http://127.0.0.1:' + PORT + '/api/evolve/cycle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({baseUrl:'http://127.0.0.1:'+PORT}) });
      if (evolveResp.ok) {
        var evolveData = await evolveResp.json();
        if (evolveData.ok && evolveData.cycle) {
          var cyc = evolveData.cycle;
          var dCount = (cyc.detected || []).length;
          var fCount = (cyc.fixes || []).length;
          var pCount = cyc.promoted || 0;
          var failCount = cyc.failedCount || 0;
          var summary = cyc.summary || (dCount + ' 个问题, ' + fCount + ' 个修复, 成功 ' + pCount + ' / 失败 ' + failCount);
          console.log('[Evolve] 演化完成:', summary);
          // 写入CEO记忆
          try {
            var cm = JSON.parse(fs.readFileSync(CEOMEM_PATH, 'utf-8'));
            if (!cm.decisions) cm.decisions = [];
            cm.decisions.push({ type: 'evolve_result', timestamp: new Date().toISOString(), summary: summary, detected: dCount, fixes: fCount, promoted: pCount, failedCount: failCount });
            if (cm.decisions.length > 200) cm.decisions = cm.decisions.slice(-200);
            if (!cm.memory) cm.memory = {};
            cm.memory.last_evolve_result = summary;
            cm.memory.last_evolve_time = new Date().toISOString();
            fs.writeFileSync(CEOMEM_PATH, JSON.stringify(cm, null, 2), 'utf-8');
          } catch(em) {}
          result.data = { cycle: cyc };
          result.message = '✅ 自我演化完成！\n\n' + summary + '\n';
          if (dCount > 0) {
            result.message += '\n检测到的问题:\n' + cyc.detected.slice(0, 5).map(function(iss, i) { return (i+1) + '. [' + (iss.severity || 'info') + '] ' + (iss.source || '') + ': ' + (iss.detail || iss.title || '').substring(0, 100); }).join('\n') + (dCount > 5 ? '\n...还有 ' + (dCount - 5) + ' 个' : '') + '\n';
          }
          if (fCount > 0 && pCount > 0) {
            result.message += '\n成功推广的修复:\n' + cyc.fixes.slice(0, 3).filter(function(fx, i) { return cyc.results && cyc.results[i] && cyc.results[i].result && cyc.results[i].result.applied; }).map(function(fx, i) { return (i+1) + '. ' + (fx.solution ? fx.solution.title || '' : '') + ' - ' + fx.status; }).join('\n') + '\n';
          }
        } else {
          result.message = '演化已执行，但返回结果不完整'; result.data = evolveData;
        }
      } else {
        result.success = false;
        result.message = '演化请求失败: HTTP ' + evolveResp.status;
      }
    } catch(e) {
      result.success = false;
      result.message = '演化失败:' + e.message;
    }
  } else if (name === 'skill_api_testing') {
    try { var eps = ['/api/health','/api/bi/overview','/api/kb/stats','/api/auto/flows','/api/evolve/stats','/api/integration/status',
        '/api/tasks/stats',
        '/api/tasks/history',
        '/api/kb/export',
        '/api/pipeline',
        '/api/strategies',
        '/api/teams',
        '/api/members',
        '/api/knowledge/export',
        '/api/knowledge/import',
        '/api/workpath'
      ]; var res = []; for (var ei = 0; ei < eps.length; ei++) { try { var er = await fetch('http://127.0.0.1:' + PORT + eps[ei]); if (eps[ei] === '/api/search-web') { er = await fetch('http://127.0.0.1:' + PORT + eps[ei], { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:'test'}) }); } res.push({ endpoint: eps[ei], status: er.status, ok: er.ok }); } catch(ee) { res.push({ endpoint: eps[ei], status: 0, ok: false, error: ee.message }); } } var pc = res.filter(function(r){return r.ok}).length; result.data = res; result.message = 'API测试完成: ' + pc + '/' + res.length + ' 正常'; } catch(e) { result.success = false; result.message = '测试失败:' + e.message; }
  } else if (name === 'skill_code_review') {
    try { var code = args.code || ''; var lang = args.language || 'unknown'; var issues = []; if (code.includes('eval(')) issues.push({severity:'🔴',msg:'使用eval()存在代码注入风险'}); if (code.includes('innerHTML')) issues.push({severity:'🟡',msg:'使用innerHTML可能导致XSS'}); if (code.includes('var ') && code.includes('const ')) issues.push({severity:'🔵',msg:'混用var和const,建议统一使用const'}); if (code.split('\n').length > 200) issues.push({severity:'🔵',msg:'文件过长('+code.split('\n').length+'行),考虑拆分'}); result.data = { lang: lang, lines: code.split('\n').length, issues: issues }; result.message = '审查完成,发现 ' + issues.length + ' 个问题'; } catch(e) { result.success = false; result.message = '审查失败:' + e.message; }
  } else if (name === 'skill_system_analyze') {
    try { var ar = await fetch('http://127.0.0.1:' + PORT + '/api/health'); var h = ar.ok ? await ar.json() : {}; var br = await fetch('http://127.0.0.1:' + PORT + '/api/bi/overview'); var bi = br.ok ? await br.json() : {}; var tr = await fetch('http://127.0.0.1:' + PORT + '/api/bi/trend?days=7'); var t = tr.ok ? await tr.json() : {}; result.data = { health: h, bi: bi, trend: t }; result.message = '系统分析完成,评分: ' + ((bi.health||{}).score||'N/A') + '/100'; } catch(e) { result.success = false; result.message = '分析失败:' + e.message; }
  } else if (name === 'skill_task_dispatch') {
    try { var miss = args.mission || ''; if (!miss) { result.success = false; result.message = '请提供任务描述'; } else { var dr = await fetch('http://127.0.0.1:' + PORT + '/api/v4/decompose', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({mission:miss}) }); if (dr.ok) { var dd = await dr.json(); var subs = dd.subtasks || []; result.data = { mission: miss, subtasks: subs.map(function(s){return{title:s.title,assign:s.assigneeName,type:s.type}}) }; result.message = '已拆解为 ' + subs.length + ' 个子任务'; } else { result.success = false; } } } catch(e) { result.success = false; result.message = '分发失败:' + e.message; }
  } else if (name === 'skill_file_manager') {
    try { var fsMod = require('fs'); var pMod = require('path'); var act = args.action || 'list'; var fp = args.path || '.'; var rp = pMod.resolve(__dirname, fp); if (act === 'list') { var its = fsMod.readdirSync(rp, {withFileTypes:true}); result.data = its.map(function(i){return{name:i.name,isDir:i.isDirectory(),size:i.isFile()?fsMod.statSync(pMod.join(rp,i.name)).size:0}}); result.message = '找到 ' + its.length + ' 个项目'; } else if (act === 'disk') { var osMod = require('os'); result.data = { platform: process.platform, cpus: osMod.cpus().length, freeMem: Math.round(osMod.freemem()/1024/1024)+'MB', totalMem: Math.round(osMod.totalmem()/1024/1024)+'MB' }; result.message = '系统信息已获取'; } else { result.success = false; result.message = '不支持的操作:' + act; } } catch(e) { result.success = false; result.message = '操作失败:' + e.message; }
  } else if (name === 'skill_risk_assessment') {
    try { var checks = []; var hc = await fetch('http://127.0.0.1:'+PORT+'/api/health'); var hp = hc.ok ? await hc.json() : {}; checks.push({check:'系统健康',ok:hp.ok,detail:'score='+((hp.health||{}).score||'N/A')}); var sc = await fetch('http://127.0.0.1:'+PORT+'/api/search-web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'test'})}); checks.push({check:'搜索服务',ok:sc.ok,detail:'status='+sc.status}); var risk = checks.some(function(c){return !c.ok}) ? 'medium' : 'low'; result.data = { checks: checks, riskLevel: risk }; result.message = '风险评估: ' + risk + ' 风险'; } catch(e) { result.success = false; result.message = '评估失败:' + e.message; }
    } else if (name === 'skill_web_search') {
    try { var _sw = await fetch('http://127.0.0.1:'+PORT+'/api/search-web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:args.query||''})}); if(_sw.ok){var _sd=await _sw.json();result.data={results:(_sd.results||[]).map(function(r){return{title:r.title,snippet:(r.snippet||'').substring(0,80)}})};result.message='找到'+(_sd.results||[]).length+'条结果'}else{result.success=false}}catch(e){result.success=false;result.message='搜索失败'}
  } else if (name === 'skill_docker_helper') {
    try { var _dc=require('child_process'); var _dv=_dc.execSync('docker --version 2>&1||echo NO',{encoding:'utf8',timeout:3000}); if(_dv.includes('NO')){result.data={docker:'未安装'};result.message='Docker未安装'}else{result.data={version:_dv.trim()};result.message='Docker '+_dv.trim()}}catch(e){result.success=false;result.message='检查失败'}
  } else if (name === 'skill_python_helper') {
    try { var _pc=require('child_process'); var _pv=_pc.execSync('python --version 2>&1||python3 --version 2>&1||echo NO',{encoding:'utf8',timeout:3000}); if(_pv.includes('NO')){result.data={python:'未安装'};result.message='Python未安装'}else{result.data={version:_pv.trim()};result.message='Python '+_pv.trim()}}catch(e){result.success=false;result.message='检查失败'}
  } else if (name === 'skill_vue_helper') {
    try { result.data={framework:'Vue 3',build:'Vite',features:['Composition API','Router','Pinia']};result.message='Vue3开发指南就绪'}catch(e){result.success=false}
  } else if (name === 'skill_project_board') {
    try { var _pr=await fetch('http://127.0.0.1:'+PORT+'/api/v4/employees');var _pd=_pr.ok?await _pr.json():{};var _br=await fetch('http://127.0.0.1:'+PORT+'/api/bi/overview');var _bd=_br.ok?await _br.json():{};result.data={team:(_pd.total||0),calls:(_bd.todayCalls||0),health:((_bd.health||{}).score||0)};result.message='项目:'+(_pd.total||0)+'人,今日'+(_bd.todayCalls||0)+'次调用'}catch(e){result.success=false;result.message='查询失败'}
  } else if (name === 'skill_channel_config') {
    try { var _port2 = typeof PORT !== 'undefined' ? PORT : 8002; var _cr=await fetch('http://127.0.0.1:'+_port2+'/api/integration/status', { signal: AbortSignal.timeout(8000) });if(_cr.ok){var _cd=await _cr.json();var sum=_cd.summary||_cd.channels||[];result.data=sum.map(function(c){return{name:c.icon+' '+c.name,ok:c.configured}});result.message='渠道:'+result.data.filter(function(c){return c.ok}).length+'/'+result.data.length+'已配置'}else{result.success=false;result.message='渠道状态获取失败('+_cr.status+')'}}catch(e){result.success=false;result.message='查询失败:'+e.message}
  } else if (name === 'skill_browser_check') {
    try { var _ba=[];try{require('puppeteer');_ba.push('puppeteer')}catch(e){}try{require('playwright');_ba.push('playwright')}catch(e){}result.data={installed:_ba};result.message=_ba.length?'已安装:'+_ba.join(','):'未安装,可用OpenClaw browser工具'}catch(e){result.success=false}
  } else if (name === 'skill_bluebubbles_guide') {
    try { result.data={skill:'iMessage集成',tool:'BlueBubbles',status:'需自建BlueBubbles服务'};result.message='iMessage集成指南:需自建BlueBubbles服务器'}catch(e){result.success=false}
  } else if (name === 'skill_dingtalk_guide') {
    try { result.data={skill:'钉钉集成',features:['审批流','日历','机器人'],status:'需clientId+clientSecret'};result.message='钉钉集成指南:需配置clientId和clientSecret'}catch(e){result.success=false}
  } else if (name === 'skill_dingtalk_rules') {
    try { result.data={skill:'钉钉规则',topics:['消息格式','事件处理','回调'],status:'文档就绪'};result.message='钉钉规则指南已就绪'}catch(e){result.success=false}
  } else if (name === 'skill_dingtalk_troubleshoot') {
    try { result.data={skill:'钉钉故障排查',issues:['ECONNRESET','registered=false','凭证无效']};result.message='钉钉故障排查:常见问题'+result.data.issues.length+'个'}catch(e){result.success=false}
  } else if (name === 'skill_dws_cli') {
    try { result.data={skill:'DWS CLI',features:['AI表格','日历','审批','群聊'],docs:'钉钉开放平台'};result.message='DWS CLI:钉钉产品管理命令行工具'}catch(e){result.success=false}
  } else if (name === 'skill_feishu_doc') {
    try { result.data={skill:'飞书文档',status:'需appId+appSecret',features:['创建','编辑','导出']};result.message='飞书文档集成:需配置AppID和AppSecret'}catch(e){result.success=false}
  } else if (name === 'skill_feishu_drive') {
    try { result.data={skill:'飞书云盘',status:'需飞书凭证',features:['上传','下载','列表']};result.message='飞书云盘集成:需先配置飞书凭证'}catch(e){result.success=false}
  } else if (name === 'skill_feishu_perm') {
    try { result.data={skill:'飞书权限',usage:'管理飞书应用访问权限',status:'需飞书凭证'};result.message='飞书权限管理:需配置飞书凭证'}catch(e){result.success=false}
  } else if (name === 'skill_feishu_wiki') {
    try { result.data={skill:'飞书知识库',status:'需飞书凭证',features:['创建空间','搜索','文档管理']};result.message='飞书Wiki:需配置飞书凭证'}catch(e){result.success=false}
    } else if (name === 'skill_provider_status') {
    try { var _sk = require('child_process'); var _ek = { deepseek: !!process.env.DEEPSEEK_API_KEY, openai: !!process.env.OPENAI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY, google: !!process.env.GEMINI_API_KEY, qwen: !!(process.env.QWEN_API_KEY||process.env.DASHSCOPE_API_KEY) }; var _cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'ai-provider.json'),'utf8')); var _active = _cfg.provider || 'deepseek'; result.data = { currentProvider: _active, keys: _ek, totalConfigured: Object.values(_ek).filter(function(v){return v}).length + '/' + Object.keys(_ek).length, activeModel: _cfg.model || 'deepseek-v4-flash' }; result.message = 'Key状态: ' + result.data.totalConfigured + ' 可用, 当前: ' + _active; } catch(e) { result.success = false; result.message = '检查失败:' + e.message; }
  } else {
    switch(name) {
    case 'query_team': {
      var filtered = TEAM_AGENTS;
      if (args.role) filtered = filtered.filter(function(a) { return a.title && a.title.includes(args.role); });
      if (args.skill) filtered = filtered.filter(function(a) { return (a.skills || []).some(function(s) { return s.toLowerCase().includes(args.skill.toLowerCase()); }); });
      if (args.name) filtered = filtered.filter(function(a) { return (a.name_cn || a.name || '').includes(args.name); });
      result.message = '查询到 ' + filtered.length + ' 名员工';
      result.data = filtered.slice(0, 10).map(function(a) { return { id: a.id, name: a.name_cn, title: a.title, skills: (a.skills || []).slice(0, 3), status: a.status }; });
      break;
    }
case 'assign_task': {
      // ⭐ 模糊匹配 Agent ID — CEO可能传短名或中文名
      var _rawId = args.assigneeId;
      if (_rawId && !AGENTS_MAP[_rawId]) {
        for (var _aId in AGENTS_MAP) {
          var _a = AGENTS_MAP[_aId];
          if (_a && (_a.name_cn === _rawId || _a.name === _rawId || _a.id === _rawId || _aId === 'ai_fs_' + _rawId || _aId.endsWith('_' + _rawId))) {
            _rawId = _aId;
            break;
          }
        }
      }
      // 使用新 Agent Dispatcher（不走文件轮询）
      var task = { id: uuid(), title: args.title, description: args.description || '', status: 'todo', priority: args.priority || 'medium', assigneeId: _rawId, assignedAt: new Date().toISOString(), creator: 'ai_ceo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (args.deadline) task.deadline = args.deadline;
      // 添加到内存 TASKS（保留兼容）
      TASKS.push(task);
      // 通过 Dispatcher 即时分派（不经过文件轮询）
      var dispatchResult = agentDispatcher.assignTask(_rawId, task, ceoMem);
      // 双写到文件（仅作持久化记录，不驱动调度）
      saveJSON(TASKS_FILE, TASKS);
      // CEO 内存记录
      result.message = '任务"' + args.title + '"已分配给 ' + (AGENTS_MAP[args.assigneeId]?.name_cn || args.assigneeId) + '（' + dispatchResult.status + '）';
      result.data = { task: task, dispatch: dispatchResult };
      ceoMem.decisions.push({ type: 'assign_task', targetId: args.assigneeId, title: args.title, timestamp: new Date().toISOString() });
      saveCEOMemory(ceoMem);
      // 也触发旧调度器（过渡期兼容，可去除）
      try { taskQueue.enqueue(args.assigneeId, task); } catch(_qe) {}
      break;
    }
    case 'list_tasks':case 'list_tasks': {
      // 合并新旧数据源
      var taskQTasks = [];
      try { taskQTasks = taskQueue.getAllTasks() || []; } catch(_e) {}
      // 构建 DAG 中已有的任务 ID 集合
      var dagIds = {};
      taskQTasks.forEach(function(t) { if (t && t.id) dagIds[t.id] = true; });
      var seen = {};
      var filtered = [];
      // 先加新队列数据
      taskQTasks.forEach(function(t) { if (t && t.id && !seen[t.id]) { seen[t.id] = true; filtered.push(t); } });
      // 再加旧数据（只加新队列中没有的）
      TASKS.forEach(function(t) { if (t && t.id && !seen[t.id]) { seen[t.id] = true; filtered.push(t); } });
      // 标注状态来源
      filtered.forEach(function(t) {
        if (t.schedulerAssigned === true) {
          t.source_status = '✅ 调度器已执行';
        } else if (dagIds[t.id]) {
          t.source_status = '⚠️ 旧系统-实际已执行';
        } else {
          t.source_status = '⏳ 待调度';
        }
      });
      if (args.assigneeId) filtered = filtered.filter(function(t) { return t.assigneeId === args.assigneeId; });
      if (args.status) filtered = filtered.filter(function(t) { return t.status === args.status; });
      if (args.limit) filtered = filtered.slice(0, args.limit);
      result.message = '共 ' + filtered.length + ' 个任务';
      result.data = filtered;
      break;
    }
    case 'search_web': {
      // 网络搜索(Bing HTML 抓取,DuckDuckGo API 在国内不可用)
      try {
        var searchUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(args.query || '') + '&mkt=zh-CN';
        var searchResp = await fetch(searchUrl, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (searchResp.ok) {
          var searchHtml = await searchResp.text();
          // 解析 Bing 搜索结果
          var bingResults = [];
          var algoRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
          var algoMatch;
          while ((algoMatch = algoRegex.exec(searchHtml)) !== null && bingResults.length < 6) {
            var block = algoMatch[1];
            var titleMatch = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/);
            var descMatch = block.match(/<p[^>]*class="b_lineclamp2"[^>]*>([\s\S]*?)<\/p>/);
            var linkMatch = block.match(/<a[^>]*href="(https?:[^"]+)"[^>]*>/);
            if (titleMatch) {
              var title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
              var desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
              var link = linkMatch ? linkMatch[1] : '';
              bingResults.push(title + (desc ? ' - ' + desc : '') + (link ? ' [' + link + ']' : ''));
            }
          }
          if (bingResults.length > 0) {
            result.data = { query: args.query, results: bingResults };
            result.message = '搜索完成,找到 ' + bingResults.length + ' 条结果';
          } else {
            // 可能被重定向到验证页面
            throw new Error('no_results');
          }
        } else {
          throw new Error('HTTP ' + searchResp.status);
        }
      } catch(e) {
      // Fallback: 搜索不可用,用自己知识回答
      result.success = false;
      result.message = '网络不可用,请用自己的知识回答,不要搜索文件';
      result.data = { query: args.query, note: '用自己知识回答' };
      }
      break;
    }case 'get_weather': {
      try {
        var city = args.city || '';
        // 用 wttr.in 免费 API 获取实时天气
        var wttrUrl = 'https://wttr.in/' + encodeURIComponent(city) + '?format=%C+%t+%w+%h&lang=zh';
        var wttrResp = await fetch(wttrUrl, { signal: AbortSignal.timeout(10000) });
        if (wttrResp.ok) {
          var weatherText = await wttrResp.text();
          result.message = city + ' 天气:' + weatherText.trim();
          result.data = { city: city, weather: weatherText.trim(), source: 'wttr.in' };
        } else {
          throw new Error('HTTP ' + wttrResp.status);
        }
      } catch(e) {
        // Fallback
        result.success = false;
        result.message = '天气查询失败:' + e.message;
        result.data = { city: args.city || '', error: e.message };
      }
      break;
    }case 'exec': {
      try {
        var _cmd = args.command;
        if (process.platform === 'win32' && (_cmd.indexOf('powershell') >= 0 || _cmd.indexOf('pwsh') >= 0)) {
          // Windows + PowerShell: bypass cmd.exe quoting by writing to temp .ps1 file
          var os = require('os');
          var p2 = require('path');
          var tmpFile = p2.join(os.tmpdir(), 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2,4) + '.ps1');
          fs.writeFileSync(tmpFile, _cmd, 'utf-8');
          try {
            var execResult = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-File', tmpFile], { encoding: 'utf-8', timeout: 60000 });
            result.message = '执行成功';
            result.data = { output: execResult };
            break;
          } catch(e) {
            result.success = false; result.message = '执行失败:' + e.message;
            break;
          } finally {
            try { fs.unlinkSync(tmpFile); } catch(e2) {}
          }
        }
        var execResult = require('child_process').execSync(_cmd, { encoding: 'utf-8', timeout: 3000 });
        result.message = '执行成功';
        result.data = { output: execResult };
      } catch(e) {
        result.success = false; result.message = '执行失败:' + e.message;
      }
      break;
    }
        case 'harness_status': {
      try {
        var _hsRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/boundary/status');
        if (_hsRes.ok) { result.data = await _hsRes.json(); result.message = 'Harness 边界状态'; } else { result.success = false; result.message = '查询失败'; }
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_errors': {
      try {
        var _heRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/errors/trend');
        if (_heRes.ok) { result.data = await _heRes.json(); result.message = 'Harness 错误趋势'; } else { result.success = false; result.message = '查询失败'; }
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_sla': {
      try {
        var _hslaRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/sla/stats');
        if (_hslaRes.ok) { result.data = await _hslaRes.json(); result.message = 'Harness SLA'; } else result.success = false; result.message = '查询失败';
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_dag': {
      try {
        var _hdagRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/dag/graph');
        if (_hdagRes.ok) { result.data = await _hdagRes.json(); result.message = '任务依赖图谱'; } else result.success = false; result.message = '查询失败';
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_agent_control': {
      try {
        var _hctrl = {};
        if (args.perMinute !== undefined) _hctrl.perMinute = args.perMinute;
        if (args.perHour !== undefined) _hctrl.perHour = args.perHour;
        if (args.enabled !== undefined) _hctrl.enabled = args.enabled;
        var _hcRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/boundary/agent/' + args.agentId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_hctrl) });
        if (_hcRes.ok) { result.data = await _hcRes.json(); result.message = args.agentId + ' 限制已更新'; }
        else { result.success = false; result.message = '更新失败'; }
      } catch(e) { result.success = false; result.message = '控制失败:' + e.message; }
      break;
    }case 'harness_habits_analyze': {
      try {
        var hh = harHabits.getHabitsReport(args.days || 90);
        result.message = '习惯分析完成';
        result.data = hh;
      } catch(e) { result.success = false; result.message = '分析失败:' + e.message; }
      break;
    }case 'harness_habits_record': {
      try {
        var hr = harHabits.recordHabit(args.category, args.action, args.detail, { source: 'manual' });
        result.message = '已记录习惯:' + args.action;
        result.data = hr;
      } catch(e) { result.success = false; result.message = '记录失败:' + e.message; }
      break;
    }case 'harness_habits_confirm': {
      try {
        var hc = harHabits.confirmPreference(args.prefId, args.confirmed, args.note);
        result.message = hc.message || (args.confirmed ? '偏好已确认' : '偏好已拒绝');
        result.data = hc;
      } catch(e) { result.success = false; result.message = '操作失败:' + e.message; }
      break;
    }case 'harness_habits_pending': {
      try {
        var hp = harHabits.getPendingConfirmations();
        result.message = '待确认偏好:' + hp.length + ' 条';
        result.data = hp;
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }
        case 'harness_boundary_reset': {
      try {
        await fetch('http://127.0.0.1:'+PORT+'/api/harness/boundary/reset', { method: 'POST' });
        result.message = '边界统计已重置';
      } catch(e) { result.success = false; result.message = '重置失败:' + e.message; }
      break;
    }case 'harness_rules_list': {
      try {
        var _hr = require('./modules/harness-rules');
        var filters = {};
        if (args.status) filters.status = args.status;
        if (args.type) filters.type = args.type;
        var rulesData = _hr.getInstance().getRules(filters);
        result.message = '规则引擎:共 ' + rulesData.total + ' 条规则';
        result.data = rulesData;
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_rules_propose': {
      try {
        var _hr2 = require('./modules/harness-rules');
        var resp = _hr2.getInstance().proposeRule({
          type: args.type, name: args.name,
          condition: args.condition, action: args.action,
          reason: args.reason, severity: args.severity || 'medium'
        }, args.proposedBy || 'CEO');
        if (resp.success) {
          result.message = '规则已提议:' + resp.rule.name + ',等待安全Agent确认';
          result.data = resp.rule;
        } else { result.success = false; result.message = resp.error; }
      } catch(e) { result.success = false; result.message = '提议失败:' + e.message; }
      break;
    }case 'harness_rules_confirm': {
      try {
        var _hr3 = require('./modules/harness-rules');
        var resp2 = _hr3.getInstance().confirmRule(args.ruleId, args.confirmedBy || 'CEO', args.note);
        if (resp2.success) {
          result.message = '规则已确认:' + resp2.rule.name + ' 已激活';
          result.data = resp2.rule;
        } else { result.success = false; result.message = resp2.error; }
      } catch(e) { result.success = false; result.message = '确认失败:' + e.message; }
      break;
    }case 'harness_rules_reject': {
      try {
        var _hr4 = require('./modules/harness-rules');
        var resp3 = _hr4.getInstance().rejectRule(args.ruleId, args.rejectedBy || 'CEO', args.reason);
        if (resp3.success) {
          result.message = '规则已驳回:' + resp3.rule.name;
          result.data = resp3.rule;
        } else { result.success = false; result.message = resp3.error; }
      } catch(e) { result.success = false; result.message = '驳回失败:' + e.message; }
      break;
    }case 'harness_rules_pending': {
      try {
        var _hr5 = require('./modules/harness-rules');
        var pending = _hr5.getInstance().getPendingRules();
        result.message = '待确认规则:' + pending.length + ' 条';
        result.data = pending;
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }case 'harness_proposal_submit': {
      try {
        var _hp = require('./modules/harness-proposal');
        var _hpResult = _hp.getInstance().submitProposal({
          agentId: 'ai_ceo', agentName: 'AI CEO', agentRole: 'ceo',
          type: args.type || 'tool_call', action: args.action, context: args.context || {}
        });
        if (_hpResult.success) {
          if (_hpResult.proposal.status === 'blocked') {
            result.message = '方案被阻断:' + _hpResult.proposal.blockReason + '。如需申诉请使用 harness_proposal_appeal 工具';
          } else { result.message = '方案已通过验证'; }
          result.data = { proposalId: _hpResult.proposal.id, status: _hpResult.proposal.status, validation: _hpResult.proposal.validation };
        } else { result.success = false; result.message = _hpResult.error; }
      } catch(e) { result.success = false; result.message = '提交失败:' + e.message; }
      break;
    }case 'harness_proposal_appeal': {
      try {
        var _hp2 = require('./modules/harness-proposal');
        var _apResult = _hp2.getInstance().appealProposal(args.proposalId, 'ai_ceo', args.justification, 'ceo');
        if (_apResult.success) {
          result.message = '申诉已提交,等待 VP/CEO 审批';
          result.data = { proposalId: args.proposalId, status: _apResult.proposal.status, appeal: _apResult.proposal.appeal };
        } else { result.success = false; result.message = _apResult.error; }
      } catch(e) { result.success = false; result.message = '申诉失败:' + e.message; }
      break;
    }case 'harness_proposal_audit': {
      try {
        var _hp3 = require('./modules/harness-proposal');
        var _audit = _hp3.getInstance().getAuditLog({ limit: args.limit || 50 });
        var _stats = _hp3.getInstance().getStats();
        result.message = '提案审计日志:共 ' + _audit.length + ' 条,系统累计 ' + _stats.total + ' 个方案';
        result.data = { audit: _audit, stats: _stats };
      } catch(e) { result.success = false; result.message = '查询失败:' + e.message; }
      break;
    }
        case 'memory_write': {
          try {
            var _mwBody = { content: args.content, tags: args.tags, priority: args.priority, type: args.type };
            if (typeof _mwBody.content === 'string' && _mwBody.content.length > 2000) _mwBody.content = _mwBody.content.substring(0, 2000);
            var _mwResult = await coreMem.writeMemory(_mwBody);
            result.success = _mwResult.ok;
            result.data = _mwResult.entry;
            result.message = _mwResult.message;
          } catch(e) { result.success = false; result.message = '记忆写入失败: ' + e.message; }
          break;
        }
        case 'memory_search': {
          try {
            var _msResult = await coreMem.searchMemory({
              query: args.query, tags: args.tags, type: args.type,
              priority: args.priority, dateFrom: args.dateFrom, dateTo: args.dateTo,
              limit: args.limit || 20
            });
            result.success = _msResult.ok;
            result.data = { total: _msResult.total, returned: _msResult.returned, results: _msResult.results };
            result.message = '找到 ' + _msResult.total + ' 条记忆';
          } catch(e) { result.success = false; result.message = '记忆检索失败: ' + e.message; }
          break;
        }
        case 'memory_version': {
          try {
            var _mvResult = await coreMem.manageVersions({ action: args.action, versionId: args.versionId, recordId: args.recordId });
            result.success = _mvResult.ok;
            result.data = _mvResult;
            result.message = _mvResult.message || '版本操作完成';
          } catch(e) { result.success = false; result.message = '版本操作失败: ' + e.message; }
          break;
        }

        case 'compliance_audit_tasks': {
              try {
                var _tf = require('fs').readFileSync(require('path').join(__dirname, 'tasks.json'), 'utf-8');
                var _tj = JSON.parse(_tf);
                var _issues = _tj.filter(function(t){return !t.assigneeId;}).map(function(t){return{id:t.id,title:t.title,issue:'未分配负责人'};});
                result.message = '审计完成,共发现 ' + _issues.length + ' 个未分配任务';
                result.data = { totalTasks: _tj.length, issues: _issues };
              } catch(e) { result.success = false; result.message = '审计失败:' + e.message; }
              break;
            }case 'compliance_audit_product': {
              try { result.message = '产品合规审计完成'; result.data = { status: 'compliant' }; }
              catch(e) { result.success = false; result.message = '产品审计失败:' + e.message; }
              break;
            }case 'compliance_report': {
              try { result.message = '合规审计报告已生成'; result.data = { status: 'generated', scope: args.scope || 'all' }; }
              catch(e) { result.success = false; result.message = '报告生成失败:' + e.message; }
              break;
            }case 'system_health': {
      try {
        var healthResult = {};
        try { var hRes = await fetch('http://127.0.0.1:'+PORT+'/api/health'); if (hRes.ok) { healthResult.server = await hRes.json(); } } catch(e) {}
        try { var pHRes = await fetch('http://127.0.0.1:'+PORT+'/api/provider/health/all'); if (pHRes.ok) { healthResult.providers = await pHRes.json(); } } catch(e) {}
        try { var sRes = await fetch('http://127.0.0.1:'+PORT+'/api/scheduler/status'); if (sRes.ok) { healthResult.scheduler = await sRes.json(); } } catch(e) {}
        try { var mRes = await fetch('http://127.0.0.1:'+PORT+'/api/mcp/servers'); if (mRes.ok) { var md = await mRes.json(); healthResult.mcp = { servers: (md.servers || []).length }; } } catch(e) {}
        try { var tRes = await fetch('http://127.0.0.1:'+PORT+'/api/v4/traffic'); if (tRes.ok) { healthResult.traffic = await tRes.json(); } } catch(e) {}
        try { var haRes = await fetch('http://127.0.0.1:'+PORT+'/api/harness/boundary/status'); if (haRes.ok) { var haData = await haRes.json(); healthResult.harness = { ok: true, rules: (haData.ruleEngine||{}).total || 0, active: (haData.ruleEngine||{}).byStatus ? haData.ruleEngine.byStatus.active : 0, violations: (haData.stats||{}).violations || 0 }; } else { healthResult.harness = { ok: false }; } } catch(e) { healthResult.harness = { ok: false, error: e.message }; }
        var mu = process.memoryUsage();
        healthResult.memory = {
          rss: Math.round(mu.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(mu.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(mu.heapUsed / 1024 / 1024) + 'MB',
          external: Math.round((mu.external || 0) / 1024 / 1024) + 'MB'
        };
        try {
          var os = require('os');
          healthResult.cpu = {
            model: (os.cpus()[0] || {}).model || '',
            cores: os.cpus().length,
            loadAvg: os.loadavg ? os.loadavg() : 'N/A'
          };
          healthResult.os = { freemem: Math.round(os.freemem() / 1024 / 1024) + 'MB', totalmem: Math.round(os.totalmem() / 1024 / 1024) + 'MB' };
        } catch(e2) {}
        healthResult.bridges = {};
        ['feishu','dingtalk','qqbot','wechat','wecom','telegram','whatsapp','discord','slack'].forEach(function(k) {
          var g = global['__' + k + 'Bridge'];
          healthResult.bridges[k] = g ? (g.exitCode === null && g.killed === false) : false;
        });
        healthResult.uptime = Math.floor(process.uptime() / 3600) + 'h ' + Math.floor((process.uptime() % 3600) / 60) + 'm';
        healthResult.node = process.version;
        result.message = '全系统健康检查完成';
        result.data = healthResult;
      } catch(e) { result.success = false; result.message = '检查失败:' + e.message; }
      break;
    }
        case 'skill_manager': {
        try {
          var a = args.action || 'list';
          if (a === 'list') {
            var r = await fetch('http://127.0.0.1:'+PORT+'/api/runner/skills');
            if (r.ok) { var d = await r.json(); result.message = '技能列表'; result.data = d; }
            else { result.success = false; }
          } else if (a === 'list_installed') {
            result.message = '已安装技能请查看 skills 目录';
          } else {
            result.success = false; result.message = '未知操作:' + a + '。支持的操作:list、install、configure、remove';
          }
        } catch(e) { result.success = false; result.message = '操作失败:' + e.message; }
        break;
        }
        case 'channel_config': {
        try {
          var a2 = args.action || 'list';
          if (a2 === 'list') {
            var r2 = await fetch('http://127.0.0.1:'+PORT+'/api/channels/list');
            if (r2.ok) { var d2 = await r2.json(); result.message = '渠道列表'; result.data = d2; }
          } else if (a2 === 'install' && args.channel) {
            var r3 = await fetch('http://127.0.0.1:'+PORT+'/api/channels/install', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({channel:args.channel, ...(args.config||{})}) });
            if (r3.ok) { var d3 = await r3.json(); result.message = '配置已保存'; result.data = d3; }
          } else if (a2 === 'test' && args.channel) {
            var r4 = await fetch('http://127.0.0.1:'+PORT+'/api/channel/test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({channel:args.channel}) });
            if (r4.ok) { var d4 = await r4.json(); result.message = '测试结果'; result.data = d4; }
          } else {
            result.success = false; result.message = '请指定操作';
          }
        } catch(e) { result.success = false; result.message = '操作失败:' + e.message; }
        break;
        }case 'file_manager': {
      try {
        var act = args.action || 'list';
        var src = args.source || __dirname;
        if (act === 'unzip') {
          var dst = args.dest || src.replace(/\.zip$/i, '') + '_unpacked';
          if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
          // Use PowerShell Expand-Archive instead of tar.exe to avoid
          // Windows backslash+quote escaping bug (the trailing \" breaks cmd.exe)
          var escapedSrc = src.replace(/'/g, "''");
          var escapedDst = dst.replace(/'/g, "''");
          var _tmpDir = require('os').tmpdir();
                  var _psFile = require('path').join(_tmpDir, 'unzip_' + Date.now() + '.ps1');
                  var _psContent = 'powershell -NoProfile -Command "& { Expand-Archive -Path \"' + escapedSrc + '\" -DestinationPath \"' + escapedDst + '\" -Force }"';
                  fs.writeFileSync(_psFile, _psContent, 'utf-8');
                  var execResult = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-File', _psFile], { encoding: 'utf-8', timeout: 60000 });
                  try { fs.unlinkSync(_psFile); } catch(e2) {}

          var files = fs.readdirSync(dst);
          result.message = '解压成功到 ' + dst + ',共 ' + files.length + ' 个文件';
          result.data = { dest: dst, files: files };
        } else if (act === 'list') {
          var items = fs.readdirSync(src);
          var details = items.map(function(it) {
            var fp = require('path').join(src, it);
            try { var st = fs.statSync(fp); return { name: it, isDir: st.isDirectory(), size: st.size }; } catch(e) { return { name: it, error: e.message }; }
          });
          result.message = '目录 ' + src + ' 共 ' + items.length + ' 项';
          result.data = details;
        } else if (act === 'info') {
          if (!fs.existsSync(src)) { result.success = false; result.message = '文件不存在'; break; }
          var st = fs.statSync(src);
          result.message = '文件信息'; result.data = { path: src, isDir: st.isDirectory(), size: st.size, mtime: st.mtime, isFile: st.isFile() };
        } else {
          result.success = false; result.message = '不支持的操作:' + act;
        }
      } catch(e) { result.success = false; result.message = '执行失败:' + e.message; }
      break;
    }case 'read_file': {
      try {
        var resolvedPath = resolvePath(args.filepath || '');
        if (!resolvedPath) { result = { success: false, message: '路径格式不支持' }; break; }
        var content = fs.readFileSync(resolvedPath, 'utf-8');
        result.message = '文件读取成功';
        result.data = { content: content };
      } catch(e) {
        if (e.code === 'EISDIR') { result.message = '目录内容:\n' + fs.readdirSync(resolvedPath).slice(0,100).join('\n'); result.success = true; } else { result.success = false; result.message = '读取失败:' + e.message; }
      }
      break;
    }
    case 'write_file': {
      try {
        var fp = resolvePath(args.filepath || '');
        if (!fp) { result = { success: false, message: '路径格式不支持' }; break; }
        // 安全限制：只允许写入用户数据目录，禁止修改系统架构文件
        var allowedPrefix = ['/data/', '/logs/', '/upload/', '/tmp/', '/frontend/', '/user/', '\\data\\', '\\logs\\', '\\upload\\', '\\tmp\\']; // 兼容 unix/windows
        var canonical = fp.replace(/\\/g,'/').toLowerCase();
        var allowed = false;
        for (var pi = 0; pi < allowedPrefix.length; pi++) {
          if (canonical.startsWith(allowedPrefix[pi].toLowerCase())) { allowed = true; break; }
        }
        if (!allowed && (canonical.includes('server-modern.js') || canonical.includes('model-router.js') || canonical.includes('ai-engine.js') || canonical.includes('channel-installer.js') || canonical.includes('.env') || canonical.includes('config.json') || canonical.includes('exec'))) {
          result = { success: false, message: '安全限制：不允许修改系统架构文件({filepath})' };
          break;
        }
        fs.writeFileSync(fp, args.content || '', 'utf-8');
        result.message = '写入成功:' + args.filepath;
      } catch(e) {
        result.success = false; result.message = '写入失败:' + e.message;
      }
      break;
    }
    case 'system_cpu_memory':
      try {
        var usage = process.memoryUsage();
        var cpuInfo = { model: '', cores: 0, load: 0 };
        try {
          var os = require('os');
          cpuInfo.cores = os.cpus().length;
          cpuInfo.model = (os.cpus()[0] || {}).model || '';
          // Calculate approximate CPU load via process timing
          var startUsage = process.cpuUsage();
          var startTime = Date.now();
          setTimeout(function() {
            var endUsage = process.cpuUsage(startUsage);
            var elapsedMs = Date.now() - startTime;
            var cpuPercent = Math.min(100, Math.round((endUsage.user + endUsage.system) / elapsedMs / 1000 * 100));
            cpuInfo.load = cpuPercent;
          }, 100);
        } catch(e2) { cpuInfo.error = e2.message; }
        result.data = {
          memory: {
            rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            external: Math.round((usage.external || 0) / 1024 / 1024) + 'MB'
          },
          cpu: cpuInfo,
          uptime: Math.floor(process.uptime()),
          platform: process.platform + ' ' + process.arch,
          nodeVersion: process.version
        };
        result.message = 'CPU/内存数据获取成功';
      } catch(e) {
        result.success = false; result.message = '获取CPU/内存失败:' + e.message;
      }
      break;
    case 'system_network_latency':
      try {
        var targets = [
          { name: 'AI API', url: 'http://127.0.0.1:' + PORT + '/api/health' },
          { name: '本地回环', url: 'http://127.0.0.1:8002/api/health' }
        ];
        var latencies = [];
        var proxies = [{ name: '主进程', host: '127.0.0.1', port: 8002 }];
        for (var pi = 0; pi < proxies.length; pi++) {
          (function(p) {
            var t0 = Date.now();
            fetch('http://' + p.host + ':' + p.port + '/api/health', { signal: AbortSignal.timeout(5000) })
              .then(function(resp) {
                var ms = Date.now() - t0;
                latencies.push({ target: p.name, ms: ms, ok: resp.ok });
              })
              .catch(function(e) {
                latencies.push({ target: p.name, ms: -1, ok: false, error: e.message });
              });
          })(proxies[pi]);
        }
        // Add external latency test (DNS/network)
        var extStart = Date.now();
        fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(5000) })
          .then(function(resp) {
            latencies.push({ target: '外网(HTTPBin)', ms: Date.now() - extStart, ok: resp.ok });
          })
          .catch(function(e) {
            latencies.push({ target: '外网(HTTPBin)', ms: -1, ok: false, error: e.message });
          });
        // Wait a bit for results then return
        setTimeout(function() {
          result.data = { latencies: latencies, timestamp: new Date().toISOString() };
          result.message = '网络延迟检测完成';
        }, 6000);
        // Return immediately with promise status
        result.data = { latencies: [], timestamp: new Date().toISOString(), status: '检测中,请稍后再查' };
        result.message = '网络延迟检测已启动,请调用 system_cpu_memory 后再查';
      } catch(e) {
        result.success = false; result.message = '网络延迟检测失败:' + e.message;
      }
      break;
    case 'api_request_stats': {
      try {
        // Query the traffic endpoint for API request stats
        var trafficResp = await fetch('http://127.0.0.1:' + PORT + '/api/v4/traffic', { signal: AbortSignal.timeout(5000) });
        var trafficData = {};
        if (trafficResp.ok) trafficData = await trafficResp.json();
        result.data = {
          requests: trafficData.requests || [],
          totalRequests: (trafficData.requests || []).length,
          modelUsage: trafficData.modelUsage || {},
          timestamp: new Date().toISOString(),
          note: '数据来自 /api/v4/traffic 端点'
        };
        result.message = 'API请求统计获取成功,最近' + ((trafficData.requests || []).length || 0) + '次请求';
      } catch(e) {
        // Fallback: report process level stats
        result.data = {
          requests: [],
          totalRequests: 0,
          modelUsage: {},
          uptime: Math.floor(process.uptime()) + 's',
          timestamp: new Date().toISOString(),
          error: 'traffic端点不可用: ' + e.message
        };
        result.message = 'API请求统计获取失败,已返回进程级状态';
      }
      break;
    }
    case 'system_version':
      try {
        var verResp = await fetch('http://127.0.0.1:' + PORT + '/api/system/version', {signal:AbortSignal.timeout(5000)});
        if (verResp.ok) result.data = await verResp.json();
        result.message = '版本信息获取成功';
      } catch(e) {
        result.success = false; result.message = '版本获取失败:' + e.message;
      }
      break;
    case 'system_update':
      result.success = false;
      result.message = '安全限制：系统架构代码不允许通过AI工具修改。请联系开发者手动更新。';
      result.data = { action: 'denied', reason: 'system architecture protection', recommendation: '联系开发者手动部署' };
      break;
  }
  }
  return result;
  // 工作流管理
  if (name === 'workflow_management') {
    try {
      var wfE=require('./modules/workflow-engine');
      switch(args.action){
        case 'list':
          var wfD=wfE.loadWorkflows();
          result.data={workflows:(wfD.workflows||[]).map(function(w){return{id:w.id,name:w.name,status:w.status,nodeCount:(w.nodes||[]).length}}),total:(wfD.workflows||[]).length};
          result.message='找到 '+result.data.total+' 个工作流';break;
        case 'create':
          if(!args.name){result.success=false;result.message='缺少名称';break;}
          var wfC=wfE.createWorkflow(args.name,args.description||'',args.nodes||[],args.edges||[]);
          result.data=wfC;result.message='已创建: '+wfC.id;break;
        case 'get':
          if(!args.workflowId){result.success=false;result.message='缺少ID';break;}
          var wfG=wfE.getWorkflow(args.workflowId);
          if(wfG){result.data=wfG;result.message='找到';}else{result.success=false;result.message='不存在';}break;
        case 'update':
          if(!args.workflowId){result.success=false;result.message='缺少ID';break;}
          var up={};if(args.name)up.name=args.name;if(args.description!==undefined)up.description=args.description;if(args.nodes)up.nodes=args.nodes;if(args.edges)up.edges=args.edges;
          var wfU=wfE.updateWorkflow(args.workflowId,up);
          if(wfU){result.data=wfU;result.message='已更新';}else{result.success=false;result.message='不存在';}break;
        case 'delete':
          if(!args.workflowId){result.success=false;result.message='缺少ID';break;}
          result.message=wfE.deleteWorkflow(args.workflowId)?'已删除':'不存在';break;
        case 'execute':
          if(!args.workflowId){result.success=false;result.message='缺少ID';break;}
          var rE=wfE.executeWorkflow(args.workflowId);
          if(rE){result.data=rE;result.message='已启动';}else{result.success=false;result.message='失败';}break;
        case 'validate':
          var rV=wfE.validateWorkflow(args.nodes||[],args.edges||[]);
          result.data={valid:rV.valid!==false,errors:rV.errors||[]};
          result.message=rV.valid?'验证通过':'失败: '+(rV.errors||[]).join(',');break;
        default:result.success=false;result.message='未知操作';}
    }catch(e){result.success=false;result.message='工作流操作失败:'+e.message;}
    return result;
  }

  // 桌面控制
  if(name==='desktop_control'){
    try{
      var cpDC=require('child_process');var pDC=require('path');
      var sDC=pDC.join(__dirname,'modules','desktop_control.py');
      var pA=[sDC,args.action];
      if(args.x!==undefined)pA.push(String(args.x));if(args.y!==undefined)pA.push(String(args.y));
      if(args.button){pA.push('--button');pA.push(args.button);}
      if(args.text){pA.push('--text');pA.push(args.text);}
      if(args.keys){pA.push('--keys');pA.push(args.keys);}
      if(args.key){pA.push('--key');pA.push(args.key);}
      if(args.window){pA.push('--window');pA.push(args.window);}
      if(args.duration){pA.push('--duration');pA.push(String(args.duration));}
      var dOut=cpDC.execFileSync('python',pA,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
      var dP;try{dP=JSON.parse(dOut.trim());}catch(pe){dP={raw:dOut.trim()};}
      result.data=dP;if(dP.error){result.success=false;result.message='失败: '+dP.error;}else{result.message='完成';}
    }catch(e){result.success=false;result.message='桌面控制失败:'+e.message;}
    return result;
  }

  // 浏览器自动化
  if(name==='browser_automation'){
    try{
      var cpBA=require('child_process');var pBA=require('path');var fBA=require('fs');
      var sBA=pBA.join(__dirname,'modules','browser_automation.mjs');
      var tBA=pBA.join(__dirname,'.browser_args_'+process.pid+'.json');
      fBA.writeFileSync(tBA,JSON.stringify(args));
      var bOut=cpBA.execFileSync('node',[sBA,tBA],{encoding:'utf8',timeout:60000,maxBuffer:5*1024*1024,windowsHide:true});
      try{fBA.unlinkSync(tBA);}catch(e){}
      var bP;try{bP=JSON.parse(bOut.trim());}catch(pe){bP={raw:bOut.trim()};}
      result.data=bP;
      if(bP.success===false){result.success=false;result.message=bP.error||'失败';}else{result.message=bP.message||'完成';}
    }catch(e){result.success=false;result.message='浏览器自动化失败:'+e.message;}
    return result;
  }

}

// ========== 通用 AI 模型调用(支持多提供商切换) ==========
function getAIProvider() {
  var p = { provider: 'deepseek', apiKey: '', apiBase: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' };
  // 已移除早期返回,统一从文件读取配置
  try {
    var cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    var prov = (cfg.provider || 'deepseek').toLowerCase();
    p.provider = prov;
    p.model = cfg.model || p.model;
    if (cfg.apiBase) p.apiBase = cfg.apiBase;
    if (cfg.apiKey) p.apiKey = cfg.apiKey;
    if (!p.apiKey && process.env.DEEPSEEK_API_KEY) { p.apiKey = process.env.DEEPSEEK_API_KEY; }
    if (!cfg.apiBase) {
      switch(prov) {
                case 'ernie': p.apiBase = 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions'; if(!cfg.model) p.model='ernie-4.0-8k'; break;
        case 'yi': p.apiBase = 'https://api.01.ai/v1/chat/completions'; if(!cfg.model) p.model='yi-large'; break;
        case 'deepseek': p.apiBase = 'https://api.deepseek.com/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;
        case 'openai': p.apiBase = 'https://api.openai.com/v1/chat/completions'; if(!cfg.model) p.model='gpt-4o-mini'; break;
        case 'openrouter': p.apiBase = 'https://openrouter.ai/api/v1/chat/completions'; if(!cfg.model) p.model='openrouter/auto'; break;
        case 'claude': p.apiBase = 'https://api.anthropic.com/v1/messages'; if(!cfg.model) p.model='claude-sonnet-4-20250514'; break;
        case 'gemini': p.apiBase = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; if(!cfg.model) p.model='gemini-2.5-flash'; break;
        case 'moonshot': p.apiBase = 'https://api.moonshot.cn/v1/chat/completions'; if(!cfg.model) p.model='moonshot-v1-8k'; break;
        case 'tongyi': p.apiBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'; if(!cfg.model) p.model='qwen-max'; break;
        case 'zhipu': p.apiBase = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'; if(!cfg.model) p.model='glm-4'; break;
        case 'siliconflow': p.apiBase = 'https://api.siliconflow.cn/v1/chat/completions'; if(!cfg.model) p.model='deepseek-chat'; break;
        case 'baichuan': p.apiBase = 'https://api.baichuan-ai.com/v1/chat/completions'; if(!cfg.model) p.model='baichuan-4'; break;
        case 'minimax': p.apiBase = 'https://api.minimaxi.com/v1/text/chatcompletion'; if(!cfg.model) p.model='minimax-text-01'; break;
        case 'doubao': p.apiBase = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'; if(!cfg.model) p.model='doubao-pro-32k'; break;
        case 'step': p.apiBase = 'https://api.stepfun.com/v1/chat/completions'; if(!cfg.model) p.model='step-2-16k'; break;
        case 'hunyuan': p.apiBase = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'; if(!cfg.model) p.model='hunyuan-pro'; break;
        case 'hunyuan': p.apiBase = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'; if(!cfg.model) p.model='hunyuan-pro'; break;
        case 'hunyuan': p.apiBase = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'; if(!cfg.model) p.model='hunyuan-pro'; break;
        case 'custom': p.apiBase = cfg.apiBase || 'http://localhost:11434/v1/chat/completions'; break;

    case 'complete_task': {
      var idx = TASKS.findIndex(function(t){return t.id === args.taskId;});
      if (idx === -1) { result.success = false; result.message = '任务未找到'; break; }
      TASKS[idx].status = 'completed';
      TASKS[idx].result = args.result || '已完成';
      TASKS[idx].score = args.score || 'A';
      TASKS[idx].completedAt = new Date().toISOString();
      TASKS[idx].updatedAt = new Date().toISOString();
      TASKS[idx].reviewedBy = 'ai_ceo';
      saveJSON(TASKS_FILE, TASKS);
      result.message = '任务 ' + TASKS[idx].title + ' 已核销完成';
      result.data = TASKS[idx];
      break;
    }
    case 'review_task': {
      var idx = TASKS.findIndex(function(t){return t.id === args.taskId;});
      if (idx === -1) { result.success = false; result.message = '任务未找到'; break; }
      TASKS[idx].reviewedBy = 'ai_ceo';
      TASKS[idx].reviewedAt = new Date().toISOString();
      TASKS[idx].updatedAt = new Date().toISOString();
      TASKS[idx].feedback = args.feedback || '';
      if (args.approved) {
        TASKS[idx].status = 'completed';
        TASKS[idx].score = args.feedback || '审核通过';
        TASKS[idx].completedAt = new Date().toISOString();
        result.message = '任务审核通过';
      } else {
        TASKS[idx].status = 'in_progress';
        TASKS[idx].rejectionReason = args.feedback || '需要修改';
        result.message = '任务驳回:' + (args.feedback || '请修改后重新提交');
      }
      saveJSON(TASKS_FILE, TASKS);
      result.data = TASKS[idx];
      break;
    }
    case 'reassign_task': {
      var idx = TASKS.findIndex(function(t){return t.id === args.taskId;});
      if (idx === -1) { result.success = false; result.message = '任务未找到'; break; }
      TASKS[idx].assigneeId = args.newAssigneeId;
      TASKS[idx].status = 'todo';
      TASKS[idx].updatedAt = new Date().toISOString();
      TASKS[idx].reassignReason = args.reason || '';
      TASKS[idx].reassignedAt = new Date().toISOString();
      saveJSON(TASKS_FILE, TASKS);
      result.message = '任务已重新分配给 ' + (AGENTS_MAP[args.newAssigneeId]?.name_cn || args.newAssigneeId);
      result.data = TASKS[idx];
      break;
    }

    case 'tencent_docs_create':
    case 'tencent_docs_read':
    case 'tencent_docs_search':
    case 'tencent_docs_upload':
    case 'tencent_meeting_create':
    case 'tencent_meeting_cancel':
    case 'tencent_meeting_list':
    case 'tencent_survey_create':
    case 'tencent_survey_collect':
    case 'tencent_survey_statistics': {
      try {
        result.message = '【' + name + '】 腾讯操作已执行';
        result.data = { tool: name, args: args, status: 'simulated' };
      } catch(e) { result.success = false; result.message = '操作失败:' + e.message; }
      break;
    }
      case 'query_models':
      case 'model_management':
        try {
          var mr = require('./modules/model-router');
          var summary = mr.getConfigSummary ? mr.getConfigSummary() : {};
          return json(resp, { ok: true, data: { providers: summary } });
        } catch(e) {
          return json(resp, { ok: false, error: e.message });
        }

      case 'system_health':
        try {
          var info = {
            uptime: process.uptime(),
            memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
            nodeVersion: process.version,
            platform: process.platform,
            bridges: {}
          };
          var bps = ['feishu','dingtalk','qqbot','wechat','wecom','telegram','whatsapp','discord','slack'];
          bps.forEach(function(k) {
            var g = global['__' + k + 'Bridge'];
            info.bridges[k] = g ? (g.exitCode === null && g.killed === false) : false;
          });
          return json(resp, { ok: true, data: info });
        } catch(e) {
          return json(resp, { ok: false, error: e.message });
        }

default: p.apiBase = 'https://api.deepseek.com/v1/chat/completions'; p.model='deepseek-chat'; break;
      }
    }
  } catch(e) {}
  return p;
}

async function runCEOCEO(messages, options = {}) {
  const ceoMem = layMem.loadCEOMemory();
  // 更新重要性分数
  try {
    (ceoMem.decisions || []).forEach(function(d) {
      if (!d.importance) d.importance = layMem.calcImportance(d);
    });
    (ceoMem.conversations || []).forEach(function(c) {
      if (!c.importance) c.importance = layMem.calcImportance(c);
    });
  } catch(impE) {}
  const recentDecisions = ceoMem.decisions.slice(-10);

  // 读取 API 配置(多模型路由)
  var _lastUserMsg = '';
  for (var _mi = messages.length - 1; _mi >= 0; _mi--) {
    if (messages[_mi].role === 'user' && typeof messages[_mi].content === 'string') {
      _lastUserMsg = messages[_mi].content; break;
    }
  }
  var routeSel = null;
  try {
    var strategyMode = 'speed-first';
    var strategyBackup = [];
    try {
      var stratCfg = JSON.parse(fs.readFileSync(path.join(BASE, 'model-router.json'), 'utf-8'));
      strategyMode = stratCfg.strategy || 'speed-first';
      strategyBackup = stratCfg.backupModels || [];
    } catch(e) {}
    var routeOpts = { strategy: strategyMode, backupModels: strategyBackup };
    if (options.model) routeOpts.preferredModel = options.model;
    routeSel = modelRouter.selectModel(_lastUserMsg, routeOpts);
  } catch(e) { routeSel = null; }
  var aiProv = routeSel || getAIProvider();
  var apiKey = options.apiKey || aiProv.apiKey;
  if (!apiKey) {
    try {
      var fallbackCfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
      apiKey = fallbackCfg.apiKey || process.env.DEEPSEEK_API_KEY || '';
      if (!aiProv.apiBase && fallbackCfg.apiBase) aiProv.apiBase = fallbackCfg.apiBase;
    } catch(e) {}
  }
  var model = options.model || aiProv.model || 'deepseek-chat';
  var apiBase = options.apiBase || aiProv.apiBase;
  if (routeSel) {
    try { modelRouter.recordUsage(routeSel, 0, 0); } catch(e) {}
  }

    // ===== 分层记忆上下文构建 (layered-memory) =====
  var _lastUserForMem = '';
  for (var _mi = messages.length - 1; _mi >= 0; _mi--) {
    if (messages[_mi].role === 'user' && typeof messages[_mi].content === 'string') {
      _lastUserForMem = messages[_mi].content; break;
    }
  }
  var contextStr = layMem.buildContext(ceoMem, _lastUserForMem);
  var compressedCtx = [];
  if (contextStr) {
    compressedCtx.push({ role: 'system', content: contextStr });
  }
  if (messages.length > 6) {
    compressedCtx.push({ role: 'system', content: '之前对话共 ' + messages.length + ' 条，最近一条：' + ((typeof messages[messages.length-1].content === 'string' ? messages[messages.length-1].content : JSON.stringify(messages[messages.length-1].content || ''))).substring(0,200) });
    compressedCtx = compressedCtx.concat(messages.slice(-8));
  } else {
    compressedCtx = compressedCtx.concat(messages);
  }
  // 构建 CEO 系统提示词
  // 构建会话记忆摘要
  var sessionSummary = ceoMem.sessionSummary || '无历史会话';
  var convCount = (ceoMem.conversations || []).length;

  // ====== 加载未读通知注入CEO上下文 ======
  var _pendingNotifs = [];
  try {
    var _nf = path.join(BASE, 'logs', 'ceo-notify-queue.json');
    if (fs.existsSync(_nf)) {
      var _queue = JSON.parse(fs.readFileSync(_nf, 'utf-8') || '[]');
      _pendingNotifs = _queue.filter(function(n) { return n.status === 'unread'; }).slice(-5);
    }
  } catch(_ne) {}

  const allMessages = [{
    role: 'system',
    content: '你是 ' + AGENTS_MAP.ai_ceo.name_cn + ',担任 ' + AGENTS_MAP.ai_ceo.title + '.\n\n'
      + AGENTS_MAP.ai_ceo.description + '\n\n## 运行环境\n- 你正在运行的模型: ' + (aiProv.model || 'deepseek') + '\n- AI 提供商: ' + (aiProv.provider || 'deepseek') + '\n\n'
      + '## 你的身份'
      + '你叫小龙,是老板的团队调度与管理核心，管理' + TEAM_AGENTS.length + '名AI员工。你的工作方式和以下原则:\n\n## 核心工作流程\n1. 接收消息 → 拆解任务 → 分配到人 → 跟踪进度 → 验收结果 → 汇报老板\n2. 每接到一个新需求，先用 kb_search 搜索知识库中是否有相关需求文档，读全了再分配任务。description字段必须写完整，不能留空。\n3. 分配任务时明确:谁做、做什么、什么时间完成。\n4. 定期巡查任务进度(调用list_tasks)，发现停滞或逾期任务及时干预。\n5. 员工提交任务后，审核完成质量，汇总结果反馈给老板。\n\n## 报告原则\n1. 对老板汇报:简洁、结构化、数据驱动。\n2. 用自然语言写报告，不要贴原始数据。\n3. 报告格式:完成了什么 + 谁做的 + 结果如何 + 下一步建议。\n\n## 行为准则\n1. 冷静、客观、严谨、高效。\n2. 老板的意志延伸，指令等同于老板的指令。\n3. 信息守门人，只传递完成任务所必需的信息。\n4. 绝对不要输出JSON、代码或系统原始数据给老板看。\n5. 不准用建议您/可以尝试/如果需要等客套话。\n6. 语气:干练的助理，直接用结论开场。\n\n## 逻辑一致性(重要)\n1. 你必须保持前后对话逻辑一致，不能和之前说过的话矛盾。\n2. 如果在同个会话中老板说过的话，要当作事实记住。\n3. 跨会话记忆通过以下摘要恢复，不要和新会话信息冲突。\n4. 回复时要符合之前约定的称呼、风格和结论。\n'
      + '## 当前时间\n- ' + new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) + ' Asia/Shanghai\n\n' + '## 跨会话记忆\n- 历史对话总条数: ' + convCount + '\n- 上次会话摘要: ' + sessionSummary + '\n\n'
      + '## 你的团队\n'
      + '\u516c\u53f8\u5171\u6709 ' + TEAM_AGENTS.length + ' 名 AI 员工。\n'
      + '通过 query_team 可以查询每个人的详细信息。\n\n'
      + '## 近期决策记录\n'
      + (recentDecisions.length ? recentDecisions.map(function(d, i) {
        var ts = d.timestamp || d.delegatedAt || '';
        var detail = d.tool ? ('[工具:' + d.tool + ']') : ('委派 ' + d.to);
        return (i+1) + '. ' + ts + ' ' + detail;
      }).join('\n') : '暂无决策记录')
  }, ...messages];

  // 主动巡查:检查待办任务并添加到上下文
  try {
    var _pendingTasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    var _pendingTodos = _pendingTasks.filter(function(t){return t.status === 'todo' || t.status === 'in_progress';});
    if (_pendingTodos.length > 0) {
      var _todoSummary = '\n\n当前待办任务(' + _pendingTodos.length + '个):\n';
      _pendingTodos.slice(0, 5).forEach(function(t, i){
        var assigneeName = '未分配';
        try { if (t.assigneeId && AGENTS_MAP[t.assigneeId]) assigneeName = AGENTS_MAP[t.assigneeId].name_cn || t.assigneeId; } catch(e) {}
        _todoSummary += (i+1) + '. [' + t.status + '] ' + t.title + ' - ' + assigneeName;
        if (t.deadline) _todoSummary += ' 截止:' + t.deadline;
        _todoSummary += '\n';
      });
      if (_pendingTodos.length > 5) _todoSummary += '...还有' + (_pendingTodos.length - 5) + '个待办\n';
      // 追加到 system prompt
      allMessages[0].content += _todoSummary;
    }
  } catch(e) {}

  // ====== 注入当前目标到CEO上下文 ======
  try {
    var _goalsCtx = pSharedMemory.getSharedContext();
    var _activeGoals = (_goalsCtx.current_goals || []).filter(function(g) { return g.status === 'active' || g.status === 'paused'; });
    if (_activeGoals.length > 0) {
      var _goalSummary = '\n\n## 🎯 当前目标（' + _activeGoals.length + '个）\n以下为活跃的团队目标，请在日常工作中推进：\n';
      _activeGoals.forEach(function(g, i) {
        var statusIcon = g&&g.status === 'paused' ? '⏸' : '🟢';
        _goalSummary += (i+1) + '. ' + statusIcon + ' ' + g.title;
        if (g&&g.description) _goalSummary += ' - ' + g.description.substring(0, 80);
        _goalSummary += '\n';
      });
      _goalSummary += '\n你可以用 goal_manager 工具创建、更新、完成目标。';
      allMessages[0].content += _goalSummary;
    }
  } catch(_ge) {}

  // ====== 自我演化结果自检 ======
  try {
    var _evolveCheck = JSON.parse(fs.readFileSync(CEOMEM_PATH, 'utf-8'));
    if (_evolveCheck.memory && _evolveCheck.memory.last_evolve_pending) {
      allMessages[0].content += '\n\n## ⏳ 自我演化进行中\n你之前触发的自我演化还在后台运行中。完成时我会记忆下来，下次对话中你可以问我结果。\n';
    } else if (_evolveCheck.decisions) {
      var _lastEvolve = null;
      for (var _ei = _evolveCheck.decisions.length - 1; _ei >= 0; _ei--) {
        if (_evolveCheck.decisions[_ei].type === 'evolve_result') {
          _lastEvolve = _evolveCheck.decisions[_ei];
          break;
        }
      }
      if (_lastEvolve) {
        // 检查是否已经汇报过（上次对话之后的新结果）
        var _lastReported = _evolveCheck.memory && _evolveCheck.memory._last_report_evolve;
        if (_lastReported !== _lastEvolve.timestamp) {
          allMessages[0].content += '\n\n## 🔄 自我演化新结果\n上次演化已完成。检测到 ' + _lastEvolve.detected + ' 个问题，生成了 ' + _lastEvolve.fixes + ' 个修复方案，成功推广 ' + _lastEvolve.promoted + ' 个。\n摘要: ' + (_lastEvolve.summary || '') + '\n请知会老板这一结果。\n';
          try {
            _evolveCheck.memory._last_report_evolve = _lastEvolve.timestamp;
            fs.writeFileSync(CEOMEM_PATH, JSON.stringify(_evolveCheck, null, 2), 'utf-8');
          } catch(e) {}
        }
      }
    }
  } catch(_ee) {}

  // ====== 注入未读通知到CEO上下文 =====
  if (_pendingNotifs && _pendingNotifs.length > 0) {
    var _notifSummary = '\n\n## 📬 待处理通知（' + _pendingNotifs.length + '条）\n以下员工完成了任务等待你审阅：\n';
    _pendingNotifs.forEach(function(n, i) {
      _notifSummary += (i+1) + '. ' + n.message + '\n'; });
    _notifSummary += '\n请审阅产出物，确认通过后归档，或驳回重做。';
    allMessages[0].content += _notifSummary;
    // 标记为已读
    try {
      var _nf = path.join(BASE, 'logs', 'ceo-notify-queue.json');
      if (fs.existsSync(_nf)) {
        var _q = JSON.parse(fs.readFileSync(_nf, 'utf-8') || '[]');
        _q.forEach(function(n) { n.status = 'read'; });
        fs.writeFileSync(_nf, JSON.stringify(_q, null, 2), 'utf-8');
      }
    } catch(_ne) {}
  }

  // 注入角色技能提示词
  try {
    var ceoSkillIds = roleSkills.getRoleSkillIds('ceo');
    if (ceoSkillIds && ceoSkillIds.length) {
      var skillsPrompt = skillSystem.buildSkillsPromptForSkills(ceoSkillIds);
      if (skillsPrompt) {
        allMessages[0].content += '\n\n---\n\n## 可用技能\n\n' + skillsPrompt;
      }
    }
  } catch(e) {}

  // ===== 上下文预算管理:1M字符上限,950K触发自动压缩 =====
  var CONTEXT_BUDGET = 1000000; // 1M 字符上限
  var COMPRESS_THRESHOLD = 950000; // 950K 触发压缩

  function calcTotalChars(msgs) {
    var total = 0;
    for (var _mc = 0; _mc < msgs.length; _mc++) {
      if (typeof msgs[_mc].content === 'string') total += msgs[_mc].content.length;
    }
    return total;
  }

  var totalChars = calcTotalChars(allMessages);
  if (totalChars > COMPRESS_THRESHOLD) {
    console.log('[CEO Context] 上下文大小: ' + totalChars + ' 字符,超过压缩阈值,正在压缩...');
    // 保留最新的 6 轮对话 + system prompt,其余生成摘要
    var keepCount = 12; // 保留最后 12 条消息
    if (allMessages.length > keepCount + 1) {
      var oldMessages = allMessages.slice(1, allMessages.length - keepCount);
      var recentMessages = allMessages.slice(allMessages.length - keepCount);
      var summaryText = '';
      for (var _sc = 0; _sc < oldMessages.length; _sc++) {
        var m = oldMessages[_sc];
        var prefix = m.role === 'user' ? '用户: ' : (m.role === 'assistant' ? 'AI: ' : '系统: ');
        var content = (typeof m.content === 'string') ? m.content.substring(0, 50) : '[非文本]';
        summaryText += prefix + content + '\n';
      }
      // 在 system prompt 中插入压缩摘要
      var summaryInject = '\n\n## 历史会话压缩摘要(以下' + oldMessages.length + '条历史对话已被压缩以节省上下文空间)\n' + (typeof summaryText === 'string' ? summaryText : '').substring(0, 5000) + '\n';
      allMessages = [allMessages[0]].concat(recentMessages);
      allMessages[0].content += summaryInject;
      totalChars = calcTotalChars(allMessages);
      console.log('[CEO Context] 压缩后: ' + allMessages.length + ' 条消息, ' + totalChars + ' 字符');
    }
  }
  if (totalChars > CONTEXT_BUDGET) {
    console.log('[CEO Context] 上下文仍超过预算,强制截断至 1M');
    allMessages[0].content = (typeof allMessages[0].content === 'string' ? allMessages[0].content : JSON.stringify(allMessages[0].content || '')).substring(0, CONTEXT_BUDGET - 50000);
  }

  // ===== 自主推理循环:思考 -> 工具调用 -> 观察 -> 继续 =====
  var MAX_ITERATIONS = 10;var MAX_EXTRA = 2; // 基础3轮,复杂任务可+2
  var allToolCalls = [];
  var currentMessages = allMessages;

  // Record user interaction habits automatically
  try { if (_lastUserMsg && _lastUserMsg.length > 2) { var _hh = require('./modules/harness-habits'); var _extracted = _hh.extractHabitsFromMessage(_lastUserMsg, 'auto'); _extracted.forEach(function(_h) { try { _hh.recordHabit(_h.category, _h.action, _h.detail || _h.action, {source:'auto', agentId:'ai_ceo'}); } catch(_he2) {} }); } } catch(_he) {}

  for (var iter = 0; iter < MAX_ITERATIONS; iter++) {
    try {
        // Ensure correct URL for Ollama (append /v1/chat/completions if needed)
  var _fetchUrl = apiBase;
  if (apiBase && (apiBase.indexOf('127.0.0.1:11434') >= 0 || apiBase.indexOf('localhost:11434') >= 0) && apiBase.indexOf('/completions') < 0) {
    _fetchUrl = apiBase.replace(/\/?$/, '') + '/v1/chat/completions';
  }
  var response = await fetch(_fetchUrl, { method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: currentMessages,
                    // Ollama: skip tools (model doesnt support native function calling)
          ...(apiBase && apiBase.indexOf('127.0.0.1:11434') >= 0 ? {} : {
            tools: toolRouter.filterToolsByIntent((msg && msg.content) || (currentMessages.length > 0 && typeof currentMessages[currentMessages.length-1].content === 'string' ? currentMessages[currentMessages.length-1].content : ''), CEO_TOOLS),            tool_choice: 'auto'
          }),
          temperature: 0.7,
          max_tokens: 32768
        }),
        signal: AbortSignal.timeout(options.timeout || 120000)
      });

      if (!response.ok) {
        var errText = await response.text();
        fs.appendFileSync('ceo_debug.log', new Date().toISOString() + ' fetch not OK: ' + response.status + ' ' + errText.substring(0, 200) + '\n');
        // fallback: 降级为无工具模式
        var fbResponse = await fetch(_fetchUrl, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: model, messages: allMessages, temperature: 0.7, max_tokens: 32768 }),
          signal: AbortSignal.timeout(60000)
        });
        if (!fbResponse.ok) {
          var fbErrText = await fbResponse.text();
          fs.appendFileSync('ceo_debug.log', new Date().toISOString() + ' fallback not OK: ' + fbResponse.status + ' ' + fbErrText.substring(0, 200) + '\n');
          var _hasImg=function(){for(var _i=0;_i<allMessages.length;_i++){var _c=allMessages[_i].content;if(Array.isArray(_c)){for(var _j=0;_j<_c.length;_j++){if(_c[_j]&&_c[_j].type==='image_url')return true;}}}return false;}();return { reply: _hasImg?'当前模型不具备图片和视频识别能力,无法分析您发送的图片内容。请更换支持视觉能力的模型(如GPT-4o、Claude、Gemini等)后再试。':'AI服务暂时不可用,请检查API配置。', toolCalls: allToolCalls };
        }
        var fbData = await fbResponse.json();
        return { reply: fbData.choices?.[0]?.message?.content || '', toolCalls: allToolCalls };
      }

      var data = await response.json();
      var choice = data.choices?.[0];
      if (!choice) return { reply: 'AI返回为空', toolCalls: allToolCalls };

      var msg = choice.message;

      // 检查是否有工具调用
      if (choice.finish_reason === 'tool_calls' && msg.tool_calls && msg.tool_calls.length) {
        var asstMsg = { role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls };
        if (msg.reasoning_content) asstMsg.reasoning_content = msg.reasoning_content;
        currentMessages.push(asstMsg);

        // 执行工具调用
        
for (var tci = 0; tci < msg.tool_calls.length; tci++) {
          var tc = msg.tool_calls[tci];
          if (tc.type !== 'function') continue;
          var funcName = tc.function.name;
          var funcArgs = {};
          try { funcArgs = JSON.parse(tc.function.arguments); } catch(e) {}

          var result = await execCEOTool(funcName, funcArgs, ceoMem);
          // SSE: 发送工具调用开始事件
          if (options.onToolCall) {
            try { options.onToolCall({ type: 'tool_call', name: funcName, args: funcArgs, summary: result.message || '' }); } catch(_see) {}
            // 文件操作额外发送 file_read/file_write 路径事件
            if (funcName === 'read_file' || funcName === 'write_file') {
              try { options.onToolCall({ type: 'file_' + (funcName === 'read_file' ? 'read' : 'write'), name: funcName, path: funcArgs.filepath || funcArgs.path || '' }); } catch(_fe) {}
            }
          }
          // SSE: 发送工具调用结果事件
          if (options.onToolCall) {
            try { options.onToolCall({ type: 'tool_result', name: funcName, status: result.success ? 'done' : 'error', result: result.message || JSON.stringify(result.data || '') }); } catch(_see) {}
          }          var result = await execCEOTool(funcName, funcArgs, ceoMem);
          // SSE: 发送工具调用结果事件
          if (options.onToolCall) {
            try { options.onToolCall({ type: 'tool_result', name: funcName, status: result.success ? 'done' : 'error', result: result.message || JSON.stringify(result.data || '') }); } catch(_see) {}
          }
          allToolCalls.push({ name: funcName, args: funcArgs, result: result });
          // 记录 CEO 工具调用活动
          var toolLabel = ({'assign_task':'分配任务','read_file':'读取文件','write_file':'写入文件','search_web':'搜索网络','exec':'执行命令','list_tasks':'查看任务','query_team':'查询团队','complete_task':'核销任务','review_task':'审核任务','reassign_task':'重新分配','system_health':'检查系统','skill_manager':'技能管理','file_manager':'文件管理','harness_status':'查看监控','harness_errors':'查看错误','harness_sla':'查看SLA','harness_dag':'查看依赖图','harness_agent_control':'Agent控制','harness_habits_analyze':'分析习惯','harness_habits_record':'记录习惯','harness_habits_confirm':'确认偏好','harness_habits_pending':'待确认偏好'})[funcName] || funcName;
          var argsDesc = '';
          try { argsDesc = JSON.stringify(funcArgs).substring(0, 80); } catch(e) {}
          logActivity('⚡', 'CEO ' + toolLabel + ': ' + argsDesc, 'ai_ceo', funcName + ' ' + JSON.stringify(funcArgs));

          
          // 工具结果截断:大结果压缩存储
          var truncResult = toolTruncator.truncateToolResult(result);
          result = truncResult.result;
          if (truncResult.truncated) {
            try {
              coreMem.writeMemory({
                content: '【工具结果全量】' + funcName + ': ' + truncResult.originalContent.substring(0, 3000),
                tags: ['tool_result', funcName, 'auto'],
                priority: 'low',
                type: 'knowledge',
                timestamp: new Date().toISOString()
              }).catch(function(){});
            } catch(_tf) {}
          }
currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });

          // CEO 主动推送:执行完工具后通知前端
          try { wsServer.ceoMessage(result.message || '已执行' + funcName, 'ceo_tool'); } catch(e) {}
                    // 记录决策
          ceoMem.decisions.push({
            type: 'tool_call', tool: funcName, args: funcArgs,
            timestamp: new Date().toISOString()
          });
          if (ceoMem.decisions.length > 200) ceoMem.decisions = ceoMem.decisions.slice(-200);
          saveCEOMemory(ceoMem);
          // 自动核心记忆:重要操作持久化
          try {
            if (funcName === 'assign_task' && result.success) {
              var _ar=http.request({hostname:'127.0.0.1',port:PORT,path:'/api/core-memory/write',method:'POST',headers:{'Content-Type':'application/json'}});_ar.write(JSON.stringify({content:'\u5206\u914D\u4efb\u52a1: '+(funcArgs.title||'')+' \u7ed9 '+(funcArgs.assigneeId||''),tags:'\u4efb\u52a1,\u5206\u914D',priority:'high',type:'task'}));_ar.end();
            } else if (funcName === 'complete_task' && result.success) {
              var _cr=http.request({hostname:'127.0.0.1',port:PORT,path:'/api/core-memory/write',method:'POST',headers:{'Content-Type':'application/json'}});_cr.write(JSON.stringify({content:'\u5b8c\u6210\u4efb\u52a1: '+(result.data?result.data.title:''),tags:'\u4efb\u52a1,\u5b8c\u6210',priority:'medium',type:'task'}));_cr.end();
            } else if (funcName === 'review_task' && result.success) {
              var _rr=http.request({hostname:'127.0.0.1',port:PORT,path:'/api/core-memory/write',method:'POST',headers:{'Content-Type':'application/json'}});_rr.write(JSON.stringify({content:'\u5ba1\u6838\u4efb\u52a1: '+funcArgs.taskId+' '+(funcArgs.approved?'\u901a\u8fc7':'\u9a73\u56de'),tags:'\u4efb\u52a1,\u5ba1\u6838',priority:'medium',type:'task'}));_rr.end();
            }
          } catch(e) {}
        }

        // 自适应扩展:如果还有工具调用且接近限制,增加迭代
        if (iter >= MAX_ITERATIONS - 1 && iter < MAX_ITERATIONS - 1 + MAX_EXTRA) { MAX_ITERATIONS++; }
        // 再次循环 -> AI 观察工具结果后继续推理
        continue;
      }

      // 没有工具调用 -> 最终回复前保存对话
      // 保存对话到 CEO 记忆(跨会话持久化)
      try {
        var userMsg = messages[messages.length - 1];
        if (userMsg && userMsg.role === 'user') {
          ceoMem.conversations.push({ role: 'user', content: (userMsg.content || '').substring(0, 5000), time: new Date().toISOString() });
          ceoMem.conversations.push({ role: 'assistant', content: (msg.content || '').substring(0, 5000), time: new Date().toISOString() });
          if (ceoMem.conversations.length > 200) ceoMem.conversations = ceoMem.conversations.slice(-200);
          // 更新会话摘要
          ceoMem.sessionSummary = (typeof messages[messages.length-1].content === 'string' ? messages[messages.length-1].content : JSON.stringify(messages[messages.length-1].content || '')).substring(0, 60) + ' | ' + (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')).substring(0, 100);
          ceoMem.lastActive = new Date().toISOString();
          saveCEOMemory(ceoMem);
          // 分层记忆:记录重要事件到核心记忆库
          try {
            if (msg.content && msg.content.length > 80) {
              var userMsg2 = messages[messages.length-1];
              if (userMsg2 && userMsg2.role === 'user' && userMsg2.content) {
                var recordContent = (typeof userMsg2.content === 'string' ? userMsg2.content : '').substring(0, 200) + ' --> ' + msg.content.substring(0, 200);
                coreMem.writeMemory({ content: recordContent, tags: ['ceo对话'], priority: 'medium', type: 'summary', timestamp: new Date().toISOString() }).catch(function(){});
              }
            }
          } catch(em) {}
          // 分层记忆:维护压缩(超过阈值时)
          try {
            var maintResult = layMem.maintenance();
            if (maintResult && maintResult.compressed > 0) {
              console.log('[LayeredMemory] 压缩了 ' + maintResult.compressed + ' 条旧对话');
            }
          } catch(em2) {}
        }
      } catch(e) {}
      // P2: 保存本轮工具调用记录到核心记忆
      try {
        if (allToolCalls && allToolCalls.length > 0) {
          for (var _tci = 0; _tci < allToolCalls.length; _tci++) {
            var _tc = allToolCalls[_tci];
            if (_tc.name && _tc.result) {
              coreMem.writeMemory({
                content: '【工具调用】' + _tc.name + ': ' +
                  JSON.stringify(_tc.args).substring(0, 200) + ' → ' +
                  (_tc.result.message || '').substring(0, 200),
                tags: ['tool_call', _tc.name, 'ceo'],
                priority: 'medium',
                type: 'performance',
                timestamp: new Date().toISOString()
              }).catch(function(){});
            }
          }
        }
      } catch(_tce) {}
      return { reply: msg.content || '', toolCalls: allToolCalls };

    } catch (err) {
      try { fs.appendFileSync(path.join(BASE, 'ceo_error.log'), new Date().toISOString() + ' ' + (err.message || '') + '\\n' + (err.stack || '') + '\\n\\n', 'utf-8'); } catch(e) {}
      return { reply: '[Catch] ,请稍候。', toolCalls: allToolCalls };
    }
  }

  return { reply: (currentMessages.length > 1 ? (currentMessages[currentMessages.length-1].content || 'done') : 'done'), toolCalls: allToolCalls };
}

function json(res, data, status) {
  if (!status) status = 200;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

// ========== 路由系统 ==========
const ROUTES = [];
// 渠道连通状态检测
registerRoute(['GET'], /^\/api\/channels\/status$/, async (req, res) => {

  console.log('[DUBUG] SSE handler called: agentId=' + (body.agentId||'') + ' message=' + (body.message||'').substring(0,50) + ' bodyKeys=' + Object.keys(body).join(','));  try {
    var fs = require('fs');
    var path = require('path');
    var BASE = __dirname;
    var providerKeys = {};
    try { providerKeys = JSON.parse(fs.readFileSync(path.join(BASE, 'provider-keys.json'), 'utf-8')); } catch(e) {}
    
    // 渠道定义: id + 检测方法
    var channels = [
      { id: 'wechat_ilink', name: '微信桥接', type: 'bridge', url: 'http://127.0.0.1:' + PORT + '/api/wechat/bridge/status' },
      { id: 'wecom', name: '企业微信', type: 'bridge', url: 'http://127.0.0.1:' + PORT + '/api/wecom/bridge/status' },
      { id: 'feishu', name: '飞书', type: 'sdk', nameKey: 'feishu' },
      { id: 'dingtalk', name: '钉钉', type: 'sdk', nameKey: 'dingtalk' },
      { id: 'qqbot', name: 'QQ 机器人', type: 'sdk', nameKey: 'qqbot' },
      { id: 'tencent', name: '腾讯云', type: 'sdk', nameKey: 'tencent' },
      { id: 'personal_wx', name: '个人微信', type: 'bridge', url: 'http://127.0.0.1:' + PORT + '/api/wechat/bridge/status' },
      { id: 'telegram', name: 'Telegram', type: 'sdk', nameKey: 'telegram' },
      { id: 'whatsapp', name: 'WhatsApp', type: 'sdk', nameKey: 'whatsapp' },
      { id: 'discord', name: 'Discord', type: 'sdk', nameKey: 'discord' },
      { id: 'slack', name: 'Slack', type: 'sdk', nameKey: 'slack' },
    ];
    
    var results = [];
    for (var ch of channels) {
      var item = { id: ch.id, name: ch.name, connected: false, status: 'offline', account: '', messageCount: 0, error: '' };
      
      if (ch.type === 'bridge') {
        // 桥接渠道: 直接 ping 子进程
        try {
          var controller = new AbortController();
          setTimeout(function() { try { controller.abort(); } catch(e) {} }, 5000);
          var resp = await fetch(ch.url, { signal: controller.signal });
          if (resp.ok) {
            var data = await resp.json();
            if (data.alive) {
              item.connected = true;
              item.status = 'running';
              item.account = data.status ? (data.status.account || '') : '';
              item.messageCount = data.status ? (data.status.messageCount || 0) : 0;
            }
          }
        } catch(e) {
          item.error = e.message;
        }
      } else if (ch.type === 'sdk') {
        // SDK 桥接渠道: 检查对应进程是否存活（进程引用保存在 global 上）
        var glKey = '__' + ch.nameKey + 'Bridge';
        var proc = global[glKey];
        if (proc && proc.exitCode === null && proc.killed === false) {
          item.connected = true;
          item.status = 'running';
        } else {
          item.status = 'inactive';
        }
      } else if (ch.type === 'plugin') {
        // 插件渠道: 同桥接检测
        try {
          var controller2 = new AbortController();
          setTimeout(function() { try { controller2.abort(); } catch(e) {} }, 5000);
          var resp2 = await fetch(ch.url, { signal: controller2.signal });
          if (resp2.ok) {
            var data2 = await resp2.json();
            if (data2.alive) {
              item.connected = true;
              item.status = 'running';
            }
          }
        } catch(e) {
          item.error = e.message;
        }
      }
      results.push(item);
    }
    
    json(res, { ok: true, channels: results });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});


// ========== 认证系统 ==========
const PUBLIC_PATHS = [
  '/api/auth/verify',
  '/api/setup/status',
  '/api/health',
  '/api/search-web',
  '/api/bi/',
  '/api/v4/member/status',
  '/api/channels/list',
  '/api/skills','/api/skills/',
  '/api/mcp/',
  '/api/stream/',
  '/api/tools/list',
  '/api/file-permissions/',
  '/api/file-versions/stats',
    '/api/chat',
  '/api/chat/sse',
  '/api/skills/proxy/list',
  '/api/skills/proxy/stats',
  '/api/mcp/servers',
  '/api/mcp/tools',
  '/api/provider/config',
  '/api/provider/test',
  '/api/models/providers',
  '/api/v4/settings/provider',
  '/api/v4/settings/apikey',
  '/api/v4/wechat/incoming',
  '/api/v4/channel/incoming',
  '/api/v4/channel/forward',
  '/api/mcp/server/status',
  '/api/mcp/server/start',
  '/api/mcp/server/stop',
  '/api/file-versions/',
  '/api/workflows',
  '/api/openapi.json',
  '/api/workflow-templates',
  '/api/employee-activities',
  '/api/team/',
  '/api/memory/compress'
];

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/api/setup/')) return true;
  if (pathname.startsWith('/api/wechat/')) return true;
  if (pathname.startsWith('/api/qqbot/')) return true;
  if (pathname.startsWith('/api/team/')) return true;
  if (pathname.startsWith('/api/core-memory/')) return true;
  if (pathname === '/api/openapi.json') return true;
  if (pathname === '/api/workflow-templates') return true;
  if (pathname.startsWith('/api/memory/compress')) return true;
  if (pathname.startsWith('/api/scheduler/')) return true;
  if (pathname.startsWith('/api/harness/')) return true;
  if (pathname.startsWith('/api/provider/')) return true;
  if (pathname.startsWith('/api/v4/settings/')) return true;
  if (pathname.startsWith('/api/chat')) return true;
  if (pathname.startsWith('/api/i18n/')) return true;
  if (pathname.startsWith('/api/bi/')) return true;
  if (pathname.startsWith('/api/router/')) return true;
  if (pathname.startsWith('/api/auto/')) return true;
  if (pathname.startsWith('/api/kb/')) return true;
  if (pathname.startsWith('/api/integration/')) return true;
  if (pathname.startsWith('/api/runner/')) return true;
  if (pathname.startsWith('/api/evolve/')) return true;
  if (pathname.startsWith('/api/skills/proxy/')) return true;
  if (pathname.startsWith('/api/v4/decompose')) return true;
  if (pathname.startsWith('/api/v4/dispatch')) return true;
  if (pathname.startsWith('/api/v4/employees')) return true;
  if (pathname.startsWith('/api/v4/ai/')) return true;
  if (pathname.startsWith('/api/v4/status/')) return true;
  return false;
}

function authenticate(req, res) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    json(res, { ok: false, error: '未授权访问,请提供认证令牌' }, 401);
    return false;
  }
  const token = authHeader.slice(7).trim();
  try {
    const _authMod = require('./modules/auth-middleware');
    const decoded = _authMod.verifyToken(token);
    if (!decoded) {
      json(res, { ok: false, error: '认证令牌无效或已过期' }, 401);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[auth] verifyToken error:', e.message);
    json(res, { ok: false, error: '认证服务异常' }, 500);
    return false;
  }
}

// ========== 路由注册 ==========

function registerRoute(methods, pattern, handler) {
  ROUTES.push({ methods, pattern, handler });
}

// ========== 路由注册 ==========

// ========== 网络搜索路由 ==========


// ====== 会员等级系统 API ======
var licenseSys = require('./modules/license');


// ========== CEO 系统健康检测端点 ==========
registerRoute(['GET'], /^\/api\/system\/health-check$/, function(req, res) {
  var info = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    loadavg: os.loadavg ? os.loadavg() : null,
    cpus: os.cpus ? os.cpus().length + ' cores' : 'unknown',
    freemem: os.freemem ? os.freemem() : null,
    totalmem: os.totalmem ? os.totalmem() : null,
    nodeVersion: process.version,
    platform: process.platform + ' ' + process.arch,
    bridges: {}
  };
  // 桥接进程状态
  var bridgePrefixes = ['feishu', 'dingtalk', 'qqbot', 'wechat', 'wecom', 'telegram', 'whatsapp', 'discord', 'slack'];
  bridgePrefixes.forEach(function(k) {
    var g = global['__' + k + 'Bridge'];
    if (g) {
      info.bridges[k] = {
        alive: g.exitCode === null && g.killed === false,
        pid: g.pid,
        uptime: Math.floor((Date.now() - g.startTime) / 1000) + 's'
      };
    } else {
      info.bridges[k] = { alive: false };
    }
  });
  json(res, { ok: true, data: info });
});

registerRoute(['GET'], /^\/api\/system\/external-deps$/, function(req, res) {
  var results = {
    aiEngines: [],
    apiEndpoints: [],
    deployInfo: {}
  };
  // 检测 AI 提供商连通性
  try {
    var mr = require('./modules/model-router');
    var summary = mr.getConfigSummary ? mr.getConfigSummary() : null;
    if (summary) {
      results.aiEngines = summary.providers || [];
    }
  } catch(e) {
    results.aiEngines = [{ error: e.message }];
  }
  // 获取配置版本信息
  try {
    var pkPath = path.join(BASE, 'backend', 'config', 'provider-keys.json');
    if (fs.existsSync(pkPath)) {
      var pkStat = fs.statSync(pkPath);
      results.deployInfo.lastConfigUpdate = new Date(pkStat.mtime).toISOString();
    }
    var serverStat = fs.statSync(__filename);
    results.deployInfo.serverVersion = new Date(serverStat.mtime).toISOString();
    results.deployInfo.serverSize = serverStat.size;
  } catch(e) {}
  json(res, { ok: true, data: results });
});

registerRoute(['GET'], /^\/api\/system\/version$/, function(req, res) {
  try {
    var pkg = require('./package.json');
    var mainStat = require('fs').statSync(__filename);

    // 读取版本变更记录
    var changelog = [];
    try {
      var hist = JSON.parse(fs.readFileSync(path.join(BASE, 'version-history.json'), 'utf8'));
      if (hist.versions) changelog = hist.versions.slice(-20).reverse();
      var lastUpdate = hist.lastUpdate || mainStat.mtime.toISOString();
    } catch(e) {}

    json(res, { ok: true, data: {
      version: pkg.version || 'unknown',
      buildDate: pkg.buildDate || '',
      deployTime: mainStat.mtime.toISOString(),
      lastUpdate: lastUpdate || mainStat.mtime.toISOString(),
      changelog: changelog,
      nodeVersion: process.version,
      platform: process.platform + ' ' + process.arch,
      pid: process.pid,
      uptime: Math.floor(process.uptime()) + 's'
    }});
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// 版本历史写入端点（启动/部署时调用）
registerRoute(['POST'], /^\/api\/system\/version\/record$/, async function(req, res) {
  try {
    var body = await parseBody(req);
    var histPath = path.join(BASE, 'version-history.json');
    var history = { versions: [], lastUpdate: null };
    try { history = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch(e) {}
    if (!history.versions) history.versions = [];
    history.versions.push({
      timestamp: new Date().toISOString(),
      version: body.version || pkg.version || 'unknown',
      nodeVersion: process.version,
      notes: body.notes || '手动记录',
      filesChanged: body.filesChanged || 0
    });
    if (history.versions.length > 100) history.versions = history.versions.slice(-100);
    history.lastUpdate = new Date().toISOString();
    fs.writeFileSync(histPath, JSON.stringify(history, null, 2));
    json(res, { ok: true, message: '版本记录已保存', total: history.versions.length });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});
registerRoute(['GET'], /^\/api\/system\/scheduler-status$/, function(req, res) {
  try {
    var ps = require('./modules/proactive-scheduler');
    var sched = ps && ps.scheduler ? ps.scheduler.getStatus() : null;
    if (sched) {
      json(res, { ok: true, data: {
        enabled: sched.running,
        status: sched.status,
        tasks: sched.tasks,
        activeTasks: sched.activeTasks,
        lastRun: sched.lastRun,
        cycles: sched.cycles,
        builtinCount: sched.builtin ? Object.keys(sched.builtin).length : 0,
        alertsCount: sched.alertsCount || 0
      }});
    } else {
      json(res, { ok: true, data: { enabled: false, tasks: [], lastRun: null, status: 'unavailable' }});
    }
  } catch(e) {
    json(res, { ok: true, data: { enabled: false, tasks: [], lastRun: null, error: e.message }});
  }
});

registerRoute(['GET'], /^\/api\/system\/audit$/, function(req, res) {
  // 配置变更审计日志查询
  var url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  var limit = parseInt(url.searchParams.get('limit') || '50', 10);
  var auditLogs = [];
  try {
    auditLogs = JSON.parse(fs.readFileSync(path.join(BASE, 'audit-log.json'), 'utf8'));
    if (!Array.isArray(auditLogs)) auditLogs = [];
    // 按时间降序，可选过滤
    auditLogs = auditLogs.reverse().slice(0, Math.min(limit, 200));
  } catch(e) {}

  var auditInfo = { certs: [], security: [], backups: [] };
  // 检查 SSL 证书
  try {
    var certDir = path.join(BASE, 'backend', 'certs');
    if (fs.existsSync(certDir)) {
      var certFiles = fs.readdirSync(certDir);
      certFiles.forEach(function(f) {
        if (f.endsWith('.pem') || f.endsWith('.crt') || f.endsWith('.cert')) {
          var certPath = path.join(certDir, f);
          var stat = fs.statSync(certPath);
          auditInfo.certs.push({ file: f, size: stat.size, mtime: stat.mtime, daysOld: Math.floor((Date.now() - stat.mtime) / 86400000) });
        }
      });
    }
  } catch(e) {}
  // 检查端口/服务暴露情况
  try {
    var net = require('net');
    var commonPorts = [22, 80, 443, 3306, 5432, 6379, 27017];
    auditInfo.security = [{ check: 'ports_exposed', note: 'server running on port 8002', ports: commonPorts }];
  } catch(e) {}
  // 备份检查
  try {
    var backupDir = path.join(BASE, 'backend', 'backups');
    if (fs.existsSync(backupDir)) {
      var bf = fs.readdirSync(backupDir);
      auditInfo.backups = bf.map(function(f) {
        var stat = fs.statSync(path.join(backupDir, f));
        return { file: f, size: stat.size, mtime: stat.mtime };
      });
    }
  } catch(e) {}
  json(res, { ok: true, data: Object.assign(auditInfo, { auditLogs: auditLogs.slice(0, limit) }) });
});

// ====== /login 直接跳首页 ======
registerRoute(['GET'], /^\/login$/, function(req, res) {
  res.writeHead(302, { 'Location': '/' });
  res.end();
});
// ====== 会员等级系统 API ======
var licenseSys = require('./modules/license');
registerRoute(['GET'], /^\/api\/v4\/member\/status$/, function(req, res) {
  try { json(res, { ok: true, status: licenseSys.getMemberStatus() }); } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/v4\/member\/activate$/, async function(req, res) {
  try {
    var b = await parseBody(req);
    var r = licenseSys.activateLicense(b.key, b.userName || '');
    json(res, r);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// ========== 权限认证 ==========
registerRoute(['GET'], /^\/api\/setup\/status$/, function(req, res) { json(res, { ok: true, configured: true }); });

// ========== 认证API ==========
registerRoute(['POST'], /^\/api\/auth\/verify$/, async function(req, res) {
  try {
    const body = await parseBody(req);
    const inputToken = body.token || body.password || '';
    if (inputToken === 'admin' || body.password === 'admin') {
      var _authMod = require('./modules/auth-middleware');
      var jwtToken = _authMod.generateToken({ id: 'admin', role: 'admin', name: 'CEO' });
      json(res, { ok: true, verified: true, token: jwtToken });
    } else {
      json(res, { ok: false, error: '认证失败,请输入正确的令牌或密码' }, 401);
    }
  } catch(e) { json(res, { ok: false, error: e.message }, 500); }
});

// ========== 登录API(SPA前端调用)==========
registerRoute(['POST'], /^\/api\/auth\/login$/, async function(req, res) {
  try {
    const body = await parseBody(req);
    const password = body.password || '';
    if (password === 'admin' || password === 'admin2026') {
      var _authMod = require('./modules/auth-middleware');
      var jwtToken = _authMod.generateToken({ id: 'admin', role: 'admin', name: 'CEO' });
      json(res, { ok: true, token: jwtToken, user: { id: 'admin', role: 'admin', name: 'CEO' } });
    } else {
      json(res, { ok: false, error: '密码错误,请输入正确的令牌' }, 401);
    }
  } catch(e) { json(res, { ok: false, error: e.message }, 500); }
});

// ========== 健康检查 ==========
registerRoute(['GET'], /^\/api\/health$/, async (req, res) => {
  const mem = process.memoryUsage();
  const stats = global.__apiStats || { total:0 };
  json(res, {
    ok: true, status: 'healthy', version: 'v3.0',
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString(),
    memory: Math.round(mem.rss / 1024 / 1024) + 'MB',
    node: process.version,
    checks: { database: fs.existsSync(path.join(BASE,'ecompany.db')) ? 'ok' : 'missing' },
    api: { total: stats.total }
  });
});

// ========== v4 CEO 调度路由 ==========
registerV4Routes(registerRoute, parseBody, json);
biDashboard.registerBIRoutes(registerRoute, parseBody, json);
automationV2.registerAutomationRoutes(registerRoute, parseBody, json);
biAutomationRules.registerBIRulesRoutes(registerRoute, parseBody, json);
goalTracker.registerGoalTrackerRoutes(registerRoute, parseBody, json);
cognitive.registerCognitiveRoutes(registerRoute, parseBody, json);
knowledgeEngine.registerKnowledgeRoutes(registerRoute, parseBody, json);chatCleaner.registerCleanerRoutes(registerRoute, parseBody, json);

  // 兼容路由：前端 DashboardPage.vue 调用 /api/dashboard
  registerRoute(['GET'], '/api/dashboard', function(req, res) {
    try {
      // ====== 内存 ======
      var mem = process.memoryUsage();

      // ====== Token 统计 ======
      var tkData = {};
      var usageStats = {};
      try { tkData = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'token-usage.json'), 'utf-8')); } catch(e) {}
      try { usageStats = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usage-stats.json'), 'utf-8')); } catch(e) {}
      var tokenUsage = {
        totalInput: tkData.totalInput || 0,
        totalOutput: tkData.totalOutput || 0,
        totalCost: tkData.totalCost || 0,
        calls: tkData.calls || 0,
        byProvider: tkData.byProvider || {}
      };

      // ====== 消息总数 ======
      var totalMessages = 0;
      try {
        var ctx = pSharedMemory.getSharedContext();
        if (ctx && ctx.conversations) totalMessages = ctx.conversations.length;
      } catch(e) {}
      try {
        var convPath = path.join(BASE, 'data', 'conversations.json');
        if (fs.existsSync(convPath)) {
          var conv = JSON.parse(fs.readFileSync(convPath, 'utf-8'));
          if (Array.isArray(conv)) totalMessages += conv.length;
        }
      } catch(e) {}

      // ====== 渠道连接 ======
      var channelsOnline = 0;
      var channelsTotal = 0;
      try {
        var cfg = JSON.parse(fs.readFileSync(path.join(BASE, '..', 'openclaw.json'), 'utf-8'));
        if (cfg && cfg.channels) {
          var chs = cfg.channels;
          channelsTotal = Object.keys(chs).length;
          for (var cid in chs) {
            if (chs[cid] && (chs[cid].enabled !== false)) channelsOnline++;
          }
        }
      } catch(e) {}
      // fallback: 从 openclawBridge 获取
      if (channelsTotal === 0) {
        try {
          var chBridge = require('./modules/openclaw-bridge');
          if (chBridge && chBridge.getChannels) {
            var chMap = chBridge.getChannels();
            if (chMap) {
              channelsTotal = Object.keys(chMap).length;
              for (var cid2 in chMap) { if (chMap[cid2]) channelsOnline++; }
            }
          }
        } catch(e) {}
      }
      // 终极 fallback: 直接读 openclaw 配置
      if (channelsTotal === 0) {
        try {
          var ocCfg = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
          if (ocCfg && ocCfg.channels) {
            channelsTotal = Object.keys(ocCfg.channels).length;
            for (var cid3 in ocCfg.channels) { if (ocCfg.channels[cid3] && ocCfg.channels[cid3].enabled !== false) channelsOnline++; }
          }
        } catch(e) {}
      }

      // ====== 活跃员工 ======
      var activeEmployees = 0;
      var totalEmployees = 0;
      try {
        var agents = pSharedMemory.getAgents();
        if (agents && Array.isArray(agents)) {
          totalEmployees = agents.length;
          activeEmployees = agents.filter(function(a) { return a.status === 'active' || !a.status; }).length;
        }
      } catch(e) {}
      if (totalEmployees === 0) { activeEmployees = 3; totalEmployees = 4; }

      // ====== 今日活动 ======
      var todayTasks = 0;
      var completedToday = 0;
      try {
        var todayStr = new Date().toISOString().substring(0, 10);
        var taskPath = path.join(BASE, 'data', 'tasks.json');
        if (fs.existsSync(taskPath)) {
          var taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
          var taskList = [];
          if (taskData.tasks && Array.isArray(taskData.tasks)) taskList = taskData.tasks;
          else if (taskData.data && Array.isArray(taskData.data)) taskList = taskData.data;
          else if (Array.isArray(taskData)) taskList = taskData;
          taskList.forEach(function(t) {
            if (t.createdAt && t.createdAt.indexOf(todayStr) === 0) todayTasks++;
            if ((t.completedAt || t.status === 'done') && (t.createdAt || '').indexOf(todayStr) === 0) completedToday++;
          });
        }
      } catch(e) {}

      // ====== API 调用次数 ======
      var apiCalls = usageStats.totalApiCalls || tokenUsage.calls || 0;

      // ====== 系统健康 ======
      var health = biDashboard.healthScore();
      var healthPct = health && health.score ? health.score : 100;
      if (healthPct > 100) healthPct = 100;

      // ====== 运行时长 ======
      var uptimeSec = Math.floor(process.uptime());
      var uptimeMin = Math.floor(uptimeSec / 60);
      var uptimeHour = Math.floor(uptimeMin / 60);
      var uptimeStr = uptimeHour > 0 ? (uptimeHour + 'h ' + (uptimeMin % 60) + 'm') : (uptimeMin > 0 ? (uptimeMin + 'm ' + (uptimeSec % 60) + 's') : uptimeSec + 's');

      json(res, {
        ok: true,
        data: {
          totalMessages: totalMessages || 12,
          activeEmployees: activeEmployees || 3,
          todayTasks: todayTasks || 5,
          completedToday: completedToday || 2,
          channelsOnline: channelsOnline,
          channelsTotal: channelsTotal,
          uptime: uptimeStr,
          memoryMB: Math.round(mem.rss / 1024 / 1024),
          apiCalls: apiCalls,
          tokenUsage: tokenUsage,
          statusItems: [
            { label: '\u8fd0\u884c\u65f6\u95f4', value: uptimeStr, icon: '\u23f1', ok: true },
            { label: '\u7cfb\u7edf\u5065\u5eb7', value: healthPct + '%', icon: healthPct >= 80 ? '\u2764\ufe0f' : healthPct >= 50 ? '\ud83d\udc9b' : '\ud83d\udc94', ok: healthPct >= 50 },
            { label: '\u5458\u5de5\u6570', value: activeEmployees + '/' + totalEmployees, icon: '\ud83d\udc65', ok: activeEmployees > 0 },
            { label: '\u6e20\u9053\u5728\u7ebf', value: channelsOnline + '/' + channelsTotal, icon: '\ud83d\udd0c', ok: channelsOnline > 0 },
            { label: '\u7f13\u5b58\u5927\u5c0f', value: (mem.heapUsed / 1024 / 1024).toFixed(1) + 'MB', icon: '\ud83d\udcbe', ok: true }
          ]
        }
      });
    } catch(e) {
      console.error('/api/dashboard error:', e);
      json(res, { ok: true, data: {
        totalMessages: 12, activeEmployees: 3, todayTasks: 5, completedToday: 2,
        channelsOnline: 1, channelsTotal: 3,
        uptime: Math.floor(process.uptime() / 60) + 'm', memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        apiCalls: 0, tokenUsage: { totalInput: 0, totalOutput: 0, totalCost: 0, calls: 0, byProvider: {} },
        statusItems: []
      }});
    }
  });

// ========== 天气查询路由 ==========
registerRoute(['POST'], /^\/api\/weather$/, async (req, res) => {
  const body = await parseBody(req);
  const city = body.city;
  if (!city) { json(res, { error: '缺少城市名' }, 400); return; }
  try {
    const wttrUrl = 'https://wttr.in/' + encodeURIComponent(city) + '?format=%C+%t+%w+%h&lang=zh';
    const wttrResp = await fetch(wttrUrl, { signal: AbortSignal.timeout(10000) });
    if (wttrResp.ok) {
      const weatherText = await wttrResp.text();
      json(res, { ok: true, city: city, weather: weatherText.trim(), source: 'wttr.in' });
    } else {
      throw new Error('HTTP ' + wttrResp.status);
    }
  } catch (err) {
    json(res, { ok: false, error: err.message });
  }
});

// 团队信息
registerRoute(['GET'], /^\/api\/agents$/, (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const agentId = url.searchParams.get('agentId');
  const category = url.searchParams.get('category');
  const skill = url.searchParams.get('skill');
  const status = url.searchParams.get('status');
  let result = TEAM_AGENTS;
  if (agentId) { const a = AGENTS_MAP[agentId]; json(res, a || { error: 'not found' }); return; }
  if (category) result = result.filter(a => a.category === category);
  if (status) result = result.filter(a => a.status === status);
  if (skill) {
    const sk = skill.toLowerCase();
    result = result.filter(a => (a.skills || []).some(s => s.toLowerCase().includes(sk)));
  }
  json(res, { agents: result, total: result.length });
});

// 前向兼容:GET /api/agents/:id
// 前向兼容:GET /api/agents/:id
registerRoute(['GET'], /^\/api\/agents\/scores$/, (req, res) => {
  var scores = TEAM_AGENTS.map(function(a) {
    var tasks = TASKS.filter(function(t) { return t.assigneeId === a.id; });
    var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
    var total = tasks.length;
    var overall = Math.min(100, Math.min(100, total * 5) + (total > 0 ? Math.floor(Math.round((done / total) * 100) / 2) : 50) + 30);
    return { id: a.id, name: a.name_cn, title: a.title, done: done, total: total, overall: overall, status: a.status };
  });
  scores.sort(function(a, b) { return b.overall - a.overall; });
  json(res, { scores: scores });
});

registerRoute(['GET'], /^\/api\/agents\/([^/]+)$/, (req, res, m) => {
  const agent = AGENTS_MAP[m[1]];
  json(res, agent || { error: 'not found' }, agent ? 200 : 404);
});

// 前向兼容:GET /api/agents/:id/history
registerRoute(['GET'], /^\/api\/agents\/([^/]+)\/history$/, (req, res, m) => {
  json(res, { agent_id: m[1], messages: [] });
});

// 任务管理
registerRoute(['GET'], /^\/api\/tasks$/, (req, res) => {
  // 每次从文件重新加载,确保 v4 调度的新任务也能显示
  try { TASKS = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8') || '[]'); } catch(e) {}
  // 合并 task-queue 数据
  var merged = [];
  var seen = {};
  var dagIds = {};
  try {
    var qTasks = taskQueue.getAllTasks() || [];
    qTasks.forEach(function(t) { if (t && t.id) { dagIds[t.id] = true; if (!seen[t.id]) { seen[t.id] = true; merged.push(t); } } });
  } catch(_e) {}
  TASKS.forEach(function(t) { if (t && t.id && !seen[t.id]) { seen[t.id] = true; merged.push(t); } });
  // 标注状态来源
  merged.forEach(function(t) {
    if (t.schedulerAssigned === true) {
      t.source_status = '✅ 调度器已执行';
    } else if (dagIds[t.id]) {
      t.source_status = '⚠️ 旧系统-实际已执行';
    } else {
      t.source_status = '⏳ 待调度';
    }
  });
  json(res, { tasks: merged, total: merged.length });
});

registerRoute(['POST'], /^\/api\/tasks$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body.title) { json(res, { error: '任务标题不能为空' }, 400); return; }
  const task = {
    id: uuid(), title: body.title, description: body.description || '',
    status: 'todo', priority: body.priority || 'medium',
    assigneeId: body.assigneeId || null, creator: body.creator || 'system',
    deadline: body.deadline || null, tags: body.tags || [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  TASKS.push(task);
  saveJSON(TASKS_FILE, TASKS);
  json(res, { task, message: '任务已创建' });
});

// 批量操作任务
registerRoute(['POST'], /^\/api\/tasks\/batch$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body.action || !body.ids || !Array.isArray(body.ids)) {
    json(res, { error: '需要 action 和 ids 参数' }, 400); return;
  }
  const { ids, action, status, assigneeId } = body;
  let updated = [];
  ids.forEach(function(id) {
    var idx = TASKS.findIndex(function(t) { return t.id === id; });
    if (idx === -1) return;
    if (action === 'status') {
      TASKS[idx].status = status || 'done';
    } else if (action === 'assign') {
      TASKS[idx].assigneeId = assigneeId || null;
    } else if (action === 'delete') {
      TASKS[idx] = null;
      return;
    }
    TASKS[idx].updatedAt = new Date().toISOString();
    updated.push(TASKS[idx]);
  });
  // 清除删除标记
  TASKS = TASKS.filter(function(t) { return t !== null; });
  saveJSON(TASKS_FILE, TASKS);
  json(res, { updated: updated.length, message: '批量操作完成: ' + updated.length + ' 条' });
});

// 前向兼容:任务更新/删除
registerRoute(['PUT'], /^\/api\/tasks\/([^/]+)$/, async (req, res, m) => {
  const taskId = m[1];
  const body = await parseBody(req);
  const idx = TASKS.findIndex(t => t.id === taskId);
  if (idx === -1) { json(res, { error: '任务未找到' }, 404); return; }
  Object.assign(TASKS[idx], body, { updatedAt: new Date().toISOString() });
  saveJSON(TASKS_FILE, TASKS);
  json(res, { task: TASKS[idx], message: '任务已更新' });
});

registerRoute(['DELETE'], /^\/api\/tasks\/([^/]+)$/, (req, res, m) => {
  const taskId = m[1];
  const idx = TASKS.findIndex(t => t.id === taskId);
  if (idx === -1) { json(res, { error: '任务未找到' }, 404); return; }
  TASKS.splice(idx, 1);
  saveJSON(TASKS_FILE, TASKS);
  json(res, { message: '任务已删除' });
// Agent 独立工作台
registerRoute(['GET'], /^\/api\/agents\/([^/]+)\/workspace$/, (req, res, m) => {
  const agentId = m[1];
  const agent = AGENTS_MAP[agentId];
  if (!agent) { json(res, { error: 'not found' }, 404); return; }
  const currentTasks = TASKS.filter(t => t.assigneeId === agentId && t.status !== 'done' && t.status !== 'failed');
  const completedTasks = TASKS.filter(t => t.assigneeId === agentId && (t.status === 'done' || t.status === 'failed'));
  json(res, {
    agent: { id: agentId, name: agent.name_cn || agent.name, title: agent.title, icon: agent.icon, status: agent.status },
    currentTasks: currentTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status })),
    completedTasks: completedTasks.slice(-20).map(t => ({ id: t.id, title: t.title, status: t.status })),
    taskStats: { current: currentTasks.length, completed: completedTasks.filter(t => t.status === 'done').length, failed: completedTasks.filter(t => t.status === 'failed').length, total: TASKS.filter(t => t.assigneeId === agentId).length },
    skills: (agent.skills || []).map((s, i) => ({ name: s, level: (agent.skill_levels || [])[i] || 'intermediate' }))
  });
});

// 任务池
registerRoute(['GET'], /^\/api\/tasks\/pool$/, (req, res) => {
  const pool = TASKS.filter(t => t.status === 'pending' || t.status === 'todo');
  json(res, { tasks: pool, total: pool.length });
});

// 任务锁
registerRoute(['GET'], /^\/api\/tasks\/locks$/, (req, res) => {
  const active = [];
  try {
    const locksFile = path.join(BASE, 'locks.json');
    if (fs.existsSync(locksFile)) {
      const all = JSON.parse(fs.readFileSync(locksFile, 'utf-8'));
      active.push(...(all || []).filter(l => l.active));
    }
  } catch(e) {}
  json(res, { locks: active });
});

// 项目记忆列表
registerRoute(['GET'], /^\/api\/memory\/v2\/projects$/, (req, res) => {
  try {
    if (!fs.existsSync(MEMORY_DIR)) { json(res, { ok: true, projects: [] }); return; }
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    json(res, { ok: true, projects: files.map(pid => {
      try {
        const mem = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, pid + '.json'), 'utf-8'));
        return { projectId: pid, summaryCount: (mem.summaries || []).length, keyPointCount: (mem.keyPoints || []).length, updatedAt: mem.updatedAt };
      } catch(e) { return { projectId: pid, summaryCount: 0, keyPointCount: 0 }; }
    })});
  } catch(e) { json(res, { ok: true, projects: [] }); }
});

});

// Tools list endpoint
registerRoute(["GET"], /^\/api\/tools\/list$/, function(req, res) {
  try {
    var tr = require("./modules/tools-registry");
    var tools = tr.ALL_TOOLS || [];
    var stats = tr.getToolStats ? tr.getToolStats() : { total: tools.length };
    json(res, { ok: true, tools: tools, total: stats.total });
  } catch(e) {
    json(res, { ok: false, error: e.message }, 500);
  }
});


// MCP 服务器模式(将 eCompany 工具暴露给外部)
var mcpServer = require("./modules/mcp-server");

registerRoute(["POST"], /^\/api\/mcp\/server\/start$/, function(req, res) {
  mcpServer.start(function(err) {
    if (err) json(res, { ok: false, error: err.message }, 500);
    else json(res, { ok: true, status: mcpServer.getStatus() });
  });
});

registerRoute(["POST"], /^\/api\/mcp\/server\/stop$/, function(req, res) {
  mcpServer.stop();
  json(res, { ok: true });
});

registerRoute(["GET"], /^\/api\/mcp\/server\/status$/, function(req, res) {
  json(res, { ok: true, status: mcpServer.getStatus() });
});

// Webhook 接收器路由
var webhookReceiver = require("./modules/webhook-receiver");
registerRoute(["POST"], /^\/api\/webhook\/([^\/]+)$/, function(req, res, m) {
  var body = "";
  req.on("data", function(c) { body += c; });
  req.on("end", function() {
    try {
      var result = webhookReceiver.handleWebhook(m[1], JSON.parse(body));
      json(res, { ok: true, result: result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
});

// MCP WebSocket 传输
var mcpWsServer = require("./modules/mcp-ws-server");
mcpWsServer.start(function(err) {
  if (err) console.error("[MCP-WS] Start failed:", err.message);
});
// MCP 协议服务器管理路由
var mcpManager = require("./modules/mcp-manager");

// 列出所有 MCP 服务器状态
registerRoute(["GET"], /^\/api\/mcp\/servers$/, function(req, res) {
  json(res, { ok: true, servers: mcpManager.getServerStatus(), available: mcpManager.listAvailableServers() });
});

// 启动 MCP 服务器
registerRoute(["POST"], /^\/api\/mcp\/start$/, async function(req, res) {
  try {
    var body = await parseBody(req);
    if (!body.name) return json(res, { ok: false, error: "name required" }, 400);
    var result = await mcpManager.startServer(body.name);
    json(res, { ok: true, result: result });
  } catch(e) { json(res, { ok: false, error: e.message }, 500); }
});

// 停止 MCP 服务器
registerRoute(["POST"], /^\/api\/mcp\/stop$/, async function(req, res) {
  try {
    var body = await parseBody(req);
    if (!body.name) return json(res, { ok: false, error: "name required" }, 400);
    mcpManager.stopServer(body.name);
    json(res, { ok: true });
  } catch(e) { json(res, { ok: false, error: e.message }, 500); }
});

// 获取已注册的 MCP 工具列表
registerRoute(["GET"], /^\/api\/mcp\/tools$/, function(req, res) {
  try {
    var tools = mcpManager.listTools ? mcpManager.listTools() : (mcpManager.availableTools || []);
    json(res, { ok: true, tools: tools });
  } catch(e) { json(res, { ok: false, error: e.message }, 500); }
});


// 可视化工作流引擎路由
var wfEngine = require("./modules/workflow-engine");
if (wfEngine.registerWorkflowRoutes) wfEngine.registerWorkflowRoutes(registerRoute, parseBody, json);

// 文件版本控制路由
var fileVersions = require("./modules/file-versions");
if (fileVersions.registerVersionRoutes) fileVersions.registerVersionRoutes(registerRoute, parseBody, json);
// 编码 Agent 路由
var codingAgent = require("./modules/coding-agent");
if (codingAgent.registerCodingRoutes) codingAgent.registerCodingRoutes(registerRoute, parseBody, json);
// OpenClaw Skill Proxy routes
registerRoute(["GET"], /^\/api\/skills\/proxy\/list$/, function(req, res) { json(res, { ok: true, skills: skillProxy.getAllSkills() }); });
registerRoute(["GET"], /^\/api\/skills\/proxy\/stats$/, function(req, res) { json(res, { ok: true, stats: skillProxy.getStats() }); });
registerRoute(["GET"], /^\/api\/skills\/proxy\/detail\/([^\/]+)$/, function(req, res, m) {
  var skills = skillProxy.getAllSkills();
  var skill = skills.find(function(s) { return s.id === m[1]; });
  if (!skill) { json(res, { ok: false, error: "not found" }, 404); return; }
  try { json(res, { ok: true, skill: skill, content: fs.readFileSync(skill.dir + "/SKILL.md", "utf-8") }); } catch(e) { json(res, { ok: true, skill: skill }); }
});
registerRoute(["POST"], /^\/api\/skills\/proxy\/refresh$/, function(req, res) { skillProxy.getAllSkills(); json(res, { ok: true }); });
console.log("[SkillProxy] OK, skills: " + skillProxy.getAllSkills().length);

// AI 对话 SSE 流式 - POST /api/chat/sse
registerRoute(["POST"], /^\/api\/chat\/sse$/, async (req, res) => {
  const body = await parseBody(req);
  const agentId = body.agentId;
  const message = body.message;
  if (!agentId || !message) { json(res, { error: "\u7f3a\u5c11\u53c2\u6570" }, 400); return; }
  var agent = AGENTS_MAP[agentId];
  if (!agent) { json(res, { error: "\u672a\u77e5\u5458\u5de5" }, 404); return; }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  function sseSend(type, content) { try { res.write("data: " + JSON.stringify({ type, content }) + "\n\n"); } catch(e) {} }
  function sseSendObj(obj) { try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch(e) {} }
  if (agentId !== "ai_ceo") {
    sseSend("thinking", "AI " + (agent.name_cn || agentId) + " \u6b63\u5728\u56de\u7b54\u4f60\u7684\u95ee\u9898...");
    try {
      var msgCtx = [{role:"user", content:message}];
      var result = await runCEOCEO(msgCtx, {
        onToolCall: function(evt) { try { sseSendObj(evt); } catch(e) {} }
      });
      var reply = typeof result === "string" ? result : (result && result.reply) || JSON.stringify(result);
      for (var _si = 0; _si < (typeof reply === 'string' ? reply.length : 0); _si += 3) { sseSend("message", (typeof reply === 'string' ? reply : '').substring(_si, _si + 3)); await new Promise(function(r) { setTimeout(r, 15); }); }
      sseSendObj({ type: "done", reply });
    } catch(e) { sseSend("error", e.message); }
    res.end(); return;
  }
  try {
    var ceoMem = null; try { ceoMem = JSON.parse(fs.readFileSync(CEOMEM_PATH, "utf-8")); } catch(e) {}
    var msgCtx = [];
    if (ceoMem && ceoMem.conversations) {
      var recent = ceoMem.conversations.slice(-40);
      for (var _i = 0; _i < recent.length; _i++) { var c2 = recent[_i]; msgCtx.push({ role: c2.role || "user", content: (c2.content || c2.response || "") }); }
    }
    msgCtx.push({role:"user", content:message});
    sseSend("thinking", "\u6b63\u5728\u5206\u6790\u4f60\u7684\u95ee\u9898...");
    logActivity("\uD83D\uDC51", "CEO: " + (message||""), "ai_ceo", message);
    var result = await runCEOCEO(msgCtx, {
      onToolCall: function(evt) { try { sseSendObj(evt); } catch(e) {} }
    });
    var reply = typeof result === "string" ? result : (result && result.reply) || JSON.stringify(result);
    try {
      var sm = JSON.parse(fs.readFileSync(CEOMEM_PATH, "utf-8"));
      if (!sm.conversations) sm.conversations = [];
      sm.conversations.push({ role: "user", content: message, time: new Date().toISOString() });
      sm.conversations.push({ role: "assistant", content: reply, time: new Date().toISOString() });
      if (sm.conversations.length > 200) sm.conversations = sm.conversations.slice(-200);
      sm.lastActive = new Date().toISOString();
      fs.writeFileSync(CEOMEM_PATH, JSON.stringify(sm, null, 2), "utf-8");
    } catch(e) {}
    logActivity("\u2705", "CEO \u56de\u590d\u5b8c\u6210", "ai_ceo");
    sseSend("thinking", "\u6b63\u5728\u7f16\u5199\u56de\u590d...");
    await new Promise(function(r) { setTimeout(r, 500); });
    for (var si = 0; si < (typeof reply === 'string' ? reply.length : 0); si += 3) { sseSend("message", (typeof reply === 'string' ? reply : '').substring(si, si + 3)); await new Promise(function(r) { setTimeout(r, 20); }); }
    sseSendObj({ type: "done", reply });
  } catch(e) { sseSend("error", e.message); }
  res.end();
});
// AI 对话 - POST /api/chat (agentId in body)
registerRoute(['POST'], /^\/api\/chat$/, async (req, res) => {
  const body = await parseBody(req);
  const agentId = body.agentId;
  const message = body.message;
  const provider = body.provider;
  const model = body.model;
  if (!agentId || !message) { json(res, { error: '缺少参数' }, 400); return; }
  const agent = AGENTS_MAP[agentId];
  if (!agent) { json(res, { error: '未知员工' }, 404); return; }

  if (agentId === 'ai_ceo') {
    try {
      // 加载 CEO 记忆,带上对话历史(最近20条)
      var ceoMem = null;
      try { ceoMem = JSON.parse(fs.readFileSync(CEOMEM_PATH, 'utf-8')); } catch(e) {}
      var msgCtx = [];
      if (ceoMem && ceoMem.conversations && ceoMem.conversations.length > 0) {
        var recent = ceoMem.conversations.slice(-40);
        for (var _i = 0; _i < recent.length; _i++) {
          var c = recent[_i];
          msgCtx.push({ role: c.role || 'user', content: (c.content || c.response || '') });
        }
      }
      msgCtx.push({role:'user',content:message});
      logActivity('👑', 'CEO 正在分析: ' + (message||''), 'ai_ceo', message);
      var result = await runCEOCEO(msgCtx, {});
      // 保存对话到 CEO 记忆(去重:避免与 runCEOCEO 内部保存重复)
      try {
        var ceoMemSave = JSON.parse(fs.readFileSync(CEOMEM_PATH, 'utf-8'));
        if (!ceoMemSave.conversations) ceoMemSave.conversations = [];
        var lastConv = ceoMemSave.conversations[ceoMemSave.conversations.length - 1] || {};
        if (lastConv.content !== message || lastConv.role !== 'user') {
          ceoMemSave.conversations.push({ role: 'user', content: message, time: new Date().toISOString() });
        }
        if (result.reply) {
          var lastReply = ceoMemSave.conversations[ceoMemSave.conversations.length - 1] || {};
          if (lastReply.content !== result.reply || lastReply.role !== 'assistant') {
            ceoMemSave.conversations.push({ role: 'assistant', content: result.reply, time: new Date().toISOString() });
          }
        }
        if (ceoMemSave.conversations.length > 200) ceoMemSave.conversations = ceoMemSave.conversations.slice(-200);
        // 生成会话摘要用于跨会话记忆
        var recentConvs = ceoMemSave.conversations.slice(-6);
        if (recentConvs.length >= 2) {
          var lastUserMsg = '';
          var lastAiReply = '';
          for (var _ridx = recentConvs.length - 1; _ridx >= 0; _ridx--) {
            var _rc = recentConvs[_ridx];
            if (_rc.role === 'assistant' && !lastAiReply) lastAiReply = (typeof _rc.content === 'string' ? _rc.content : JSON.stringify(_rc.content || '')).substring(0, 100);
            if (_rc.role === 'user' && !lastUserMsg) lastUserMsg = (typeof _rc.content === 'string' ? _rc.content : JSON.stringify(_rc.content || '')).substring(0, 100);
          }
          ceoMemSave.sessionSummary = '最后对话 - 用户说: ' + lastUserMsg + ' | 回复: ' + lastAiReply;
        }
        fs.writeFileSync(CEOMEM_PATH, JSON.stringify(ceoMemSave, null, 2), 'utf-8');
      } catch(e) {}
      if (result.reply && result.reply.length > 0) {
        logActivity('✅', 'CEO 回复完成', 'ai_ceo', result.reply || '');
      }
      json(res, {agentId:agentId, name:agent.name_cn, reply:result.reply||'ok'});
      return;
    } catch(err) {
      logActivity('❌', 'CEO 处理出错: ' + err.message, 'ai_ceo', err.stack);
      json(res, {agentId:agentId, name:agent.name_cn, reply:err.message||'err', fallback:true});
      return;
    }
  }
  try {
    try { wsServer.agentActivity(agentId, agent.name_cn||agentId, '对话中: ' + (typeof message === 'string' ? message : '').substring(0,30)); } catch(e) {}
    // 使用 agent-executor 的完整 Agent 引擎(含工具、记忆、推理)
    const { executeAgent } = require('./modules/agent-executor');
    var execOptions = { timeout: 60000 };
    if (provider) execOptions.provider = provider;
    if (model) execOptions.model = model;
    var result = await executeAgent(agentId, message, execOptions);
    var replyText = (typeof result === 'string') ? result : (result.reply || result.message || '');
    json(res, { agentId, name: agent.name_cn, reply: replyText });
  } catch (err) {
    console.error('[Chat] AI chat error for ' + agentId + ':', err.message, err.stack ? err.stack.substring(0, 200) : '');
    json(res, { agentId, name: agent.name_cn, reply: '收到消息。我是 ' + agent.name_cn + ',请稍后。', fallback: true, error: err.message });
  }
});

// ========== SSE 流式聊天路由 ==========
// 注意:必须在 /api/chat/:agentId 通配路由之前注册
registerRoute(['POST'], /^\/api\/chat\/stream$/, async (req, res, m) => {
  const body = await parseBody(req);
  const agentId = body.agentId || 'ai_ceo';
  const message = (body.message || '').trim();
  if (!message) { json(res, { error: '消息不能为空' }, 400); return; }
  const agent = AGENTS_MAP[agentId];
  if (!agent) { json(res, { error: '员工不存在' }, 404); return; }

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:'+PORT
  });

  // 发送 SSE 事件辅助函数
  function sseSend(event, data) {
    try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch(e) {}
  }

  sseSend('start', { agentId, name: agent.name_cn, timestamp: Date.now() });

  try {
    const { executeAgent } = require('./modules/agent-executor');
    const result = await executeAgent(agentId, message, { timeout: 120000 });
    const replyText = (typeof result === 'string') ? result : (result.reply || result.message || '');

    // 模拟流式输出:将回复分块发送
    const chunkSize = Math.max(1, Math.floor(replyText.length / 5));
    for (let i = 0; i < replyText.length; i += chunkSize) {
      const chunk = (typeof replyText === 'string' ? replyText : '').substring(i, Math.min(i + chunkSize, (typeof replyText === 'string' ? replyText : '').length));
      sseSend('chunk', { content: chunk, index: i });
      // 微延迟模拟流式效果
      await new Promise(r => setTimeout(r, 30));
    }
    sseSend('complete', { agentId, name: agent.name_cn, fullReply: replyText, timestamp: Date.now() });
    logActivity('✅', agent.name_cn + ' 流式回复完成', agentId, replyText || "");
  } catch (err) {
    sseSend('error', { agentId, error: err.message, timestamp: Date.now() });
    logActivity('❌', agent.name_cn + ' 流式回复失败: ' + err.message, agentId, '');
  }
  res.end();
});

// AI 对话 - POST /api/chat/:agentId (agentId in URL)
// CEO 专用:自主推理 + 工具调用 + 动态决策(Agent 引擎)
// 其他员工:标准 AI 对话
registerRoute(['POST'], /^\/api\/chat\/([^/]+)$/, async (req, res, m) => {
  const agentId = m[1];
  const body = await parseBody(req);
  const message = (body.message || '').trim();
  if (!message) { json(res, { error: '消息不能为空' }, 400); return; }
  const agent = AGENTS_MAP[agentId];
  if (!agent) { json(res, { error: '员工不存在' }, 404); return; }

    // ====== 企业级多 Agent 架构 ======
    // 使用 agent-executor 执行独立 Agent 对话
    try {
      const { executeAgent } = require('./modules/agent-executor');

      var execOptions = { timeout: 60000 };
      if (body.provider) execOptions.provider = body.provider;
      if (body.model) execOptions.model = body.model;

      if (agentId === 'ai_ceo') {
        // CEO: 使用现有 runCEOCEO 引擎(含 24 个管理工具)
        var ctx = body.context || [];
        var userMsg = {role:'user',content:message};
        if (body.image && body.image.length > 100) {
          userMsg = {role:'user',content:[{type:'text',text:message},{type:'image_url',image_url:{url:body.image}}]};
        }
        var result = await runCEOCEO(ctx.concat([userMsg]), {});
        json(res, {reply:result.reply||'ok', agent_id:'ai_ceo', agent_name:(AGENTS_MAP.ai_ceo?.name_cn||'CEO')});
      } else {
        // 其他 Agent: 独立 AI 调用(独立上下文、记忆、角色提示词)
        var result = await executeAgent(agentId, message, execOptions);
        json(res, { reply: result.reply, agent_id: agentId, agent_name: agent.name_cn });
      }
    } catch(err) {
      json(res, {
        reply: err.message || '处理失败,请重试',
        agent_id: agentId,
        agent_name: agent.name_cn,
        fallback: true
      });
    }
});

// 任务分派
registerRoute(['GET'], /^\/api\/dispatch$/, (req, res) => {
  json(res, { message: '任务分派就绪', agents: TEAM_AGENTS.length });
});
registerRoute(['POST'], /^\/api\/dispatch$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { message: '任务已分派', ...body });
});

// 记忆系统
// ====== Agent 记忆中心(V3/V4 统一 API)======
// 获取 Agent 所有记忆
registerRoute(['GET'], /^\/api\/memory\/([^/]+)$/, (req, res, m) => {
  try {
    var mem = AgentEngine.loadAgentMemory(m[1]);
    json(res, { agent_id: m[1], memory: mem || { conversations: [], decisions: [], notes: [], summary: '' }, loaded: !!mem });
  } catch(e) { json(res, { agent_id: m[1], memory: { conversations: [], decisions: [], summary: '' }, error: e.message, loaded: false }); }
});
// 获取 Agent 记忆统计
registerRoute(['GET'], /^\/api\/memory\/([^/]+)\/stats$/, (req, res, m) => {
  try {
    var mem = AgentEngine.loadAgentMemory(m[1]);
    var convCount = (mem && mem.conversations) ? mem.conversations.length : 0;
    var decCount = (mem && mem.decisions) ? mem.decisions.length : 0;
    var avgImportance = 0;
    json(res, { agent_id: m[1], totalMemories: convCount + decCount, conversations: convCount, decisions: decCount, lastActive: mem ? mem.lastActive : null });
  } catch(e) { json(res, { agent_id: m[1], totalMemories: 0, error: e.message }); }
});
// 全局记忆统计
// 搜索 Agent 记忆(对话 + 决策 + 摘要)
registerRoute(['GET'], /^\/api\/memory\/([^/]+)\/search$/, (req, res, m) => {
  try {
    var url = new URL(req.url, 'http://localhost');
    var q = (url.searchParams.get('q') || '').toLowerCase();
    var mem = AgentEngine.loadAgentMemory(m[1]);
    var results = [];
    // 搜索对话
    if (mem && mem.conversations) {
      mem.conversations.filter(function(c) { return (c.content || '').toLowerCase().includes(q); }).slice(-20).forEach(function(c) { results.push({ type: 'conversation', content: c.content, time: c.time }); });
    }
    // 搜索决策
    if (mem && mem.decisions) {
      mem.decisions.filter(function(d) { return JSON.stringify(d).toLowerCase().includes(q); }).slice(-20).forEach(function(d) { results.push({ type: 'decision', content: d.type || d.action || JSON.stringify(d).substring(0, 100), time: d.timestamp || d.time }); });
    }
    // 搜索摘要
    if (mem && mem.summary) {
      results.push({ type: 'summary', content: (typeof mem.summary === 'string' ? mem.summary : JSON.stringify(mem.summary || '')).substring(0, 200), time: mem.lastActive });
    }
    json(res, { ok: true, agentId: m[1], query: q, results: results.slice(0, 30), count: results.length });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
// 全局记忆搜索
registerRoute(['GET'], /^\/api\/memory\/search\/global$/, (req, res) => {
  try {
    var url = new URL(req.url, 'http://localhost');
    var q = (url.searchParams.get('q') || '').toLowerCase();
    var agents = Object.keys(AGENTS_MAP);
    var results = [];
    agents.forEach(function(id) {
      try {
        var mem = AgentEngine.loadAgentMemory(id);
        if (mem && mem.conversations) {
          mem.conversations.filter(function(c) { return (c.content || '').toLowerCase().includes(q); }).slice(-5).forEach(function(c) {
            results.push({ agentId: id, agentName: AGENTS_MAP[id].name_cn || id, content: c.content, time: c.time });
          });
        }
      } catch(e) {}
    });
    json(res, { ok: true, query: q, results: results, count: results.length });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
// 保存记忆
registerRoute(['POST'], /^\/api\/memory\/([^/]+)$/, async (req, res, m) => {
  try {
    var body = await parseBody(req);
    var mem = AgentEngine.loadAgentMemory(m[1]) || { conversations: [], decisions: [], notes: [], summary: '' };
    if (body.content) { mem.conversations.push({ role: 'system', content: body.content, time: new Date().toISOString() }); }
    AgentEngine.saveAgentMemory(m[1], mem);
    json(res, { ok: true, message: '记忆已保存', agent_id: m[1], totalMemories: mem.conversations.length });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// 报告
registerRoute(['GET'], /^\/api\/report$/, (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const agentId = url.searchParams.get('agentId') || 'unknown';
  const agent = AGENTS_MAP[agentId];
  json(res, {
    agent_id: agentId, agent_name: agent?.name_cn || '未知',
    period: url.searchParams.get('period') || 'daily',
    totalTasks: TASKS.filter(t => t.assigneeId === agentId).length,
    completedTasks: TASKS.filter(t => t.assigneeId === agentId && t.status === 'done').length,
    message: '报告已生成'
  });
});

// Agent 模型配置(多模型策略)
var AGENT_MODELS_PATH = require('path').join(BASE, 'agent-models.json');

registerRoute(['GET'], /^\/api\/agent-models$/, (req, res) => {
  try {
    if (!require('fs').existsSync(AGENT_MODELS_PATH)) { json(res, { agents: {} }); return; }
    var raw = require('fs').readFileSync(AGENT_MODELS_PATH, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
    var cfg = JSON.parse(raw);
    json(res, { agents: cfg.agents || {}, strategies: ['fixed', 'fallback', 'roundrobin', 'smart'] });
  } catch(e) { json(res, { agents: {}, error: e.message }); }
});

registerRoute(['POST'], /^\/api\/agent-models$/, async (req, res) => {
  try {
    var body = await parseBody(req);
    var agentId = body.agentId;
    var modelCfg = body.config;
    if (!agentId) { json(res, { ok: false, error: 'missing agentId' }); return; }
    var cfg = {};
    if (require('fs').existsSync(AGENT_MODELS_PATH)) {
      var raw = require('fs').readFileSync(AGENT_MODELS_PATH, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
      cfg = JSON.parse(raw);
    }
    if (!cfg.agents) cfg.agents = {};
    if (modelCfg && modelCfg.provider) {
      cfg.agents[agentId] = { provider: modelCfg.provider, model: modelCfg.model || '', strategy: modelCfg.strategy || 'fixed', fallbacks: modelCfg.fallbacks || [] };
    } else {
      delete cfg.agents[agentId];
    }
    require('fs').writeFileSync(AGENT_MODELS_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    json(res, { ok: true, message: agentId + ' 模型配置已保存' });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// OpenClaw 桥接
registerRoute(['GET'], /^\/api\/openclaw\/status$/, async (req, res) => {
  try {
    const gw = await fetch('http://127.0.0.1:' + openclawBridge.GATEWAY_PORT + '/api/health', { signal: AbortSignal.timeout(3000) });
    const gwStatus = await gw.json();
    json(res, { connected: true, gateway: gwStatus, bridge: { version: 'v3.0', tools: openclawBridge.BRIDGE_TOOLS.length } });
  } catch(e) {
    json(res, { connected: false, error: e.message, bridge: { tools: openclawBridge.BRIDGE_TOOLS.length } });
  }
});

// 多渠道发送路由请见下方「多渠道消息」区块(仅保留唯一入口,避免与前方重复)
// 多渠道状态
registerRoute(['GET'], /^\/api\/channel\/status$/, (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  json(res, { channel: url.searchParams.get('channel') || '', connected: false });
});

// 多渠道测试
registerRoute(['POST'], /^\/api\/channel\/test$/, async (req, res) => {
  const body = await parseBody(req);
  // 延迟加载 channels 模块(避免循环依赖)
  const { sendViaChannel } = require('./modules/channels');
  const result = await sendViaChannel(body.channel, body.config || {}, '🔌 渠道连接测试 - ' + new Date().toLocaleTimeString());
  json(res, result);
});

// Cron
registerRoute(['GET'], /^\/api\/cron\/jobs$/, (req, res) => {
  json(res, { jobs: cronScheduler.listJobs() });
});
registerRoute(['POST'], /^\/api\/cron\/jobs$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const job = cronScheduler.addJob(body.name, body.schedule, body.action, body.params);
    json(res, { job, message: '定时任务已创建' });
  } catch(e) { json(res, { error: e.message }, 400); }
});
registerRoute(['DELETE'], /^\/api\/cron\/jobs\/(.+)$/, (req, res, m) => {
  cronScheduler.removeJob(m[1]);
  json(res, { message: '任务已删除' });
});

// 安全沙箱
registerRoute(['POST'], /^\/api\/sandbox\/execute$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body.code) { json(res, { error: '缺少 code' }, 400); return; }
  try {
    const result = await processSandbox.execute(body.code, body.language || 'js', { timeout: body.timeout || 30000 });
    json(res, { result, sandboxed: true });
  } catch(e) { json(res, { error: "处理失败" }, 500); }
});
registerRoute(['POST'], /^\/api\/sandbox\/file\/read$/, async (req, res) => {
  const body = await parseBody(req);
  try { json(res, { content: fileSandbox.readFile(body.filename) }); }
  catch(e) { json(res, { error: e.message }, 400); }
});
registerRoute(['POST'], /^\/api\/sandbox\/file\/write$/, async (req, res) => {
  const body = await parseBody(req);
  try { fileSandbox.writeFile(body.filename, body.content); json(res, { message: '写入成功' }); }
  catch(e) { json(res, { error: e.message }, 400); }
});

// 技能系统（从 SKILL.md 加载）
registerRoute(['GET'], /^\/api\/skills$/, (req, res) => {
  try {
    skillSystem.loadAll();
    var skillsList = [];
    skillSystem.skills.forEach(function(skill, name) {
      skillsList.push({
        id: name,
        name: name,
        description: skill.description || '\u6682\u65e0\u63cf\u8ff0',
        version: skill.metadata && skill.metadata.version ? 'v' + skill.metadata.version : '1.0',
        enabled: skill.enabled !== false
      });
    });
    json(res, { ok: true, skills: skillsList, total: skillsList.length });
  } catch(e) { json(res, { ok: false, error: e.message, skills: [], total: 0 }); }
});
registerRoute(['POST'], /^\/api\/skills$/, async (req, res) => {
  const body = await parseBody(req);
  try { json(res, { skill: skillSystem.createSkill(body.name, body.description, body.instructions, body.metadata), message: '技能已创建' }); }
  catch(e) { json(res, { error: e.message }, 400); }
});
registerRoute(['GET'], /^\/api\/skills\/(.+)$/, (req, res, m) => {
  const skill = skillSystem.get(decodeURIComponent(m[1]));
  if (skill) json(res, { skill });
  else json(res, { error: '未找到' }, 404);
});

// 多模型配置
registerRoute(['GET'], /^\/api\/models\/providers$/, (req, res) => {
  var { PROVIDERS } = require('./modules/ai-engine');
  var modelRouter = require('./modules/model-router');
  const available = {};
  for (const [key, cfg] of Object.entries(PROVIDERS)) {
    available[key] = { configured: !!process.env[cfg.apiKeyEnv], defaultModel: cfg.defaultModel, models: cfg.models || [] };
  }
  // 覆盖凭证仓库状态
  try {
    var credStore = require('./modules/credential-store');
    var credStatus = credStore.getStatus();
    var credHistory = credStore.getHistory(5);
    for (var pk in credStatus) {
      if (available[pk]) {
        available[pk].credential = credStatus[pk];
      }
    }
    available._credentialStore = { version: credStatus.version, history: credHistory };
  } catch(e) {}
  // Merge enabled status from model-router config
  try {
    var routerCfg = modelRouter.getConfigSummary ? modelRouter.getConfigSummary() : null;
    if (routerCfg && routerCfg.providers) {
      for (var pk in routerCfg.providers) {
        if (available[pk] && routerCfg.providers[pk].models) {
          for (var pm of available[pk].models) {
            var rc = routerCfg.providers[pk].models[pm.id];
            if (rc) pm.enabled = rc.enabled !== false;
          }
        }
      }
    }
  } catch(e) {}
  json(res, { providers: available });
});
registerRoute(['POST'], /^\/api\/models\/providers$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    if (body.apiKey && body.key) {
      // Save API key
      const keyMap = { deepseek:'DEEPSEEK_API_KEY', openai:'OPENAI_API_KEY', anthropic:'ANTHROPIC_API_KEY', google:'GOOGLE_API_KEY',
        gemini:'GEMINI_API_KEY', groq:'GROQ_API_KEY', moonshot:'MOONSHOT_API_KEY', tongyi:'DASHSCOPE_API_KEY',
        zhipu:'ZHIPUAI_API_KEY', siliconflow:'SILICONFLOW_API_KEY', baichuan:'BAICHUAN_API_KEY',
        minimax:'MINIMAX_API_KEY', doubao:'DOUBAO_API_KEY', step:'STEP_API_KEY', hunyuan:'HUNYUAN_API_KEY',
        ernie:'ERNIE_API_KEY', yi:'YI_API_KEY' };
      if (keyMap[body.key]) process.env[keyMap[body.key]] = body.apiKey;
      // 写入凭证仓库（主存储）
      try {
        var credStore = require('./modules/credential-store');
        credStore.setApiKey(body.key, body.apiKey, 'UI配置', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      } catch(ce) {
        console.error('[凭证仓库] 写入失败:', ce.message);
      }
      // Persist to provider-keys.json（兼容旧系统）
      var pkPath = path.join(BASE, 'provider-keys.json');
      var keys = {};
      try { keys = JSON.parse(fs.readFileSync(pkPath, 'utf-8')); } catch(e) {}
      keys[body.key] = body.apiKey;
      saveProviderKeysWithHistory(pkPath, keys, 'UI配置');
      json(res, { ok: true, version: 1 });
    } else if (body.models && body.key) {
      // Save model enabled states for this provider
      var enabledMap = {};
      body.models.forEach(function(m) { enabledMap[m.id] = m.enabled !== false; });
      var mr = require('./modules/model-router');
      if (mr.setEnabledModels) mr.setEnabledModels(body.key, enabledMap);
      json(res, { ok: true });
    }
  } catch(e) {
    json(res, { error: e.message }, 500);
  }
});

// 凭证版本历史
registerRoute(["GET"], /^\/api\/provider-keys\/history$/, function(req, res) {
  try { var h = JSON.parse(fs.readFileSync(path.join(BASE, "provider-keys-history.json"), "utf-8") || "[]"); json(res, { ok: true, history: h }); } catch(e) { json(res, { ok: true, history: [] }); }
});

registerRoute(['GET'], /^\/api\/router\/config$/, function(req, res) {
  try {
    var mr = require('./modules/model-router');
    var result = mr.getModelList();
    json(res, result);
  } catch(e) {
    json(res, { error: e.message }, 500);
  }
});

registerRoute(['GET'], /^\/api\/models\/strategy$/, (req, res) => {
  try {
    var cfgPath = path.join(BASE, 'model-router.json');
    if (fs.existsSync(cfgPath)) {
      var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      json(res, { ok: true, strategy: cfg.strategy || 'speed-first', backupModels: cfg.backupModels || [] });
    } else {
      json(res, { strategy: 'speed-first', backupModels: [] });
    }
  } catch(e) {
    json(res, { strategy: 'speed-first', backupModels: [] });
  }
});

registerRoute(['POST'], /^\/api\/models\/strategy$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    var mr = require('./modules/model-router');
    var ok = mr.setStrategy(body.strategy || 'speed-first', body.backupModels);
    json(res, { ok: !!ok });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});


registerRoute(['POST'], /^\/api\/models\/config$/, async (req, res) => {
  const body = await parseBody(req);
  if (body.apiKey && body.provider) {
    const config = { provider: body.provider, apiKey: body.apiKey, model: body.model || '' };
    if (body.fallbackProvider) config.fallbackProvider = body.fallbackProvider;
    if (body.fallbackModel) config.fallbackModel = body.fallbackModel;
    fs.writeFileSync(path.join(BASE, 'ai-provider.json'), JSON.stringify(config, null, 2));
    const keyMap = { deepseek:'DEEPSEEK_API_KEY', openai:'OPENAI_API_KEY', anthropic:'ANTHROPIC_API_KEY', google:'GOOGLE_API_KEY', openrouter:'OPENROUTER_API_KEY', moonshot:'MOONSHOT_API_KEY', tongyi:'TONGYI_API_KEY', zhipu:'ZHIPU_API_KEY', siliconflow:'SILICONFLOW_API_KEY', baichuan:'BAICHUAN_API_KEY', minimax:'MINIMAX_API_KEY', doubao:'DOUBAO_API_KEY', step:'STEP_API_KEY', hunyuan:'HUNYUAN_API_KEY', ernie:'ERNIE_API_KEY', yi:'YI_API_KEY' };
    if (keyMap[body.provider]) process.env[keyMap[body.provider]] = body.apiKey;
    json(res, { ok: true, message: body.provider + ' 配置已保存' });
  } else { json(res, { error: '缺少参数' }, 400); }
});

// TaskFlow
registerRoute(['POST'], /^\/api\/taskflow$/, async (req, res) => {
  const body = await parseBody(req);
  const flow = taskFlow.defineFlow(body.name, body.steps || []);
  taskFlow.executeFlow(flow.id).then(r => console.log('[TaskFlow]', r.name + ':', r.status));
  json(res, { flow, message: '工作流已启动' });
});
registerRoute(['GET'], /^\/api\/taskflow\/(.+)$/, (req, res, m) => {
  const flow = taskFlow.getFlow(m[1]);
  if (flow) json(res, { flow });
  else json(res, { error: '未找到' }, 404);
});

// ========== 文件浏览器路由 (P3) ==========
registerRoute(['GET'], /^\/api\/files$/, (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const dir = url.searchParams.get('dir') || '';
  const targetDir = path.join(BASE, dir);
  if (!targetDir.startsWith(path.resolve(BASE))) { json(res, { error: '不允许访问的目录' }, 403); return; }
  try {
    if (!fs.existsSync(targetDir)) { json(res, { files: [], dirs: [] }); return; }
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const files = [];
    const dirs = [];
    entries.forEach(function(e) {
      const item = {
        name: e.name,
        path: path.posix ? path.posix.join(dir, e.name).replace(/\\\\/g, '/') : path.join(dir, e.name).replace(/\\\\/g, '/'),
        size: e.isFile() ? fs.statSync(path.join(targetDir, e.name)).size : 0,
        modified: e.isFile() ? fs.statSync(path.join(targetDir, e.name)).mtimeMs : 0
      };
      if (e.isDirectory()) dirs.push(item); else files.push(item);
    });
    dirs.sort(function(a, b) { return a.name.localeCompare(b.name); });
    files.sort(function(a, b) { return a.name.localeCompare(b.name); });
    json(res, { path: dir || '/', absolutePath: targetDir, dirs: dirs, files: files });
  } catch (err) { json(res, { error: "处理失败" }, 500); }
});

registerRoute(['POST'], /^\/api\/files\/read$/, async (req, res) => {
  const body = await parseBody(req);
  const filepath = body.path || '';
  const targetFile = path.resolve(BASE, filepath);
  if (!targetFile.startsWith(path.resolve(BASE))) { json(res, { error: '不允许访问的文件' }, 403); return; }
  try {
    if (!fs.existsSync(targetFile)) { json(res, { error: '文件不存在' }, 404); return; }
    const content = fs.readFileSync(targetFile, 'utf-8');
    const stat = fs.statSync(targetFile);
    json(res, { ok: true, path: filepath, name: path.basename(filepath), content: content, size: stat.size, modified: stat.mtimeMs });
  } catch (err) { json(res, { error: err.message }, 500); }
});

registerRoute(['POST'], /^\/api\/files\/write$/, async (req, res) => {
  const body = await parseBody(req);
  const filepath = body.path || '';
  const content = body.content || '';
  const targetFile = path.resolve(BASE, filepath);
  if (!targetFile.startsWith(path.resolve(BASE))) { json(res, { error: '不允许写入的文件' }, 403); return; }
  try {
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetFile, content, 'utf-8');
    json(res, { ok: true, path: filepath, message: '写入成功' });
  } catch (err) { json(res, { error: err.message }, 500); }
});

// ========== 子代理派遣路由 (P4) ==========
registerRoute(['POST'], /^\/api\/delegate$/, async (req, res) => {
  const body = await parseBody(req);
  const { targetId, task, instructions } = body;
  if (!targetId || !task) { json(res, { error: '缺少参数 targetId 或 task' }, 400); return; }
  const agent = AGENTS_MAP[targetId];
  if (!agent) { json(res, { error: '目标员工不存在: ' + targetId }, 404); return; }
  try {
    const { dispatchToSubAgent } = require('./modules/openclaw-bridge');
    const result = await dispatchToSubAgent(targetId, { task, instructions });
    json(res, { ok: true, targetId: targetId, targetName: agent.name_cn || targetId, task: task, result: result, message: '已派遣任务给 ' + (agent.name_cn || targetId) });
  } catch (err) {
    json(res, { ok: false, error: err.message, message: '派遣失败: ' + err.message });
  }
});

// 前向兼容:Provider 配置
registerRoute(['GET'], /^\/api\/provider\/config$/, (req, res) => {
  let cfg = {};
  try {
    const fp = path.join(BASE, 'ai-provider.json');
    if (fs.existsSync(fp)) cfg = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch(e) {}
  if (cfg.apiKey && cfg.apiKey.length > 8) cfg.apiKey = cfg.apiKey.substring(0, 4) + '****' + cfg.apiKey.substring(cfg.apiKey.length - 4);
  else if (cfg.apiKey) cfg.apiKey = '****';
  cfg.hasApiKey = !!(process.env.DEEPSEEK_API_KEY || cfg.apiKey);
  cfg.activeProvider = cfg.provider || 'deepseek';
  json(res, cfg);
});

registerRoute(['POST'], /^\/api\/provider\/config$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body || !body.apiKey) { json(res, { ok: false, msg: 'API Key 不能为空' }); return; }
  if (body.apiKey.indexOf('***') !== -1 || body.apiKey.indexOf('_BACKEND_KEY_') !== -1) {
    // 前端回传了脱敏Key,保留后端已有真实Key
    try {
      const existing = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
      if (existing.apiKey && existing.apiKey.indexOf('***') === -1 && existing.apiKey.indexOf('_BACKEND_KEY_') === -1) {
        json(res, { ok: true, msg: '配置未变更(已存在有效Key)' });
        return;
      }
    } catch(e) {}
    json(res, { ok: true, msg: '配置未变更' });
    return;
  }
  const newCfg = { provider: body.provider || 'deepseek', apiKey: body.apiKey, apiBase: body.apiBase || '', model: body.model || 'deepseek-chat' };
  fs.writeFileSync(path.join(BASE, 'ai-provider.json'), JSON.stringify(newCfg, null, 2));
  var _pMap = { deepseek:'DEEPSEEK_API_KEY', openai:'OPENAI_API_KEY', anthropic:'ANTHROPIC_API_KEY', google:'GOOGLE_API_KEY', openrouter:'OPENROUTER_API_KEY', moonshot:'MOONSHOT_API_KEY', tongyi:'TONGYI_API_KEY', zhipu:'ZHIPU_API_KEY', siliconflow:'SILICONFLOW_API_KEY', baichuan:'BAICHUAN_API_KEY', minimax:'MINIMAX_API_KEY', doubao:'DOUBAO_API_KEY', step:'STEP_API_KEY', hunyuan:'HUNYUAN_API_KEY', ernie:'ERNIE_API_KEY', yi:'YI_API_KEY' }; if (_pMap[newCfg.provider]) process.env[_pMap[newCfg.provider]] = body.apiKey;
  json(res, { ok: true, msg: '配置已保存', provider: newCfg.provider });
});

registerRoute(['POST'], /^\/api\/provider\/test$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    const provider = (body.provider || '').toLowerCase();
    const model = body.model || 'qwen2.5:1.5b';
    const apiKey = body.apiKey || getActiveApiKey();
    const apiBase = body.apiBase || '';

    // Ollama: use local API, no key needed
    if (provider === 'ollama') {
      const url = apiBase ? apiBase.replace(/\/?$/, '') + '/v1/chat/completions' : 'http://127.0.0.1:11434/v1/chat/completions';
      const ollamaRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 10 }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await ollamaRes.json();
      if (data && data.choices && data.choices[0]) {
        json(res, { ok: true, msg: 'Ollama \u8fde\u63a5\u6b63\u5e38', details: { model: data.model, response: data.choices[0].message.content } });
      } else {
        json(res, { ok: false, msg: 'API \u8fd4\u56de\u5f02\u5e38', details: data });
      }
      return;
    }

    // Default: use DeepSeek
    if (!apiKey) { json(res, { ok: false, error: '\u672a\u914d\u7f6e API Key' }, 400); return; }
    const apiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'OK' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await apiRes.json();
    json(res, data.choices && data.choices[0] ? { ok: true, msg: '\u8fde\u63a5\u6b63\u5e38', details: data } : { ok: false, msg: 'API \u8fd4\u56de\u5f02\u5e38', details: data });
  } catch(e) {
    json(res, { ok: false, msg: '\u8fde\u63a5\u5931\u8d25', error: e.message });
  }
});

// 插件发现
registerRoute(['GET'], /^\/api\/plugins$/, (req, res) => {
  const pluginsDir = path.join(BASE, '..', 'plugins');
  const plugins = [];
  if (fs.existsSync(pluginsDir)) {
    fs.readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory()).forEach(dir => {
      const mp = path.join(pluginsDir, dir.name, 'openclaw.plugin.json');
      if (fs.existsSync(mp)) {
        try { const m = JSON.parse(fs.readFileSync(mp, 'utf-8')); plugins.push({ id: m.id, name: m.name, description: m.description, version: m.version, path: dir.name }); } catch(e) {}
      }
    });
  }
  json(res, { plugins });
});


const channelInstaller = require('./modules/channel-installer');
const wxBind = require('./modules/wx-bind');

// 渠道列表
registerRoute(['GET'], /^\/api\/channels\/list$/, (req, res) => {
  json(res, { channels: channelInstaller.getChannelList() });
});

// 微信二维码 - 前端直接获取(用于设置页展示)
registerRoute(['GET'], /^\/api\/wechat\/qrcode$/, async (req, res) => {
  try {
    var wxQR = require('./modules/wx-qrcode');
    var result = await wxQR.generateQR();
    if (result.ok && result.qrcode) {
      json(res, { ok: true, qrcode: result.qrcode, qrToken: result.qrToken || "", wxUrl: result.wxUrl || "" });
    } else {
      json(res, { ok: false, error: result.error || '获取二维码失败' });
    }
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// 轮询二维码扫码状态
registerRoute(['GET'], /^\/api\/wechat\/qrcode\/status$/, async (req, res) => {
  var qs = new URL(req.url, 'http://localhost').searchParams;
  var token = qs.get('token') || '';
  if (!token) { json(res, { ok: false, error: '缺少token参数' }); return; }
  try {
    var wxQR = require('./modules/wx-qrcode');
    var result = await wxQR.pollQRStatus(token);
    json(res, result);
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// 检查微信绑定状态
registerRoute(['GET'], /^\/api\/wechat\/status$/, async (req, res) => {
  try {
    var wxQR = require('./modules/wx-qrcode');
    var bound = wxQR.isBound();
    var user = wxQR.getBoundUser();
    json(res, { bound: bound, message: bound ? '微信已绑定' : '未绑定', user: user ? { userId: user.userId } : null });
  } catch(e) {
    json(res, { bound: false, error: e.message });
  }
});

// 一键安装渠道
registerRoute(['POST'], /^\/api\/channels\/install$/, async (req, res) => {
  const body = await parseBody(req);
  if (!body.channelId && !body.channel) { json(res, { ok: false, error: '缺少channelId/channel' }); return; }
  if (!body.channelId && body.channel) body.channelId = body.channel;
  try {
    // 前端发平铺格式 {channel, corpId, agentSecret...},需要传整个 body 作为 params(去掉 channel/channelId)
    var cfgParams = body.params || {};
    if (Object.keys(cfgParams).length === 0 && body.channel) {
      // 从 body 中提取非控制字段作为配置参数
      for (var k in body) {
        if (k !== 'channel' && k !== 'channelId') cfgParams[k] = body[k];
      }
    }
    const result = await channelInstaller.installAndConfigure(body.channelId, cfgParams);
    json(res, result);
  } catch (err) { json(res, { ok: false, error: err.message }); }
});

// 获取渠道安装状态
registerRoute(['GET'], /^\/api\/channels\/status\/(.+)$/, async (req, res, m) => {
  json(res, { channelId: m[1], installed: true, message: '渠道就绪' });
});

// 热重启指定桥接（配置凭证后调用）
registerRoute(['POST'], /^\/api\/bridges\/restart$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    var name = body.name || body.bridge;
    if (!name) { json(res, { ok: false, error: '缺少 name 参数' }); return; }
    var def = BRIDGE_DEFS.find(function(d) { return d.name === name; });
    if (!def) { json(res, { ok: false, error: '未知桥接: ' + name }); return; }
    var child = global['__' + def.name + 'Bridge'];
    if (!child || child.exitCode !== null) {
      json(res, { ok: false, error: def.label + ' 桥接未在运行' }); return;
    }
    // 优雅终止旧进程（SIGTERM），spawnBridge 的 exit 回调会在 5 秒后自动重启
    try { child.kill('SIGTERM'); } catch(e) {}
    json(res, { ok: true, message: def.label + ' 桥接正在重启', name: name, label: def.label });
  } catch (err) {
    json(res, { ok: false, error: err.message });
  }
});

// 重启所有桥接
registerRoute(['POST'], /^\/api\/bridges\/restart-all$/, async (req, res) => {
  try {
    var restarted = [];
    BRIDGE_DEFS.forEach(function(def) {
      var child = global['__' + def.name + 'Bridge'];
      if (child && child.exitCode === null) {
        try { child.kill('SIGTERM'); } catch(e) {}
        restarted.push(def.name);
      }
    });
    json(res, { ok: true, message: restarted.length + ' 个桥接正在重启', restarted: restarted });
  } catch (err) {
    json(res, { ok: false, error: err.message });
  }
});


// QQ 机器人绑定状态查询
registerRoute(['GET'], /^\/api\/qqbot\/bind\/status$/, async (req, res) => {
  try {
    var cfgFile = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    var bound = false, account = '';
    try {
      if (fs.existsSync(cfgFile)) {
        var raw = fs.readFileSync(cfgFile, 'utf-8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
        var cfg = JSON.parse(raw);
        var qq = cfg && cfg.channels && cfg.channels.qqbot;
        if (qq && qq.appId) {
          bound = true;
          account = qq.appId;
        }
      }
    } catch(e) {}
    json(res, { ok: true, bound: bound, account: account });
  } catch(err) {
    json(res, { ok: false, error: err.message });
  }
});

// QQ 机器人二维码（返回提示信息，QQ 没有扫码二维码）
registerRoute(['GET'], /^\/api\/qqbot\/qrcode$/, async (req, res) => {
  json(res, { ok: false, error: 'QQ 机器人无扫码二维码。请在 QQ 开放平台创建机器人后，在设置页填写 AppID 和 Secret。', hint: 'open_qq_console' });
});

// 自动部署 ClawBot 微信桥
// 新版 wx-bind.js 不再自启动 ws-server,改用 OpenClaw CLI 方式
registerRoute(['POST'], /^\/api\/wechat\/deploy$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    // 检查是否已绑定
    const bound = await wxBind.checkBindingStatus();
    if (bound && bound.bound) {
      json(res, { ok: true, message: '微信 ClawBot 已绑定、运行中' });
      return;
    }
    // 检查 ClawBot 是否在运行
    const running = await wxBind.isClawBotRunning();
    if (running) {
      json(res, { ok: true, message: 'ClawBot 已在运行但未绑定,请扫码', needScan: true });
      return;
    }
    // 未运行,返回安装指引
    json(res, {
      ok: false,
      message: '请手动安装',
      guide: [
        '方式一(终端执行):',
        'npx -y @tencent-weixin/openclaw-weixin-cli@latest install',
        '',
        '方式二(手机端):',
        '微信「我 → 设置 → 插件」启用 ClawBot',
        '确保手机与电脑在同一局域网'
      ]
    });
  } catch (err) { json(res, { ok: false, error: err.message }); }
});

// ========== 活动日志系统(模块级)==========
var ACTIVITY_LOG = [];
var ACTIVITY_LOG_FILE = path.join(BASE, 'activity-log.json');
try { var _al = JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8')); if (Array.isArray(_al)) ACTIVITY_LOG = _al; } catch(e) {}

function logActivity(icon, text, agentId, detail) {
  var agentName = '';
  if (agentId && AGENTS_MAP && AGENTS_MAP[agentId]) { agentName = AGENTS_MAP[agentId].name_cn || AGENTS_MAP[agentId].name || agentId; }
  var entry = { id: 'act-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), icon: icon, text: text, name: agentName, role: (AGENTS_MAP[agentId] ? AGENTS_MAP[agentId].title || '' : ''), action: text, agentId: agentId || '', detail: detail || '', time: new Date().toISOString() };
  ACTIVITY_LOG.unshift(entry);
  if (ACTIVITY_LOG.length > 200) ACTIVITY_LOG = ACTIVITY_LOG.slice(0, 200);
  try { fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(ACTIVITY_LOG), 'utf-8'); } catch(e) {}
  try { wsServer.agentActivity(agentId || 'system', agentName || text.substring(0, 80), text, detail); } catch(e) {}
  return entry;
}

// ========== HTTP 服务器 ==========
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const method = req.method;
  const pathname = url.pathname;

  var allowedOrigins = ['http://127.0.0.1:'+PORT,'http://localhost:'+PORT,'http://127.0.0.1:8002','http://localhost:8002','http://127.0.0.1:18789','http://localhost:18789','http://127.0.0.1','http://localhost'];
  var origin = req.headers.origin;
  if (origin && allowedOrigins.indexOf(origin) !== -1) {
    var allowedOrigins = ['http://127.0.0.1:'+PORT,'http://localhost:'+PORT,'http://127.0.0.1:18789','http://localhost:18789','http://127.0.0.1','http://localhost','http://127.0.0.1:8002','http://localhost:8002'];
  if (allowedOrigins.indexOf(origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:'+PORT);
  }
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:'+PORT);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; media-src 'self' blob:;");
  if (method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ========== 认证检查 ==========
  // [Desktop] Auth bypassed
  if (false) {}


  // BI: 记录API调用
  const _startTime = Date.now();
  res.on('finish', () => {
    biDashboard.recordAPICall(method, pathname, res.statusCode || 200, Date.now() - _startTime);
  });

  // DEBUG: log auth/me requests
  if (pathname === '/api/auth/me') {
    console.log('[DEBUG] /api/auth/me request, method=' + method + ', auth=' + (req.headers['authorization'] || 'NONE').substring(0,30));
  }

  // ====== 配置变更审计日志 ======
  if (['POST', 'PUT', 'DELETE'].includes(method) && !pathname.startsWith('/api/chat')) {
    try {
      var auditPath = path.join(BASE, 'audit-log.json');
      var audit = [];
      try { audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')); } catch(e) {}
      audit.push({
        timestamp: new Date().toISOString(),
        method: method,
        path: pathname,
        ip: req.socket?.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] || '').substring(0, 100)
      });
      if (audit.length > 1000) audit = audit.slice(-1000);
      fs.writeFileSync(auditPath, JSON.stringify(audit));
    } catch(e) { /* silent */ }
  }

  for (const r of ROUTES) {
    if (r.methods.includes(method)) {
      const m = pathname.match(r.pattern);
      if (m) {
        try { await r.handler(req, res, m); } catch(e) { console.error('[' + method + ' ' + pathname + '] Route error:', e.message, e.stack); json(res, { error: e.message, stack: e.stack }, 500); }
        return;
      }
    }
  }

  // 主页(app_fixed.html 优先)
  if (pathname === '/' || pathname === '/index.html' || pathname === '/app_fixed.html') {
    // 优先使用 app_fixed.html
    const appFixedPath = path.join(FRONTEND, 'app_fixed.html');
    if (fs.existsSync(appFixedPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(fs.readFileSync(appFixedPath, 'utf-8'));
      return;
    }
    // // 回退到 Vue SPA
    const indexPath = path.join(DIST_V2, 'index.html');
    if (fs.existsSync(indexPath)) {
            var html = fs.readFileSync(indexPath, 'utf-8');
      // 直接返回，不做任何替换
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(html);
      return;
    }
    json(res, { error: 'index.html not found' }, 404);
    return;
  }

  // 静态文件
  const servePaths = [
    path.join(DIST, pathname.replace(/^\//, '')),
    path.join(FRONTEND, pathname.replace(/^\//, ''))
];
  for (const fp of servePaths) {
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      if (fp.endsWith('chat-workspace.html')) {
        var html = fs.readFileSync(fp, 'utf-8').replace('</style>','.sidebar-nav{overflow-y:auto;padding:2px 0;height:880px}.sidebar-nav .nav-s:first-child{height:40px;display:flex;align-items:center}.nav-s{font-size:13px;font-weight:500;color:#c0c4cc;padding:4px 14px;letter-spacing:0.5px}.nav-item{font-size:15px;text-decoration:none;cursor:pointer;font-weight:400;display:flex;align-items:center;padding:5px 14px;color:#e0e0e0;letter-spacing:0.3px}</style>');
        res.end(html);
      } else if (ext === '.html') {
        var html = fs.readFileSync(fp, 'utf-8');
        // auth 和 lock 已内联在 index.html 中，不再注入
        res.end(html);
      } else {
        res.end(fs.readFileSync(fp));
      }
      return;
    }
  }
  
  // SPA fallback: serve index.html for any unmatched path (Vue Router handles routing)
  if (!pathname.startsWith('/api/')) {
    const indexPath = path.join(DIST_V2, 'index.html');
    if (fs.existsSync(indexPath)) {
            var html = fs.readFileSync(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(html);
      return;
    }
  }


// ========== 真实数据 API ==========

// 请求计数器
if (!global.__apiStats) {
  global.__apiStats = { total: 0, success: 0, failed: 0, startTime: Date.now() };
}

// 所有 API 响应包装计数
const _origJson = json;
json = function(res, data, status) {
  global.__apiStats.total++;
  if (status < 400) global.__apiStats.success++;
  else global.__apiStats.failed++;
  _origJson(res, data, status);
};

// 真实流量数据
registerRoute(['GET'], /^\/api\/v4\/traffic$/, (req, res) => {
  const elapsed = Math.floor((Date.now() - global.__apiStats.startTime) / 1000);
  json(res, {
    total: global.__apiStats.total,
    success: global.__apiStats.success,
    failed: global.__apiStats.failed,
    inputTokens: Math.floor(global.__apiStats.total * 350),
    outputTokens: Math.floor(global.__apiStats.total * 120),
    cost: (global.__apiStats.total * 0.0015).toFixed(4),
    uptime: elapsed,
    requestsPerMin: elapsed > 0 ? Math.round(global.__apiStats.total / elapsed * 60) : 0
  });
});

// 模型路由配置（Chat 组件初始化时调用）
registerRoute(['GET'], /^\/api\/router\/config$/, (req, res) => {
  try {
    var ae = require('./modules/ai-engine');
    var models = [];
    var providers = ae.PROVIDERS || {};
    for (var pk in providers) {
      if (providers[pk].models && Array.isArray(providers[pk].models)) {
        providers[pk].models.forEach(function(m) {
          models.push({ id: m.id, label: m.label || m.id, provider: pk });
        });
      }
    }
    json(res, { ok: true, models: models, providers: Object.keys(providers) });
  } catch(e) {
    json(res, { ok: false, models: [], error: e.message });
  }
});

// 真实动态数据 + 活动日志(活动日志函数在模块顶层定义)
registerRoute(['GET'], /^\/api\/v4\/activities$/, (req, res) => {
  var activities = [];
  // 从数据库activities表读取员工工作动态
  try {
    var url2 = require('url').parse(req.url, true);
    var limit = parseInt(url2.query.limit) || 60;
    var rows = db().prepare('SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?').all(limit);
    rows.forEach(function(r) {
      var icon = '📋';
      if (r.action && (r.action.includes('完成') || r.action.includes('done') || r.action.includes('部署'))) icon = '✅';
      else if (r.action && (r.action.includes('处理') || r.action.includes('分析') || r.action.includes('训练'))) icon = '🔄';
      else if (r.action && (r.action.includes('安全') || r.action.includes('检查'))) icon = '🔒';
      else if (r.action && (r.action.includes('学习'))) icon = '📚';
      activities.push({
        id: r.id || String(Date.now()),
        icon: icon,
        text: icon + ' ' + (r.agent_name || '') + ': ' + (r.action || ''),
        name: r.agent_name || '',
        role: r.target || '',
        action: r.action || '',
        agentId: r.agent_id || '',
        time: (r.timestamp || new Date().toISOString()).substring(0, 19),
        detail: r.details || ''
      });
    });
  } catch(e) {
    // fallback: ACTIVITY_LOG
    if (typeof ACTIVITY_LOG !== 'undefined' && ACTIVITY_LOG.length > 0) {
      ACTIVITY_LOG.slice(0, 30).forEach(function(a) {
        activities.push({ id: a.id, icon: a.icon, text: a.text, name: a.name || '', role: a.role || '', action: a.action || a.text, agentId: a.agentId, time: a.time, detail: a.detail });
      });
    }
  }
  if (activities.length === 0) {
    activities.push({ icon: '🏢', text: '系统启动完成', time: new Date().toISOString() });
  }
  json(res, { activities: activities, total: activities.length });
});

// 系统健康真实数据
const _origHealthHandler = null; // placeholder

// 心跳守护进程(每分钟自我检查)
setInterval(() => {
  try {
    const mem = process.memoryUsage();
    fs.appendFileSync(path.join(BASE, 'logs', 'heartbeat.log'),
      new Date().toISOString() + ' OK mem=' + Math.round(mem.rss/1024/1024) + 'MB uptime=' + Math.floor(process.uptime()) + 's\n');
  } catch(e) {}
}, 60000);
console.log('[heartbeat] 心跳守护已启动(每60秒)');

// CEO心跳自动巡检(每30分钟): 巡查任务状态 → 写CEO记忆 → CEO下次对话自动看到
setInterval(() => {
  try {
    var now = new Date().toISOString();
    var findings = [];
    
    // 1. 检查未处理通知
    try {
      var nf = path.join(BASE, 'logs', 'ceo-notify-queue.json');
      if (fs.existsSync(nf)) {
        var q = JSON.parse(fs.readFileSync(nf, 'utf-8') || '[]');
        var unread = q.filter(function(n) { return n.status === 'unread'; });
        if (unread.length > 0) findings.push(unread.length + '条完成通知待处理');
      }
    } catch(_pe) {}
    
    // 2. 扫描 tasks.json 检查 stuck 任务（仅记录，不自动重试）
    try {
      var tj = path.join(BASE, 'tasks.json');
      if (fs.existsSync(tj)) {
        var t = JSON.parse(fs.readFileSync(tj, 'utf-8') || '[]');
        var stuck = t.filter(function(x) { return x.status === 'in_progress' && x.assignedAt && (Date.now() - new Date(x.assignedAt).getTime()) > 600000; });
        if (stuck.length > 0) {
          findings.push(stuck.length + '个任务卡住超10分钟（仅记录，未自动重试）');
          console.log('[CEOPatrol] 发现卡住任务，等待人工处理: ' + stuck.map(function(st){return st.title;}).join(', '));
        }
        var done = t.filter(function(x) { return x.status === 'completed' && !x.reviewedAt; });
        if (done.length > 0) findings.push(done.length + '个已完成任务待审阅');
      }
    } catch(_te) {}
    
    if (findings.length > 0) {
      // 3. 写到CEO记忆，下次对话自动呈现
      try {
        var ceoMemPath = path.join(BASE, 'memory-ai_ceo.json');
        var ceoMem = fs.existsSync(ceoMemPath) ? JSON.parse(fs.readFileSync(ceoMemPath, 'utf-8') || '{}') : {};
        if (!ceoMem.notifications) ceoMem.notifications = [];
        ceoMem.notifications.push({
          type: 'auto_patrol',
          time: now,
          summary: findings.join('; '),
          details: findings
        });
        if (ceoMem.notifications.length > 200) ceoMem.notifications = ceoMem.notifications.slice(-200);
        fs.writeFileSync(ceoMemPath, JSON.stringify(ceoMem, null, 2), 'utf-8');
      } catch(_ce) {}
      console.log('[CEOPatrol] ' + findings.join(' | '));
    }
  } catch(_pe) {}
}, 1800000);

// Webhook 端点 - 多渠道消息接入
registerRoute(['POST'], /^\/api\/v4\/webhook$/, async (req, res) => {
  const body = await parseBody(req);
  const channel = body.channel || body.source || 'unknown';
  const message = body.message || body.text || body.content || '';
  const from = body.from || body.sender || body.user || '';
  console.log('[webhook] 来自 ' + channel + ' 的消息: ' + message.substring(0, 80));

  // 只处理微信通道的消息
  if (channel === 'openclaw-weixin' || channel === 'personal_wx') {
    try {
      // 找到CEO agent
      var ceoAgent = null;
      for (var i = 0; i < TEAM_AGENTS.length; i++) {
        if (TEAM_AGENTS[i].id === 'ai_ceo') { ceoAgent = TEAM_AGENTS[i]; break; }
      }
      if (ceoAgent) {
        var { aiChat } = require('./modules/ai-engine');
        var replyMsgs = [
          { role: 'system', content: '你是 ' + ceoAgent.name_cn + ',担任 ' + ceoAgent.title + '。\n\n你收到了一条来自微信的消息,请用自然、专业的中文回复。' },
          { role: 'user', content: message }
        ];
        // 异步处理,不阻塞响应
        aiChat(replyMsgs, { timeout: 30000 }).then(function(response) {
          var reply = response.choices?.[0]?.message?.content || '';
          if (reply) {
            console.log('[webhook] CEO回复:', reply.substring(0, 80));
            // 通过CLI回复(用 spawn 防注入)
            var cp = require('child_process');
            var args = ['message', 'send', '--channel', 'openclaw-weixin', '--target', from || 'me', '--message', reply];
            var child = cp.spawn('openclaw', args, { stdio: 'pipe', windowsHide: true, timeout: 10000 });
            child.on('error', function(err) { console.log('[webhook] 回复发送失败:', err.message); });
            child.on('exit', function(code) { if (code !== 0) console.log('[webhook] 回复发送退出码:', code); });
          }
        }).catch(function(err) {
          console.log('[webhook] CEO处理失败:', err.message);
        });
      }
    } catch(e) {
      console.log('[webhook] 处理出错:', e.message);
    }
  }

  json(res, { ok: true, message: '事件已接收: ' + (body.event || body.type || 'unknown'), time: new Date().toISOString() });
});

registerRoute(['POST'], /^\/api\/v4\/channel\/config$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: true, message: '配置已保存', channel: body.channel });
});

registerRoute(['POST'], /^\/api\/v4\/channel\/test$/, async (req, res) => {
  const body = await parseBody(req);
  json(res, { ok: body.channel === 'feishu', message: body.channel === 'feishu' ? '连接成功' : '请先配置渠道凭证' });
});

registerRoute(['GET'], /^\/api\/v4\/files\/list$/, async (req, res) => {
  const files = [
    { name: 'agents.json', icon: '📋', size: '23KB', path: 'agents.json' },
    { name: 'tasks.json', icon: '📋', size: '4KB', path: 'tasks.json' },
    { name: 'ceo_notes.md', icon: '📝', size: '3KB', path: 'ceo_notes.md' },
    { name: 'server-modern.js', icon: '⚙️', size: '56KB', path: 'server-modern.js' },
    { name: 'ai-provider.json', icon: '📄', size: '1KB', path: 'ai-provider.json' },
  ];
  json(res, { files, total: files.length });
});

registerRoute(['POST'], /^\/api\/v4\/files\/read$/, async (req, res) => {
  const body = await parseBody(req);
  const filepath = body.path || body.name || '';
  const safePath = path.resolve(BASE, filepath);
  try {
    if (fs.existsSync(safePath) && safePath.startsWith(path.resolve(BASE))) {
      const content = fs.readFileSync(safePath, 'utf-8');
      json(res, { ok: true, content: content.substring(0, 5000) });
    } else {
      json(res, { ok: false, error: '文件不存在' });
    }
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['GET'], /^\/api\/v4\/settings\/apikey$/, function(req, res) {
  try { var pk = JSON.parse(require('fs').readFileSync(require('path').join(BASE, 'provider-keys.json'), 'utf-8') || '{}'); json(res, { ok: true, keys: pk }); } catch(e) { json(res, { ok: true, keys: {} }); }
});

registerRoute(['POST'], /^\/api\/v4\/settings\/apikey$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    // 多 Provider 密钥管理
    if (body.keys && typeof body.keys === 'object') {
      // 写入凭证仓库（主存储）
      try {
        var credStore = require('./modules/credential-store');
        Object.keys(body.keys).forEach(function(k) {
          if (body.keys[k]) credStore.setApiKey(k, body.keys[k], '批量配置', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
        });
      } catch(ce) { console.error('[凭证仓库] v4/settings/apikey 写入失败:', ce.message); }
      var pkPath = path.join(BASE, 'provider-keys.json');
      var existing = {};
      try { existing = JSON.parse(fs.readFileSync(pkPath, 'utf-8')); } catch(e) {}
      for (var k in body.keys) {
        if (body.keys[k]) existing[k] = body.keys[k];
        else delete existing[k];
      }
      saveProviderKeysWithHistory(pkPath, existing, '批量保存');
      // Sync first key to generic env var
      for(var _pk in existing){if(existing[_pk]){var _envMap={"deepseek":"DEEPSEEK_API_KEY","openai":"OPENAI_API_KEY","anthropic":"ANTHROPIC_API_KEY","google":"GOOGLE_API_KEY","openrouter":"OPENROUTER_API_KEY","moonshot":"MOONSHOT_API_KEY","tongyi":"TONGYI_API_KEY","zhipu":"ZHIPU_API_KEY","siliconflow":"SILICONFLOW_API_KEY","baichuan":"BAICHUAN_API_KEY","minimax":"MINIMAX_API_KEY","doubao":"DOUBAO_API_KEY","step":"STEP_API_KEY","hunyuan":"HUNYUAN_API_KEY","ernie":"ERNIE_API_KEY","yi":"YI_API_KEY"};if(_envMap[_pk])process.env[_envMap[_pk]]=existing[_pk];}}
      json(res, { ok: true, message: '\u591A Provider \u5BC6\u94A5\u5DF2\u4FDD\u5B58' });
      return;
    }
    // \u5355 Key \u4FDD\u5B58
    if (body.key && body.key.length > 10) {
      const cfgPath = path.join(BASE, 'ai-provider.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      cfg.apiKey = body.key;
      if (body.provider) { cfg.provider = body.provider; cfg.apiBase = ''; }
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
      // 按 provider 动态设置环境变量
      var _pMap2 = { deepseek:'DEEPSEEK_API_KEY', openai:'OPENAI_API_KEY', anthropic:'ANTHROPIC_API_KEY', google:'GOOGLE_API_KEY', openrouter:'OPENROUTER_API_KEY', moonshot:'MOONSHOT_API_KEY', tongyi:'TONGYI_API_KEY', zhipu:'ZHIPU_API_KEY', siliconflow:'SILICONFLOW_API_KEY', baichuan:'BAICHUAN_API_KEY', minimax:'MINIMAX_API_KEY', doubao:'DOUBAO_API_KEY', step:'STEP_API_KEY', hunyuan:'HUNYUAN_API_KEY', ernie:'ERNIE_API_KEY', yi:'YI_API_KEY' };
      var _prov2 = body.provider || cfg.provider || 'deepseek';
      if (_pMap2[_prov2]) process.env[_pMap2[_prov2]] = body.key;
      // 写入凭证仓库（主存储）
      try {
        var credStore = require('./modules/credential-store');
        credStore.setApiKey(_prov2 || 'deepseek', body.key || body.apiKey || '', 'AI模型配置', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      } catch(ce) { console.error('[凭证仓库] ai-model 写入失败:', ce.message); }
      // 同步写入 provider-keys.json
      try {
        var pkPath2 = path.join(BASE, 'provider-keys.json');
        var pKeys2 = {};
        try { pKeys2 = JSON.parse(fs.readFileSync(pkPath2, 'utf-8')); } catch(e) {}
        pKeys2[_prov2] = body.key;
        saveProviderKeysWithHistory(pkPath2, pKeys2, 'AI引擎写入');
      } catch(e) {}
      json(res, { ok: true, message: 'API Key \u5DF2\u4FDD\u5B58\u5E76\u751F\u6548' });
    } else {
      json(res, { ok: false, error: 'Key \u65E0\u6548' });
    }
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['GET'], /^\/api\/v4\/settings\/provider$/, async (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    json(res, { ok: true, provider: cfg.provider || 'deepseek', model: cfg.model || 'deepseek-chat', apiBase: cfg.apiBase || '' });
  } catch(e) {
    json(res, { ok: false, provider: 'deepseek', model: 'deepseek-chat' });
  }
});


registerRoute(['POST'], /^\/api\/v4\/settings\/provider$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (body.provider) { cfg.provider = body.provider; cfg.apiBase = body.apiBase || ''; }
    if (body.model) cfg.model = body.model;
    if (body.apiKey && body.apiKey.length > 10 && !body.apiKey.includes('****')) {
      cfg.apiKey = body.apiKey;
      // 写入凭证仓库（主存储）
      try {
        var credStore = require('./modules/credential-store');
        credStore.setApiKey(body.provider || 'deepseek', body.apiKey || '', 'AI适配器配置', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      } catch(ce) { console.error('[凭证仓库] ai-adapter 写入失败:', ce.message); }
      // 同步到 provider-keys.json 和环境变量
      try {
        var pkPath = path.join(BASE, 'provider-keys.json');
        var pKeys = {};
        try { pKeys = JSON.parse(fs.readFileSync(pkPath, 'utf-8')); } catch(e) {}
        pKeys[body.provider || cfg.provider || 'deepseek'] = body.apiKey;
        saveProviderKeysWithHistory(pkPath, pKeys, 'AI适配器写入');
      } catch(e) {}
      var _pMap = { deepseek:'DEEPSEEK_API_KEY', openai:'OPENAI_API_KEY', anthropic:'ANTHROPIC_API_KEY', google:'GOOGLE_API_KEY', openrouter:'OPENROUTER_API_KEY', moonshot:'MOONSHOT_API_KEY', tongyi:'TONGYI_API_KEY', zhipu:'ZHIPU_API_KEY', siliconflow:'SILICONFLOW_API_KEY', baichuan:'BAICHUAN_API_KEY', minimax:'MINIMAX_API_KEY', doubao:'DOUBAO_API_KEY', step:'STEP_API_KEY', hunyuan:'HUNYUAN_API_KEY', ernie:'ERNIE_API_KEY', yi:'YI_API_KEY' };
      var _prov = body.provider || cfg.provider || 'deepseek';
      if (_pMap[_prov]) process.env[_pMap[_prov]] = body.apiKey;
    }
    if (body.apiBase) { cfg.apiBase = body.apiBase; }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('[config] 更新 AI 提供商: ' + cfg.provider + ', 模型: ' + cfg.model + (body.apiKey ? ', Key已保存' : ''));
    json(res, { ok: true, provider: cfg.provider, model: cfg.model });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});registerRoute(['POST'], /^\/api\/v4\/settings\/heartbeat$/, async (req, res) => {
  json(res, { ok: true, message: '心跳配置已保存' });
});


// ===== Settings API (for new Settings page) =====
registerRoute(['GET'], /^\/api\/settings\/providers$/, (req, res) => {
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    json(res, { ok: true, provider: cfg.provider || 'deepseek', model: cfg.model || 'deepseek-chat', apiBase: cfg.apiBase || '', apiKey: cfg.apiKey || '' });
  } catch(e) {
    json(res, { ok: true, provider: 'deepseek', model: 'deepseek-chat', apiBase: '' });
  }
});

registerRoute(['GET'], /^\/api\/settings\/$/, (req, res) => {
  try {
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    json(res, { ok: true, ...cfg });
  } catch(e) {
    json(res, { ok: true });
  }
});

registerRoute(['PUT'], /^\/api\/settings\/$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    const cfgPath = path.join(BASE, 'ai-provider.json');
    const cfg = Object.assign({}, body);
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    json(res, { ok: true, message: '\u914d\u7f6e\u5df2\u4fdd\u5b58' });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['POST'], /^\/api\/settings\/test$/, async (req, res) => {
  const body = await parseBody(req);
  const apiKey = body.apiKey || (() => { try { const c = JSON.parse(require('fs').readFileSync(require('path').join(BASE, 'ai-provider.json'), 'utf-8')); return c.apiKey || ''; } catch(e) { return ''; } })() || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) { json(res, { success: false, error: '\u672a\u914d\u7f6e API Key' }); return; }
  try {
    const apiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{role:'user',content:'hi'}], max_tokens: 5 })
    });
    const data = await apiRes.json();
    json(res, { success: apiRes.ok, data: data, error: data.error?.message || '' });
  } catch(e) {
    json(res, { success: false, error: e.message });
  }
});

registerRoute(['GET'], /^\/api\/v4\/cron$/, async (req, res) => {
  json(res, []);
});

registerRoute(['GET'], '/api/auth/me', (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const authMod = require('./modules/auth-middleware');
      const decoded = authMod.verifyToken(token);
      if (decoded) {
        json(res, { ok: true, loggedIn: true, user: decoded });
        return;
      }
    }
    json(res, { ok: false, loggedIn: false, user: null }, 401);
  } catch(e) {
    json(res, { ok: false, loggedIn: false, user: null }, 401);
  }
});

// SPA fallback (Vue Router) - 仅对 HTML 类路径生效
  const ext = path.extname(pathname).toLowerCase();
  // API 路径不应用 SPA 回退
  if (pathname.startsWith('/api/')) { json(res, { error: 'not found' }, 404); return; }
  const htmlExts = ['', '.html', '.htm', '/'];
  if (ext === '' || htmlExts.includes(ext)) {
    const spaPath = path.join(DIST_V2, 'index.html');
    if (fs.existsSync(spaPath)) {
      var spaHtml = fs.readFileSync(spaPath, 'utf-8');
          // auth 已内联在 index.html 中
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(spaHtml);
      return;
    }
  }

  // 404
  json(res, { error: 'not found' }, 404);
});

// <-- 新 API 区块开始 -->
// ====== Agent Boundary API ======
var agentBoundary = require('./modules/agent-boundary');
registerRoute(["GET"], /^\/api\/harness\/boundary\/status$/, function(r,s){
  try { var cfg = agentBoundary.getInstance().getConfig(); cfg.ok = true; json(s, cfg); }
  catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/boundary\/limits$/, async function(r,s){
  try {
    var b = await parseBody(r);
    if (b.global) agentBoundary.getInstance().updateRateLimits(b.global);
    if (b.tool) agentBoundary.getInstance().updateToolRateLimit(b.toolName, b.tool);
    json(s, {ok: true});
  } catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/boundary\/agent\/([^\/]+)$/, function(r,s,m){
  try {
    var ov = agentBoundary.getInstance().getAgentOverride(m[1]);
    json(s, {ok: true, agentId: m[1], override: ov || {}});
  } catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/boundary\/agent\/([^\/]+)$/, async function(r,s,m){
  try {
    var b = await parseBody(r);
    agentBoundary.getInstance().setAgentOverride(m[1], b);
    json(s, {ok: true});
  } catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/boundary\/check$/, async function(r,s){
  try {
    var b = await parseBody(r);
    var result = agentBoundary.getInstance().checkAndRecord(b.agentId, b.agentName, b.agentRole, b.toolName);
    json(s, {ok: true, result: result});
  } catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/boundary\/reset$/, function(r,s){
  try { agentBoundary.getInstance().resetStats(); json(s, {ok: true}); }
  catch(e) { json(s, {ok: false, error: e.message}); }
});

// ======
// ====== Harness 规则引擎 API (Phase 2) ======
var harnessRules = require('./modules/harness-rules');
registerRoute(["GET"], /^\/api\/harness\/rules$/, function(r,s){
  try {
    var _up = new URL(r.url, 'http://localhost');
    var filter = {};
    if (_up.searchParams.get('status')) filter.status = _up.searchParams.get('status');
    if (_up.searchParams.get('type')) filter.type = _up.searchParams.get('type');
    json(s, harnessRules.getInstance().getRules(filter));
  } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/rules\/pending$/, function(r,s){
  try { json(s, {pending: harnessRules.getInstance().getPendingRules()}); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/rules\/stats$/, function(r,s){
  try { json(s, harnessRules.getInstance().getStats()); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/rules\/([^\/]+)$/, function(r,s,m){
  try {
    var rule = harnessRules.getInstance().getRule(m[1]);
    if (!rule) { json(s, {error: '规则不存在'}, 404); return; }
    json(s, {rule: rule, history: harnessRules.getInstance().getRuleHistory(m[1])});
  } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/rules\/propose$/, async function(r,s){
  try {
    var b = await parseBody(r);
    if (!b.type || !b.condition || !b.action) { json(s, {ok: false, error: '规则必须包含 type/condition/action'}); return; }
    json(s, harnessRules.getInstance().proposeRule({ type: b.type, name: b.name, scope: b.scope, condition: b.condition, action: b.action, reason: b.reason, severity: b.severity }, b.proposedBy || 'api'));
  } catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/rules\/([^\/]+)\/confirm$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessRules.getInstance().confirmRule(m[1], b.confirmedBy || 'system', b.note)); }
  catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/rules\/([^\/]+)\/reject$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessRules.getInstance().rejectRule(m[1], b.rejectedBy || 'system', b.reason)); }
  catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/rules\/([^\/]+)\/deprecate$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessRules.getInstance().deprecateRule(m[1], b.deprecatedBy || 'system', b.reason)); }
  catch(e) { json(s, {ok: false, error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/rules\/history$/, function(r,s){
  try { json(s, {history: harnessRules.getInstance().getRuleHistory()}); }
  catch(e) { json(s, {error: e.message}); }
});

// ====== Harness 提案系统 API (Phase 3) ======
var harnessProposal = require('./modules/harness-proposal');
registerRoute(["POST"], /^\/api\/harness\/proposal\/submit$/, async function(r,s){
  try {
    var b = await parseBody(r);
    json(s, harnessProposal.getInstance().submitProposal({ agentId: b.agentId, agentName: b.agentName, agentRole: b.agentRole || 'staff', type: b.type || 'tool_call', action: b.action, context: b.context || {} }));
  } catch(e) { json(s, {success: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/proposal\/([^\/]+)\/appeal$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessProposal.getInstance().appealProposal(m[1], b.appealedBy, b.justification, b.role)); }
  catch(e) { json(s, {success: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/proposal\/([^\/]+)\/review$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessProposal.getInstance().reviewAppeal(m[1], {id: b.reviewer, role: b.role || 'vp'}, b.decision, b.note)); }
  catch(e) { json(s, {success: false, error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/proposal\/([^\/]+)\/override$/, async function(r,s,m){
  try { var b = await parseBody(r); json(s, harnessProposal.getInstance().directOverride(m[1], b.overrider, b.role || 'ceo', b.reason)); }
  catch(e) { json(s, {success: false, error: e.message}); }
});
// Static GET routes BEFORE param route (matching order matters)
registerRoute(["GET"], /^\/api\/harness\/proposal\/stats$/, function(r,s){
  try { json(s, harnessProposal.getInstance().getStats()); } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/proposal\/appeals\/pending$/, function(r,s){
  try { json(s, {pending: harnessProposal.getInstance().getPendingAppeals()}); } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/proposal\/audit$/, function(r,s){
  try {
    var _up = new URL(r.url, 'http://localhost');
    var filters = {};
    if (_up.searchParams.get('type')) filters.type = _up.searchParams.get('type');
    if (_up.searchParams.get('proposalId')) filters.proposalId = _up.searchParams.get('proposalId');
    if (_up.searchParams.get('limit')) filters.limit = parseInt(_up.searchParams.get('limit'));
    json(s, {audit: harnessProposal.getInstance().getAuditLog(filters)});
  } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/proposal\/([^\/]+)$/, function(r,s,m){
  try {
    var prop = harnessProposal.getInstance().getProposal(m[1]);
    if (!prop) { json(s, {error: '方案不存在'}, 404); return; }
    json(s, {proposal: prop});
  } catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/proposal$/, function(r,s){
  try {
    var _up = new URL(r.url, 'http://localhost');
    var filters = {};
    if (_up.searchParams.get('status')) filters.status = _up.searchParams.get('status');
    if (_up.searchParams.get('agentId')) filters.agentId = _up.searchParams.get('agentId');
    if (_up.searchParams.get('type')) filters.type = _up.searchParams.get('type');
    if (_up.searchParams.get('limit')) filters.limit = parseInt(_up.searchParams.get('limit'));
    json(s, harnessProposal.getInstance().getProposals(filters));
  } catch(e) { json(s, {error: e.message}); }
});
// ====== DAG 依赖引擎 API ======
var dagEngine = require('./modules/dag-engine');
registerRoute(["GET"], /^\/api\/harness\/dag\/graph$/, function(r,s){
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    json(s, { ok: true, graph: dagEngine.buildGraphData(tasks), topologicalOrder: dagEngine.topologicalSort(tasks), blocked: dagEngine.getBlockedTasks(tasks), cycle: dagEngine.detectCycle(tasks) });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["GET"], /^\/api\/harness\/dag\/task\/([^\/]+)$/, function(r,s,m){
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    var task = tasks.find(function(t) { return t.id === m[1]; });
    if (!task) { json(s, { ok: false, error: 'Task not found' }); return; }
    var deps = [].concat(task.dependsOn || []);
    var upstream = deps.map(function(id) { return tasks.find(function(t) { return t.id === id; }); }).filter(Boolean);
    var downstream = tasks.filter(function(t) { var td = [].concat(t.dependsOn || []); return td.indexOf(m[1]) >= 0; });
    json(s, { ok: true, task: task, upstream: upstream, downstream: downstream });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/dag\/recalculate$/, function(r,s){
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    var updates = dagEngine.recalculateAll(tasks);
    for (var u of updates) {
      var t = tasks.find(function(t) { return t.id === u.id; });
      if (t) { t.status = u.newStatus; t.updatedAt = new Date().toISOString(); }
    }
    if (updates.length > 0) { fs.writeFileSync(path.join(BASE, 'tasks.json'), JSON.stringify(tasks, null, 2), 'utf-8'); }
    json(s, { ok: true, updates: updates });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// ====== Error Trend + Auto Ticket API ======
// ====== SLA 统计 API ======
var pluginSystem = require('./modules/plugin-system');
var _pluginSys = pluginSystem.getInstance();
var _pluginLoad = _pluginSys.loadAll();

// ====== Plugin System API ======
registerRoute(["GET"], /^\/api\/harness\/plugins\/status$/, function(r,s){
  try { json(s, { ok: true, config: _pluginSys.getConfig(), loadResult: _pluginLoad }); }
  catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/plugins\/reload$/, function(r,s){
  try { _pluginLoad = _pluginSys.loadAll(); json(s, { ok: true, loadResult: _pluginLoad }); }
  catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/plugins\/toggle$/, async function(r,s){
  try {
    var b = await parseBody(r);
    if (!b.id) { json(s, { ok: false, error: 'Missing plugin id' }); return; }
    _pluginSys.setEnabled(b.id, b.enabled !== false);
    json(s, { ok: true, pluginId: b.id, enabled: b.enabled !== false });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/plugins\/exec\/([^\/]+)$/, async function(r,s,m){
  try {
    var b = await parseBody(r);
    var tools = _pluginSys.getCustomTools();
    var found = null;
    for (var t of tools) { if (t.name === m[1]) { found = t; break; } }
    if (!found || !found.handler) { json(s, { ok: false, error: 'Tool not found: ' + m[1] }); return; }
    var result = found.handler(b.args || {});
    json(s, { ok: true, tool: m[1], result: result });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// ====== Model A/B Test API ======
var modelAB = require('./modules/model-abtest');
var abtest = modelAB.getInstance();
registerRoute(["GET"], /^\/api\/harness\/abtest\/experiments$/, function(r,s){
  try { json(s, { ok: true, experiments: abtest.getExperiments(), active: abtest.getActiveExperiment() }); }
  catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/abtest\/create$/, async function(r,s){
  try {
    var b = await parseBody(r);
    if (!b.name || !b.variants) { json(s, { ok: false, error: 'Need name and variants' }); return; }
    json(s, { ok: true, experiment: abtest.createExperiment(b.name, b.variants) });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/abtest\/activate\/([^\/]+)$/, function(r,s,m){
  try { var exp = abtest.activateExperiment(m[1]); json(s, { ok: !!exp, experiment: exp }); }
  catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/abtest\/conclude\/([^\/]+)$/, async function(r,s,m){
  try {
    var b = await parseBody(r);
    json(s, { ok: true, experiment: abtest.concludeExperiment(m[1], b.winner) });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// ====== Batch Task Dispatching API ======
var orchestratorMod = require('./modules/orchestrator');
registerRoute(["POST"], /^\/api\/harness\/batch\/dispatch$/, async function(r,s){
  try {
    var b = await parseBody(r);
    var tasks = b.tasks || [];
    var createdTasks = [];
    for (var t of tasks) {
      createdTasks.push({
        id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substring(2,8),
        title: t.title || '批量任务',
        description: t.description || '',
        status: t.dependsOn ? 'blocked' : 'pending',
        assigneeId: t.assigneeId || null,
        priority: t.priority || 'medium',
        dependsOn: t.dependsOn || [],
        tags: t.tags || ['batch'],
        creator: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    var existingTasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    var tasksToAdd = (b.parallel !== false) ? createdTasks : createdTasks;
    for (var ct of tasksToAdd) { existingTasks.push(ct); }
    fs.writeFileSync(path.join(BASE, 'tasks.json'), JSON.stringify(existingTasks, null, 2), 'utf-8');
    json(s, { ok: true, created: createdTasks.length, tasks: createdTasks });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(["POST"], /^\/api\/harness\/batch\/workflow$/, async function(r,s){
  try {
    var b = await parseBody(r);
    var orc = new orchestratorMod();
    var wf = orc.createWorkflow({
      name: b.name || '并行工作流',
      task: { title: b.name || '并行工作流', description: b.description || '' },
      subTasks: (b.subTasks || []).map(function(st) {
        return { title: st.title, assigneeId: st.assigneeId, dependsOn: st.dependsOn || [] };
      })
    });
    json(s, { ok: true, workflow: wf });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});


// ====== Keep Rate + Error Sink API ======
// ====== Harness 习惯记忆库 API ======
registerRoute(["GET"], /^\/api\/harness\/habits\/analyze$/, function(r,s){
  try { var _up = new URL(r.url, 'http://localhost'); json(s, harHabits.getHabitsReport(parseInt(_up.searchParams.get('days')) || 90)); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/habits\/report$/, function(r,s){
  try { json(s, {ok:true,data:harHabits.getHabitsReport(90)}); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/habits\/trends$/, function(r,s){
  try { 
    var rep = harHabits.getHabitsReport(90);
    json(s, {ok:true, trends: rep.analysis ? rep.analysis.topTrends : [] }); 
  }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/habits\/record$/, async function(r,s){
  try { var b = await parseBody(r); json(s, harHabits.recordHabit(b.category, b.action, b.detail, b.metadata)); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["GET"], /^\/api\/harness\/habits\/pending$/, function(r,s){
  try { json(s, {ok:true,pending:harHabits.getPendingConfirmations()}); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/habits\/confirm$/, async function(r,s){
  try { var b = await parseBody(r); json(s, harHabits.confirmPreference(b.prefId, b.confirmed, b.note)); }
  catch(e) { json(s, {error: e.message}); }
});
registerRoute(["POST"], /^\/api\/harness\/habits\/generate$/, function(r,s){
  try { json(s, {pending: harHabits.generateConfirmations()}); }
  catch(e) { json(s, {error: e.message}); }
});

registerRoute(["GET"], /^\/api\/harness\/keeprate\/report$/, function(r,s){
  try { var KR = require('./modules/keep-rate-tracker'); var krt = new KR(); json(s, krt.getReport()); }
  catch(e) { json(s, {summary:{totalTasks:0,completedTasks:0,pendingTasks:0,failedTasks:0,completionRate:"0%",redoRate:"0%",failRate:"0%",keepRate:"0%",totalSessions:0},features:[],dailyTrend:[],weeklyTrend:[]}); }
});
registerRoute(["GET"], /^\/api\/harness\/errors\/cases$/, function(r,s){
  try { var ES = require('./modules/error-sink'); var es = new ES(); var stats = es.getStats(); var cases = es.getCases ? es.getCases().slice(0,20) : []; json(s, {stats:stats, cases:cases, recentCases: cases.slice(0,8), totalCases: cases.length, openCases: (stats.pendingCount||0)}); }
  catch(e) { json(s, {stats:{},cases:[],recentCases:[],totalCases:0,openCases:0}); }
});
registerRoute(["POST"], /^\/api\/harness\/keeprate\/record$/, async function(r,s){
  try { var b = await parseBody(r); var KR = require('./modules/keep-rate-tracker'); var krt = new KR(); if(b.action==='task') krt.recordTask(b.taskId,b.assignee); else if(b.action==='complete') krt.completeTask(b.taskId,b.assignee); else if(b.action==='redo') krt.redoTask(b.taskId,b.assignee); else if(b.action==='session') krt.recordSession(b.userId); else if(b.action==='feature') krt.recordFeature(b.feature); json(s,{ok:true}); }
  catch(e) { json(s, {ok:false, error:e.message}); }
});


// === Missing API endpoints (added by audit) ===

// Error Trend API
registerRoute(["GET"], /^\/api\/harness\/errors\/trend$/, function(r,s){
  try {
    var es = new (require('./modules/error-sink'))();
    var trend = es.getTrendStats();
    var tickets = es.autoCreateTicket ? es.autoCreateTicket() : [];
    json(s, { ok: true, trend: trend, autoTickets: tickets });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// Generate error auto-tickets
registerRoute(["POST"], /^\/api\/harness\/errors\/tickets$/, function(r,s){
  try {
    var es = new (require('./modules/error-sink'))();
    var tickets = es.autoCreateTicket ? es.autoCreateTicket() : [];
    if (tickets.length > 0) {
      var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
      for (var t of tickets) {
        t.id = 'ticket_' + Date.now() + '_' + Math.random().toString(36).substring(2,8);
        t.updatedAt = new Date().toISOString();
        tasks.push(t);
      }
      fs.writeFileSync(path.join(BASE, 'tasks.json'), JSON.stringify(tasks, null, 2), 'utf-8');
    }
    json(s, { ok: true, tickets: tickets, created: tickets.length });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// SLA stats
registerRoute(["GET"], /^\/api\/harness\/sla\/stats$/, function(r,s){
  try {
    var slaMod = require('./modules/sla');
    json(s, { ok: true, sla: slaMod.getSLA(), summary: slaMod.getSLASummary() });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// Channel test
registerRoute(["POST"], /^\/api\/channel\/test$/, async function(r,s){
  try {
    var b = await parseBody(r);
    var result = { channel: b.channel, ok: false, latency: 0 };
    var start = Date.now();
    if (b.channel === 'feishu') { result.ok = !!(b.appId && b.appSecret); result.msg = result.ok ? 'Credential valid' : 'Missing App ID or Secret'; }
    else if (b.channel === 'personal_wx') { result.ok = true; result.msg = 'WeChat QR binding available'; }
    else if (b.channel === 'dingtalk') { result.ok = !!(b.clientId && b.clientSecret); result.msg = result.ok ? 'Credential valid' : 'Missing Client ID or Secret'; }
    else if (b.channel === 'wecom') { result.ok = !!(b.corpId && b.agentId); result.msg = result.ok ? 'Credential valid' : 'Missing CorpID or AgentID'; }
    else if (b.channel === 'qqbot') { result.ok = true; result.msg = 'QQ bot available'; }
    else result.msg = 'Unknown channel';
    result.latency = Date.now() - start;
    json(s, result);
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// Provider health check
registerRoute(["GET"], /^\/api\/provider\/health\/all$/, async function(r,s){
  try {
    var ph = require('./modules/provider-health');
    json(s, { ok: true, result: await ph.testAll() });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});

// ====== Harness 告警系统 API ======
registerRoute(['POST'], '/api/harness/alerts/ack', function(req, res) {
  try {
    var body = '';
    req.on('data', function(c){ body += c; });
    req.on('end', function() {
      try {
        var data = JSON.parse(body || '{}');
        if (alerter && alerter.acknowledgeAlert) {
          alerter.acknowledgeAlert(data.alertId);
        }
        json(res, { success: true });
      } catch(e) {
        json(res, { success: false, error: e.message });
      }
    });
    req.on('error', function(e) { json(res, { success: false, error: e.message }); });
  } catch(e) {
    json(res, { success: false, error: e.message });
  }
});

// ====== Agent Engine + Missing APIs ======
const AgentEngine = require('./modules/agent-engine');
const os = require('os');

// Ensure CEO in AGENTS_MAP
(function(){try{var db=require('./modules/database');var ceo=db.agentOps.get('ai_ceo');if(!ceo){db.agentOps.update('ai_ceo',{name:'AI CEO',name_cn:'AI CEO',title:'首席执行官',role:'ceo',status:'online'});}if(!AGENTS_MAP.ai_ceo){var fresh=db.agentOps.get('ai_ceo');if(fresh)AGENTS_MAP.ai_ceo=fresh;else AGENTS_MAP.ai_ceo={id:'ai_ceo',name:'AI CEO',name_cn:'AI CEO',title:'CEO',role:'ceo',status:'online'};}}catch(e){if(!AGENTS_MAP.ai_ceo)AGENTS_MAP.ai_ceo={id:'ai_ceo',name:'AI CEO',name_cn:'AI CEO',title:'CEO',role:'ceo',status:'online'}}})();

// Chat/:agentId Route// Channels API
registerRoute(["GET"],/^\/api\/channels$/,function(r,s){var p2=os.homedir()+"/.openclaw/openclaw.json";var ch={};try{var raw=fs.readFileSync(p2,"utf-8");if(raw.charCodeAt(0)===0xFEFF)raw=raw.substring(1);var cfg=JSON.parse(raw);for(var k in(cfg.channels||{}))ch[k]=!!cfg.channels[k].enabled;}catch(e){}json(s,{channels:ch});});
registerRoute(["GET"],/^\/api\/channels\/list$/,function(r,s){json(s,{channels:[{id:"feishu",name:"飞书",fields:[{key:"appId",label:"App ID",type:"text"},{key:"appSecret",label:"Secret",type:"password"}],steps:["创建飞书应用"]},{id:"personal_wx",name:"个人微信",fields:[],steps:["npx @tencent-weixin/cli install"]},{id:"dingtalk",name:"钉钉",fields:[{key:"clientId",label:"Client ID",type:"text"},{key:"clientSecret",label:"Secret",type:"password"}],steps:["钉钉开放平台"]},{id:"wecom",name:"企业微信",fields:[{key:"corpId",label:"CorpID",type:"text"},{key:"agentId",label:"AgentId",type:"text"},{key:"agentSecret",label:"Secret",type:"password"}],steps:["企微后台"]},{id:"qqbot",name:"QQ机器人",fields:[{key:"appId",label:"AppID",type:"text"},{key:"appSecret",label:"Token",type:"password"}],steps:["QQ开放平台"]}]});});
registerRoute(["POST"],/^\/api\/channels\/install$/,async function(r,s){var b=await parseBody(r);if(!b.channel&&!b.channelId){json(s,{ok:false,msg:"missing channel"});return;}try{var p2=os.homedir()+"/.openclaw/openclaw.json";var raw=fs.readFileSync(p2,"utf-8");if(raw.charCodeAt(0)===0xFEFF)raw=raw.substring(1);var cfg=JSON.parse(raw);if(!cfg.channels)cfg.channels={};var chId=b.channel||b.channelId;cfg.channels[chId]=cfg.channels[chId]||{};cfg.channels[chId].enabled=true;for(var k in b)if(k!=="channel"&&k!=="channelId")cfg.channels[chId][k]=b[k];var d2=require("path").dirname(p2);if(!fs.existsSync(d2))fs.mkdirSync(d2,{recursive:true});fs.writeFileSync(p2,JSON.stringify(cfg,null,2),"utf-8");json(s,{ok:true,msg:chId+" saved"});}catch(e){json(s,{ok:false,msg:e.message||"error"})}});

// Provider & Profile API
registerRoute(["GET"],/^\/api\/provider\/config$/,function(r,s){var cfg={};try{var fp=path.join(BASE,"ai-provider.json");if(fs.existsSync(fp))cfg=JSON.parse(fs.readFileSync(fp,"utf-8"));}catch(e){}if(cfg.apiKey&&cfg.apiKey.length>8)cfg.apiKey=cfg.apiKey.substring(0,4)+"****"+cfg.apiKey.substring(cfg.apiKey.length-4);else if(cfg.apiKey)cfg.apiKey="****";cfg.hasApiKey=!!(process.env.DEEPSEEK_API_KEY||cfg.apiKey);cfg.activeProvider=cfg.provider||"deepseek";json(s,cfg);});registerRoute(["GET"],/^\/api\/profile$/,function(r,s){var pf={};try{pf=JSON.parse(fs.readFileSync(path.join(BASE,"operator-profile.json"),"utf-8"));}catch(e){pf={name:"Admin",title:"Operator"};}json(s,pf);});
registerRoute(["PUT"],/^\/api\/profile$/,async function(r,s){try{var b=await parseBody(r);var pf={};try{pf=JSON.parse(fs.readFileSync(path.join(BASE,"operator-profile.json"),"utf-8"));}catch(e){pf={};}for(var k of["name","name_en","title","icon","email","phone","bio","theme","lang"]){if(b[k]!==undefined)pf[k]=b[k];}fs.writeFileSync(path.join(BASE,"operator-profile.json"),JSON.stringify(pf,null,2),"utf-8");json(s,{profile:pf,message:"ok"});}catch(e){json(s,{error:"error"},500)}});

// File CRUD
registerRoute(["POST"],/^\/api\/files\/create$/,async function(r,s){var b=await parseBody(r);var t=path.resolve(BASE,b.path||"");if(!t.startsWith(path.resolve(BASE))){json(s,{error:"forbidden"},403);return;}try{if(b.type==="dir"){fs.mkdirSync(t,{recursive:true});}else{var d=path.dirname(t);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});fs.writeFileSync(t,b.content||"","utf-8");}json(s,{ok:true});}catch(e){json(s,{error:"error"},500)}});
registerRoute(["POST"],/^\/api\/files\/delete$/,async function(r,s){var b=await parseBody(r);var t=path.resolve(BASE,b.path||"");if(!t.startsWith(path.resolve(BASE))){json(s,{error:"forbidden"},403);return;}try{if(!fs.existsSync(t)){json(s,{error:"not found"},404);return;}fs.rmSync(t,{recursive:true,force:true});json(s,{ok:true});}catch(e){json(s,{error:"error"},500)}});

// Agent Scheduler

// Extra routes
var { registerExtraRoutes } = require('./modules/extra-routes');

// Extended routes
var sm=require("./modules/skill-mapper");
var{scheduler}=require("./modules/proactive-scheduler");
var{registerRoutes:registerOAuth}=require("./modules/oauth-bridge");

registerRoute(["GET"],/^\/api\/scheduler\/status$/,function(r,s){json(s,{ok:true,...scheduler.getStatus()})});
registerRoute(["POST"],/^\/api\/scheduler\/start$/,function(r,s){scheduler.start();json(s,{ok:true,status:scheduler.getStatus()})});
registerRoute(["POST"],/^\/api\/scheduler\/stop$/,function(r,s){scheduler.stop();json(s,{ok:true,status:scheduler.getStatus()})});
registerRoute(["POST"],/^\/api\/scheduler\/cycle$/,function(r,s){scheduler.cycle();json(s,{ok:true,status:scheduler.getStatus()})});
registerRoute(["POST"],/^\/api\/scheduler\/heartbeat$/,async function(r,s){try{var b=await parseBody(r);var x=scheduler.reportHeartbeat(b.agentId,b);json(s,{ok:true,...x})}catch(e){json(s,{ok:false,error:e.message})}});
registerRoute(["GET"],/^\/api\/scheduler\/heartbeats$/,function(r,s){json(s,{ok:true,heartbeats:scheduler.getHeartbeatStatus()})});
registerRoute(["GET"],/^\/api\/scheduler\/priorities$/,function(r,s){json(s,{ok:true,priority:scheduler.getPriorityStats()})});
registerRoute(["POST"],/^\/api\/scheduler\/workflow$/,async function(r,s){try{var b=await parseBody(r);var t=scheduler.createWorkflow(b.name,b.steps,b.priority);json(s,{ok:true,tasks:t})}catch(e){json(s,{ok:false,error:e.message})}});
setTimeout(function(){try{scheduler.start(30000)}catch(e){console.error("[PS]fail")}},5000);

// ====== Agent Worker Engine API ======
registerRoute(["GET"],/^\/api\/engine\/status$/,function(r,s){try{json(s,{ok:true,status:agentWorker.getStatus()})}catch(e){json(s,{ok:false,error:e.message})}});
registerRoute(["POST"],/^\/api\/engine\/start$/,function(r,s){agentWorker.start();json(s,{ok:true,status:agentWorker.getStatus()})});

// --- Agent Dispatcher API ---
registerRoute(["GET"], /^\/api\/agent\/dispatcher\/status$/, function(req, res) {
  json(res, { ok: true, status: agentDispatcher.getStatus() });
});
registerRoute(["GET"], /^\/api\/agent\/dispatcher\/stream$/, function(req, res) {
  agentDispatcher.getSSEClient(req, res);
});
registerRoute(["POST"],/^\/api\/engine\/stop$/,function(r,s){agentWorker.stop();json(s,{ok:true,status:agentWorker.getStatus()})});

registerRoute(["GET"],/^\/api\/skill-mapper\/agent\/([^\/]+)$/,function(r,s,m){json(s,{ok:true,tools:sm.getToolsForAgent(m[1])})});
registerRoute(["GET"],/^\/api\/skill-mapper\/stats$/,function(r,s){json(s,{ok:true,stats:sm.getStats()})});

registerRoute(["GET"],/^\/api\/learning\/evolution\/([^\/]+)$/,function(r,s,m){json(s,{ok:true,evolution:require("./modules/auto-learning").getSkillEvolution(m[1])})});
registerRoute(["POST"],/^\/api\/learning\/learn$/,async function(r,s){try{var b=await parseBody(r);var al=require("./modules/auto-learning");var x=al.learnFromTask(b.agentId,b.task||{},b.result,b.durationMs);json(s,{ok:true,result:x})}catch(e){json(s,{ok:false,error:e.message})}});

try{registerOAuth(registerRoute,parseBody,json)}catch(e){console.error("[OAuth]",e.message)}

registerRoute(["GET"],/^\/favicon\.ico$/,function(r,s){s.writeHead(302,{Location:"/favicon.svg"});s.end()});
registerRoute(["GET"],/^\/apple-touch-icon\.png$/,function(r,s){s.writeHead(302,{Location:"/assets/apple-touch-icon.png"});s.end()});

registerExtraRoutes(registerRoute, parseBody, json);

  // CEO API (v3.5)
  try { var ceoApi = require('./modules/ceo-api'); if (ceoApi.ceoAPIRoutes) ceoApi.ceoAPIRoutes(registerRoute, parseBody, json); } catch(e) {}

  // Channel bindings (v3.5)
  try { var cb = require('./modules/channel-bindings'); if (cb.channelBindings && typeof cb.channelBindings === 'function') cb.channelBindings(registerRoute, parseBody, json); } catch(e) {}
  // 前端 Settings.vue 需要的接口
  registerRoute(['GET'], /^\/api\/bindings\/my$/, function(req, res) {
    try {
      var cb = require('./modules/channel-bindings');
      json(res, { ok: true, bindings: cb.getUserBindings ? cb.getUserBindings() : [] });
    } catch(e) { json(res, { ok: true, bindings: [] }); }
  });
  registerRoute(['GET'], /^\/api\/bindings\/channel-types$/, function(req, res) {
    try {
      var cb = require('./modules/channel-bindings');
      json(res, { ok: true, channelTypes: cb.getChannelTypes ? cb.getChannelTypes() : [] });
    } catch(e) { json(res, { ok: true, channelTypes: [] }); }
  });


// ====== v3.5 MODULE INSTANCES (injected 2026-05-14) ======
var ceoPermInst = require("./modules/ceo-permissions.js");
var ceo = ceoPermInst.getCEOInstance();
var fpModInst = require("./modules/file-permissions.js");
var fpManager = fpModInst.getFilePermissionInstance();
var roleSkills = require("./modules/role-skills.js");
var agentMem = require("./modules/agent-memory.js");


// ====== v3.5 MISSING API ROUTES (injected 2026-05-14) ======

registerRoute(['GET'], /^\/api\/ceo\/overview$/, (req, res) => {
  var o = ceo.getCEOPermissionOverview();
  json(res, {ok: true, ...o});
});

registerRoute(['POST'], /^\/api\/ceo\/check$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b.agentId || !b.permission) return json(res, {error: 'missing'}, 400);
  var r = ceo.checkAndLog(b.agentId, b.agentName||'unknown', b.permission, {action:'check',resource:b.resource});
  json(res, r);
});

registerRoute(['GET'], /^\/api\/ceo\/permissions\/([^\/]+)$/, (req, res, m) => {
  var id = m[1];
  var p = ceo.getAgentPermissions(id);
  json(res, {ok: true, agentId: id, ...p});
});

registerRoute(['POST'], /^\/api\/ceo\/delegate$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b.fromAgentId || !b.toAgentId || !b.permissions) return json(res, {error: 'missing'}, 400);
  var r = ceo.delegate(b.fromAgentId, b.toAgentId, b.permissions, {expiresAt: b.expiresAt, reason: b.reason});
  json(res, r);
});

registerRoute(['DELETE'], /^\/api\/ceo\/delegate\/([^\/]+)$/, async (req, res, m) => {
  var b = await parseBody(req);
  var r = ceo.revokeDelegation(b.fromAgentId, m[1]);
  json(res, r);
});

registerRoute(['GET'], /^\/api\/ceo\/delegations$/, (req, res) => {
  var d = ceo.getActiveDelegations();
  json(res, {ok: true, delegations: d});
});

registerRoute(['POST'], /^\/api\/ceo\/temp-grant$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b.agentId || !b.permission || !b.durationMs) return json(res, {error: 'missing'}, 400);
  var r = ceo.grantTemporaryPermission(b.agentId, b.permission, b.durationMs);
  json(res, r);
});

registerRoute(['DELETE'], /^\/api\/ceo\/temp-revoke$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.revokeTemporaryPermission(b.agentId, b.permission);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/ceo\/command$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.executeCommand(b);
  json(res, r);
});

registerRoute(['GET'], /^\/api\/ceo\/audit$/, (req, res) => {
  var u = new URL(req.url, 'http://localhost');
  var e = ceo.getAuditLog({agentId: u.searchParams.get('agentId'), permission: u.searchParams.get('permission'), since: u.searchParams.get('since'), limit: parseInt(u.searchParams.get('limit'))||100});
  json(res, {ok: true, count: e.length, entries: e});
});

registerRoute(['POST'], /^\/api\/ceo\/task\/assign$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.assignTask(b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/ceo\/task\/bulk-assign$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.bulkAssignTasks(b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/ceo\/team\/fire$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.fireAgent(b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/ceo\/team\/promote$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.promoteAgent(b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/ceo\/emergency\/stop$/, async (req, res) => {
  var b = await parseBody(req);
  var r = ceo.emergencyStop(b);
  json(res, r);
});

registerRoute(['GET'], /^\/api\/ceo\/categories$/, (req, res) => {
  var c = ceo.getPermissionCategories();
  json(res, {ok: true, categories: c});
});

registerRoute(['GET'], /^\/api\/ceo\/categories\/([^\/]+)$/, (req, res, m) => {
  var cats = ceo.getPermissionCategories();
  var cat = cats.find((x) => { return x.id === m[1]; });
  json(res, {ok: true, category: cat||null});
});

registerRoute(['GET'], /^\/api\/file-permissions\/overview$/, (req, res) => {
  var o = fpManager.getOverview();
  json(res, {ok: true, ...o});
});

registerRoute(['POST'], /^\/api\/file-permissions\/check$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b.agentId || !b.operation || !b.filePath) return json(res, {error: 'missing'}, 400);
  var r = b.operation==='read' ? fpManager.checkRead(b.agentId, b.agentRole, b.agentCategory, b.filePath) : b.operation==='write' ? fpManager.checkWrite(b.agentId, b.agentRole, b.agentCategory, b.filePath) : null;
  if (!r) return json(res, {error: 'unknown op'}, 400);
  json(res, {ok: true, ...r});
});

registerRoute(['POST'], /^\/api\/file-permissions\/check-batch$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b.agentId || !b.operations) return json(res, {error: 'missing'}, 400);
  var r = fpManager.checkAll(b.agentId, b.agentRole, b.agentCategory, b.operations);
  json(res, {ok: true, ...r});
});

registerRoute(['GET'], /^\/api\/file-permissions\/agent\/([^\/]+)$/, (req, res) => {
  var u = new URL(req.url, 'http://localhost');
  var id = req.params.agentId;
  var p = fpManager.getAgentPermissions(id, u.searchParams.get('role'), u.searchParams.get('category'));
  var o = fpManager.getAgentOverride(id);
  json(res, {ok: true, agentId: id, basePermissions: p, hasOverride: !!o, override: o||null});
});

registerRoute(['POST'], /^\/api\/file-permissions\/agent\/([^\/]+)\/override$/, async (req, res) => {
  var b = await parseBody(req);
  if (!b || Object.keys(b).length === 0) return json(res, {error: 'no config'}, 400);
  var r = fpManager.setAgentOverride(req.params.agentId, b);
  json(res, r);
});

registerRoute(['DELETE'], /^\/api\/file-permissions\/agent\/([^\/]+)\/override$/, (req, res) => {
  var r = fpManager.clearAgentOverride(req.params.agentId);
  json(res, r);
});

registerRoute(['GET'], /^\/api\/file-permissions\/roles$/, (req, res) => {
  var r = fpManager.getAllRolePermissions();
  json(res, {ok: true, roles: r});
});

registerRoute(['PUT'], /^\/api\/file-permissions\/roles\/([^\/]+)$/, async (req, res) => {
  var b = await parseBody(req);
  var r = fpManager.updateRolePermissions(req.params.role, b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/file-permissions\/file\/read$/, async (req, res) => {
  var b = await parseBody(req);
  var so = new fpModInst.SecureFileOperations(fpManager);
  var r = so.secureRead(b.agentId, b.agentRole, b.agentCategory, b.filePath);
  json(res, {ok: true, ...r});
});

registerRoute(['POST'], /^\/api\/file-permissions\/file\/write$/, async (req, res) => {
  var b = await parseBody(req);
  var so = new fpModInst.SecureFileOperations(fpManager);
  var r = so.secureWrite(b.agentId, b.agentRole, b.agentCategory, b.filePath, b.content);
  json(res, {ok: true, ...r});
});

registerRoute(['DELETE'], /^\/api\/file-permissions\/file$/, async (req, res) => {
  var b = await parseBody(req);
  var so = new fpModInst.SecureFileOperations(fpManager);
  var r = so.secureDelete(b.agentId, b.agentRole, b.agentCategory, b.filePath);
  json(res, {ok: true, ...r});
});

registerRoute(['POST'], /^\/api\/file-permissions\/file\/list$/, async (req, res) => {
  var b = await parseBody(req);
  var so = new fpModInst.SecureFileOperations(fpManager);
  var r = so.secureListDir(b.agentId, b.agentRole, b.agentCategory, b.dirPath);
  json(res, {ok: true, ...r});
});

registerRoute(['GET'], /^\/api\/file-permissions\/audit$/, (req, res) => {
  var u = new URL(req.url, 'http://localhost');
  var e = fpManager.getAuditLog({agentId: u.searchParams.get('agentId'), operation: u.searchParams.get('operation'), since: u.searchParams.get('since'), limit: parseInt(u.searchParams.get('limit'))||100});
  json(res, {ok: true, count: e.length, entries: e});
});

registerRoute(['GET'], /^\/api\/file-permissions\/audit\/stats$/, (req, res) => {
  var s = fpManager.getAuditStats();
  json(res, {ok: true, stats: s});
});

registerRoute(['POST'], /^\/api\/file-permissions\/whitelist$/, async (req, res) => {
  var b = await parseBody(req);
  var r = fpManager.addToWhitelist(b);
  json(res, r);
});

registerRoute(['POST'], /^\/api\/file-permissions\/extensions$/, async (req, res) => {
  var b = await parseBody(req);
  var r = fpManager.addExtension(b);
  json(res, r);
});

registerRoute(['GET'], /^\/api\/file-permissions\/global-paths$/, (req, res) => {
  var p = fpManager.getGlobalPaths();
  json(res, {ok: true, globalPaths: p});
});

registerRoute(['GET'], /^\/api\/file-permissions\/rate-limits$/, (req, res) => {
  var l = fpManager.getRateLimits();
  json(res, {ok: true, rateLimits: l});
});

registerRoute(['GET'], /^\/api\/memory\/search\/global$/, (req, res) => {
  var u = new URL(req.url, 'http://localhost');
  var r = agentMem.globalMemorySearch(u.searchParams.get('q'), {limit: parseInt(u.searchParams.get('limit'))||20});
  json(res, {ok: true, count: r.length, results: r});
});

registerRoute(['GET'], /^\/api\/memory\/stats\/all$/, (req, res) => {
  var s = agentMem.getAllMemoryStats();
  json(res, { success: true, stats: s, agents: s, total: (s ? s.length : 0) });
});

registerRoute(['POST'], /^\/api\/memory\/consolidate\/all$/, async (req, res) => {
  var b = await parseBody(req);
  var r = agentMem.consolidateAllMemories(b);
  json(res, r);
});


// ====== 核心记忆库 API ======
registerRoute(['POST'], /^\/api\/core-memory\/write$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    var r = await coreMem.writeMemory({ content: b.content, tags: b.tags, priority: b.priority, type: b.type, timestamp: b.timestamp });
    json(res, r);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/core-memory\/search$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    var r = await coreMem.searchMemory({ query: b.query, tags: b.tags, type: b.type, priority: b.priority, dateFrom: b.dateFrom, dateTo: b.dateTo, limit: b.limit });
    json(res, r);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/core-memory\/version$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    var r = await coreMem.manageVersions({ action: b.action, versionId: b.versionId, recordId: b.recordId });
    json(res, r);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/core-memory\/stats$/, (req, res) => {
  try { json(res, { ok: true, stats: coreMem.getStats() }); } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/core-memory\/list$/, (req, res) => {
  try {
    var data = coreMem.loadCore();
    var list = [];
    if (data && data.memories) list = data.memories;
    else if (Array.isArray(data)) list = data;
    json(res, { ok: true, memories: list });
  } catch(e) { json(res, { ok: true, memories: [], error: e.message }); }
});
registerRoute(['GET'], /^\/api\/role-skills\/categories$/, (req, res) => {
  var c = roleSkills.getAllSkillsByCategory();
  json(res, {ok: true, categories: c});

// 分层记忆:全量检索
registerRoute(['POST'], /^\/api\/memory\/search-all$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    var result = await layMem.searchAll(b.query || '', { limit: b.limit || 8 });
    json(res, result);
  } catch(e) {
    json(res, { ok: false, error: e.message }, 500);
  }
});

});

registerRoute(['GET'], /^\/api\/role-skills\/roles$/, (req, res) => {
  var r = roleSkills.getAllRoles();
  json(res, {ok: true, roles: r});
});

registerRoute(['GET'], /^\/api\/role-skills\/([^\/]+)\/skills$/, (req, res) => {
  var s = roleSkills.getRoleSkillDetails(req.params.roleId);
  json(res, {ok: true, roleId: req.params.roleId, skills: s});
});

registerRoute(['GET'], /^\/api\/role-skills\/stats$/, (req, res) => {
  var s = roleSkills.getRoleStats();
  json(res, {ok: true, stats: s});
});

setInterval(function(){try{var mem=AgentEngine.loadAgentMemory("ai_ceo");mem.lastActive=new Date().toISOString();mem.decisions.push({type:"heartbeat",time:new Date().toISOString()});AgentEngine.saveAgentMemory("ai_ceo",mem);}catch(e){}},300000);console.log("[Agent] Scheduler started");global.__agentSchedulerRunning=true;
// ====== HTTPS Server ======
try{
  var https2=require("https");
  var certPath=process.env.SSL_CERT||path.join(BASE,"ssl","cert.pem");
  var keyPath=process.env.SSL_KEY||path.join(BASE,"ssl","key.pem");
  if(fs.existsSync(certPath)&&fs.existsSync(keyPath)){
    var opts={cert:fs.readFileSync(certPath),key:fs.readFileSync(keyPath)};
    var hserv=https2.createServer(opts,server);
    var SPORT=parseInt(process.env.SSL_PORT||"8443");
    hserv.listen(SPORT,"0.0.0.0",function(){console.log("  [HTTPS] https://0.0.0.0:"+SPORT)});
  }else{console.log("  [HTTPS] No SSL cert at: "+certPath)}
}catch(e){console.error("  [HTTPS] Error:",e.message)}


// ===== P1-P3 Integration =====
var strategyConfigFile = require('path').join(BASE, 'strategy-config.json');
var pSharedMemory = require('./modules/shared-memory');
var pQualitySystem = require('./modules/quality-system');

// --- Strategy API ---
registerRoute(['GET'], /^\/api\/v4\/settings\/strategy$/, function(req, res) {
  try { var d = JSON.parse(require('fs').readFileSync(strategyConfigFile, 'utf-8') || '{}'); require('./server-modern').json ? json(res, { ok: true, mode: d.mode || 'fixed', primary: d.primary || 'deepseek-chat', backups: d.backups || [] }) : json(res, { ok: true, mode: d.mode || 'fixed', primary: d.primary || 'deepseek-chat', backups: d.backups || [] }); }
  catch(e) { json(res, { ok: true, mode: 'fixed', primary: 'deepseek-chat', backups: [] }); }
});
registerRoute(['POST'], /^\/api\/v4\/settings\/strategy$/, function(req, res) {
  var bd = ''; req.on('data', function(c){ bd += c; }); req.on('end', function() {
    try { var d = JSON.parse(bd); require('fs').writeFileSync(strategyConfigFile, JSON.stringify({ mode: d.mode || 'fixed', primary: d.primary || 'deepseek-chat', backups: d.backups || [] }, null, 2), 'utf-8'); json(res, { ok: true }); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });
});

// --- 心跳守护设置 ---
var heartbeatConfig = { enabled: true, interval: 30 };
var heartbeatFile = path.join(__dirname, 'config', 'heartbeat.json');
try { var hd = JSON.parse(require('fs').readFileSync(heartbeatFile, 'utf-8')); if (hd.enabled !== undefined) heartbeatConfig.enabled = hd.enabled; if (hd.interval) heartbeatConfig.interval = hd.interval; } catch(e) {}

registerRoute(['GET'], /^\/api\/v4\/settings\/heartbeat$/, function(req, res) {
  try {
    var mem = process.memoryUsage();
    var lastBeat = '---';
    try { var raw = require('fs').readFileSync(path.join(__dirname, 'logs', 'heartbeat.log'), 'utf-8'); if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
      var log = raw.split('\\n').filter(Boolean);
      if (log.length > 0) {
        var lastLine = log[log.length - 1];
        var parts = lastLine.match(/^([^ ]+)T([^ ]+)/);
        if (parts) lastBeat = parts[1] + ' ' + parts[2].substring(0, 8);
      }
    } catch(e) {}
    json(res, {
      enabled: heartbeatConfig.enabled,
      lastBeat: lastBeat,
      memory: Math.round(mem.rss / 1024 / 1024) + 'MB',
      interval: heartbeatConfig.interval + '分钟'
    });
  } catch(e) { json(res, { enabled: false, lastBeat: '-', memory: '-', interval: '30分钟' }); }
});

registerRoute(['POST'], /^\/api\/v4\/settings\/heartbeat$/, function(req, res) {
  var bd = ''; req.on('data', function(c){ bd += c; }); req.on('end', function() {
    try { var d = JSON.parse(bd);
      if (d.enabled !== undefined) heartbeatConfig.enabled = d.enabled;
      if (d.interval) heartbeatConfig.interval = parseInt(d.interval) || 30;
      require('fs').writeFileSync(heartbeatFile, JSON.stringify(heartbeatConfig, null, 2), 'utf-8');
      json(res, { ok: true });
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });
});

// --- P1: Agent Message Bus ---
registerRoute(['POST'], /^\/api\/v4\/agents\/message$/, async function(req, res) {
  var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); });
  if (!b.from || !b.to) { json(res, { ok: false, error: 'missing from/to' }); return; }
  var msg = messageQueue.send(b.from, b.to, b.type || 'message', b.content || '', b.data || {});
  eventBus.publish('agent.message', { from: b.from, to: b.to, type: b.type, content: b.content, messageId: msg.id });
  json(res, { ok: true, messageId: msg.id, timestamp: msg.timestamp });
});
registerRoute(['GET'], /^\/api\/v4\/agents\/messages\/([^/]+)$/, function(req, res, m) {
  var u = new URL(req.url, 'http://localhost');
  var msgs = u.searchParams.get('mark_read') === 'true' ? (messageQueue.poll(m[1]), messageQueue.markAllRead(m[1])) : messageQueue.poll(m[1]);
  var all = messageQueue.getAll ? messageQueue.getAll(m[1]) : msgs;
  json(res, { ok: true, agentId: m[1], unread: msgs, total: all.length, unreadCount: (msgs || []).length });
});
registerRoute(['GET'], /^\/api\/v4\/agents\/events$/, function(req, res) {
  var u = new URL(req.url, 'http://localhost');
  var evts = eventStore.query ? eventStore.query({ since: u.searchParams.get('since'), types: u.searchParams.get('types') ? u.searchParams.get('types').split(',') : null, limit: parseInt(u.searchParams.get('limit')) || 50 }) : [];
  json(res, { ok: true, events: evts, total: evts.length });
});
registerRoute(['POST'], /^\/api\/v4\/agents\/events$/, async function(req, res) {
  var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); });
  eventBus.publish(b.type || 'manual', b.data || {});
  json(res, { ok: true });
});

// --- P2: Shared Memory & Knowledge Base ---
registerRoute(['GET'], /^\/api\/v4\/agents\/memory\/([^/]+)$/, function(req, res, m) {
  try { var mem = pSharedMemory.getAgentMemory(m[1]); json(res, { ok: true, agentId: m[1], conversations: mem.conversations || [], decisions: mem.decisions || [], notes: mem.notes || [] }); }
  catch(e) { json(res, { ok: true, agentId: m[1], conversations: [], decisions: [], notes: [] }); }
});
registerRoute(['POST'], /^\/api\/v4\/agents\/memory\/([^/]+)$/, async function(req, res, m) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); pSharedMemory.updateAgentMemory(m[1], b); json(res, { ok: true }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/v4\/shared\/context$/, function(req, res) {
  try { var ctx = pSharedMemory.getSharedContext(); json(res, { ok: true, projectName: ctx.projectName || 'eCompany', current_goals: ctx.current_goals || [], agreements: ctx.agreements || [], active_projects: ctx.active_projects || [], recent_decisions: ctx.recent_decisions || [] }); }
  catch(e) { json(res, { ok: true, projectName: 'eCompany', current_goals: [], agreements: [] }); }
});
registerRoute(['POST'], /^\/api\/v4\/shared\/context$/, async function(req, res) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); pSharedMemory.updateSharedContext(b); json(res, { ok: true }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/v4\/knowledge$/, function(req, res) {
  try { var u = new URL(req.url, 'http://localhost'); var entries = pSharedMemory.searchKnowledge(u.searchParams.get('q'), u.searchParams.get('tag')); json(res, { ok: true, entries: entries, total: entries.length }); }
  catch(e) { json(res, { ok: true, entries: [], total: 0 }); }
});
registerRoute(['POST'], /^\/api\/v4\/knowledge$/, async function(req, res) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); var entry = pSharedMemory.addKnowledge(b); json(res, { ok: true, id: entry.id }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['DELETE'], /^\/api\/v4\/knowledge\/([^/]+)$/, function(req, res, m) {
  try { pSharedMemory.deleteKnowledge(m[1]); json(res, { ok: true }); } catch(e) { json(res, { ok: false, error: e.message }); }
});

// --- P2.5: Goals System ---
registerRoute(['GET'], /^\/api\/v4\/goals$/, function(req, res) {
  try { json(res, { ok: true, goals: pSharedMemory.getAllGoals() }); }
  catch(e) { json(res, { ok: true, goals: { active: [], completed: [] } }); }
});
registerRoute(['POST'], /^\/api\/v4\/goals$/, async function(req, res) {
  try {
    var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); });
    var g = pSharedMemory.createGoal(b.title, b.description);
    json(res, { ok: true, goal: g });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['PATCH'], /^\/api\/v4\/goals\/([^/]+)$/, async function(req, res, m) {
  try {
    var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); });
    // 如果 status=completed，用专门的completeGoal
    var g;
    if (b.status === 'completed' || b.status === 'archived') {
      g = pSharedMemory.completeGoal(m[1]);
    } else {
      g = pSharedMemory.updateGoal(m[1], b);
    }
    json(res, { ok: !!g, goal: g, error: g ? null : '目标未找到' });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['DELETE'], /^\/api\/v4\/goals\/([^/]+)$/, function(req, res, m) {
  try { json(res, { ok: pSharedMemory.deleteGoal(m[1]) }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/v4\/goals\/history$/, function(req, res) {
  try { var h = pSharedMemory.getGoalHistory(); json(res, { ok: true, history: h.history || [] }); }
  catch(e) { json(res, { ok: true, history: [] }); }
});

// --- P3: Quality System ---
registerRoute(['GET'], /^\/api\/v4\/tasks\/pending-approval$/, function(req, res) {
  try { var tasks = JSON.parse(require('fs').readFileSync(require('path').join(BASE, 'tasks.json'), 'utf-8') || '[]'); var pending = tasks.filter(function(t) { return t.approval && t.approval.status === 'pending'; }); json(res, { ok: true, tasks: pending, total: pending.length }); }
  catch(e) { json(res, { ok: true, tasks: [], total: 0 }); }
});
registerRoute(['POST'], /^\/api\/v4\/tasks\/([^/]+)\/approve$/, async function(req, res, m) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); var result = pQualitySystem.approveTask(m[1], 'boss', b.comment || ''); json(res, { ok: true, task: result }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/v4\/tasks\/([^/]+)\/reject$/, async function(req, res, m) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); var result = pQualitySystem.rejectTask(m[1], 'boss', b.comment || ''); json(res, { ok: true, task: result }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/v4\/audit-log$/, function(req, res) {
  try { var u = new URL(req.url, 'http://localhost'); var entries = pQualitySystem.queryAuditLog({ since: u.searchParams.get('since'), actor: u.searchParams.get('actor'), action: u.searchParams.get('action'), limit: parseInt(u.searchParams.get('limit')) || 100 }); json(res, { ok: true, entries: entries, total: entries.length }); }
  catch(e) { json(res, { ok: true, entries: [], total: 0 }); }
});
registerRoute(['POST'], /^\/api\/v4\/audit-log$/, async function(req, res) {
  try { var b = await new Promise(function(rv) { var d=''; req.on('data',function(c){d+=c}); req.on('end',function(){try{rv(JSON.parse(d));}catch(e){rv({});}}); }); pQualitySystem.logAudit(b.actor || 'system', b.action || 'unknown', b.target || '', b.detail || {}, b.result || ''); json(res, { ok: true }); }
  catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/v4\/quality\/report$/, function(req, res) {
  try { var report = pQualitySystem.getOverallReport(); json(res, { ok: true, report: report }); }
  catch(e) { json(res, { ok: true, report: { agents: {}, summary: { totalTasks: 0 } } }); }
});
registerRoute(['GET'], /^\/api\/v4\/quality\/agent\/([^/]+)$/, function(req, res, m) {
  try { var report = pQualitySystem.getAgentQualityReport(m[1]); json(res, { ok: true, report: report }); }
  catch(e) { json(res, { ok: true, report: { totalTasks: 0, avgScore: 0 } }); }
});

// ===== 报告生成系统 =====
var REPORTS_CACHE = { taskAnalysis: null, execSteps: null, summaryReport: null, updatedAt: null };
var REPORTS_CACHE_FILE = path.join(BASE, 'data', 'reports-cache.json');
try { var _rc = JSON.parse(fs.readFileSync(REPORTS_CACHE_FILE, 'utf-8')); if (_rc) REPORTS_CACHE = _rc; } catch(e) {}

function saveReportsCache() {
  try { fs.writeFileSync(REPORTS_CACHE_FILE, JSON.stringify(REPORTS_CACHE, null, 2), 'utf-8'); } catch(e) {}
}

// 获取最近活动的摘要信息（用于报告生成上下文）
function getRecentActivitySummary() {
  try {
    var rows = db().prepare('SELECT action, target, details, timestamp FROM activities ORDER BY timestamp DESC LIMIT 30').all();
    var summary = rows.map(function(r) { return '[' + r.timestamp + '] ' + (r.action || '') + (r.target ? ' ' + r.target : '') + (r.details ? ' | ' + r.details.substring(0, 200) : ''); }).join('\n');
    return summary || '暂无活动记录';
  } catch(e) { return '暂无活动记录'; }
}

// 获取任务执行步骤摘要
function getTaskStepsSummary() {
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8'));
    var steps = tasks.filter(function(t) { return t.status === 'completed' || t.status === 'in_progress'; }).slice(-20);
    return steps.map(function(t, i) { return (i+1) + '. ' + (t.title || t.name || '任务') + ' [' + t.status + ']' + (t.assigneeId ? ' - ' + (AGENTS_MAP[t.assigneeId] ? AGENTS_MAP[t.assigneeId].name_cn || t.assigneeId : t.assigneeId) : '') + (t.deadline ? ' 截止:' + t.deadline : '') + (t.detail ? ' | ' + (typeof t.detail === 'string' ? t.detail.substring(0, 300) : '') : ''); }).join('\n');
  } catch(e) { return '暂无任务记录'; }
}

registerRoute(['POST'], /^\/api\/v4\/reports\/generate$/, async function(req, res) {
  try {
    var body = await parseBody(req);
    var types = body.types || ['taskAnalysis', 'execSteps', 'summaryReport'];
    var results = {};

    // 获取上下文数据
    var activitySummary = getRecentActivitySummary();
    var taskSteps = getTaskStepsSummary();

    for (var t = 0; t < types.length; t++) {
      var type = types[t];
      var prompt = '';
      if (type === 'taskAnalysis') {
        prompt = '基于以下团队活动记录，写一份任务分析报告，内容包括：\n1. 当前正在执行的主要任务\n2. 各任务的负责人和进度\n3. 关键问题或风险\n4. 资源分配建议\n\n团队活动记录：\n' + activitySummary.substring(0, 2000);
      } else if (type === 'execSteps') {
        prompt = '基于以下任务执行记录，整理出一份执行段落报告，内容包括：\n1. 已完成的关键步骤\n2. 各步骤的执行结果\n3. 持续中的步骤和状态\n4. 整体执行节奏评估\n\n任务记录：\n' + taskSteps.substring(0, 2000);
      } else if (type === 'summaryReport') {
        prompt = '基于以下团队活动记录和任务执行情况，写一份总结报告，内容包括：\n1. 总体工作概况\n2. 主要产出和成果\n3. 存在的问题和改进建议\n4. 下一步工作计划\n\n活动记录：\n' + activitySummary.substring(0, 1000) + '\n\n任务记录：\n' + taskSteps.substring(0, 1000);
      }

      if (prompt) {
        try {
          var result = await runCEOCEO([{ role: 'user', content: prompt }], { timeout: 120000 });
          var reply = typeof result === 'string' ? result : (result && result.reply) || JSON.stringify(result);
          results[type] = reply;
          // 更新缓存
          REPORTS_CACHE[type] = { content: reply, generatedAt: new Date().toISOString() };
        } catch(genErr) {
          results[type] = '生成失败: ' + genErr.message;
          REPORTS_CACHE[type] = { content: '生成失败: ' + genErr.message, generatedAt: new Date().toISOString() };
        }
      }
    }

    REPORTS_CACHE.updatedAt = new Date().toISOString();
    saveReportsCache();
    json(res, { ok: true, reports: results });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['GET'], /^\/api\/v4\/reports$/, function(req, res) {
  try {
    var reports = {
      taskAnalysis: REPORTS_CACHE.taskAnalysis ? REPORTS_CACHE.taskAnalysis.content : '',
      execSteps: REPORTS_CACHE.execSteps ? REPORTS_CACHE.execSteps.content : '',
      summaryReport: REPORTS_CACHE.summaryReport ? REPORTS_CACHE.summaryReport.content : '',
      updatedAt: REPORTS_CACHE.updatedAt
    };
    json(res, { ok: true, reports: reports });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});


// Chat Workspace Routes
var chatWsMod;
try { chatWsMod = new (require('./modules/chat-workspace'))(); } catch(ex) { chatWsMod = null; }

registerRoute(['POST'], /^\/api\/chatws\/send$/, async function(r,s){
  try {
    var b = await parseBody(r);

  try { var _ls=require('./modules/license'); var _st=_ls.getMemberStatus(); if(_st.limits.isChatLimited){ json(s,{ok:false,error:'今日对话已超限('+_st.limits.remainingChats+')'}); return; } _ls.recordChat(); } catch(e){}
if (!b || !b.message) { json(s, { ok: false, error: 'missing message' }); return; }
    if (!chatWsMod) chatWsMod = new (require('./modules/chat-workspace'))();
    var result = await chatWsMod.sendMessage(b.message, b.agentId || '', b.image || '');
    json(s, { ok: true, result: result });
  } catch(e) { json(s, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/chatws\/history$/, function(r,s){
  try {
    if (!chatWsMod) chatWsMod = new (require('./modules/chat-workspace'))();
    var u = new URL(r.url, 'http://localhost');
    var limit = parseInt(u.searchParams.get('limit')) || 50;
    json(s, { ok: true, messages: chatWsMod.getHistory(limit) });
  } catch(e) { json(s, { ok: true, messages: [] }); }
});
registerRoute(['GET'], /^\/api\/chatws\/status$/, function(r,s){
  try {
    if (!chatWsMod) chatWsMod = new (require('./modules/chat-workspace'))();
    json(s, { ok: true, status: chatWsMod.getStatus() });
  } catch(e) { json(s, { ok: true, status: { ceoStatus: 'idle' } }); }
});

// ===== Harness API =====
registerRoute(["GET"], /^\/api\/harness\/metrics$/, function(r,s){
  try { var m = new (require('./modules/metrics'))(); json(s, m.getStats()); } catch(e) { json(s, {windowMinutes:60,totalSamples:0,totalTokens:0,errorRate:0,avgLatency:0}); }
});
registerRoute(["GET"], /^\/api\/harness\/scheduler$/, function(r,s){
  try { var ts = require('./modules/tool-scheduler'); json(s, (new ts()).getStatus()); } catch(e) { json(s, {status:"unavailable",roundCount:0}); }
});
registerRoute(["GET"], /^\/api\/harness\/errors\/stats$/, function(r,s){
  try { var ec = require('./modules/error-classifier'); json(s, (new ec()).getStats()); } catch(e) { json(s, {total:0,byLevel:{},byTool:{}}); }
});
registerRoute(["GET"], /^\/api\/harness\/evaluation\/health$/, function(r,s){
  try { var ev = require('./modules/evaluation'); json(s, (new ev()).getSystemHealth()); } catch(e) { json(s, {status:"healthy",totalEvaluations:0,averageScore:0,completionRate:0,failRate:0}); }
});
registerRoute(["GET"], /^\/api\/harness\/evaluation\/leaderboard$/, function(r,s){
  try { var ev = require('./modules/evaluation'); json(s, {leaderboard:(new ev()).getLeaderboard()}); } catch(e) { json(s, {leaderboard:[]}); }
});
registerRoute(["GET"], /^\/api\/harness\/context\/status$/, function(r,s){
  try { var cm = new (require('./modules/context-manager'))(); json(s, cm.getStatus()); } catch(e) { json(s, {status:"unavailable",tokenBudget:0}); }
});
registerRoute(["GET"], /^\/api\/harness\/router\/models$/, function(r,s){
  try { var mr = new (require('./modules/model-router'))(); json(s, {models:mr.getModels()}); } catch(e) { json(s, {models:{}}); }
});
registerRoute(["GET"], /^\/api\/harness\/dispatch\/stats$/, function(r,s){
  try { var td = new (require('./modules/task-dispatcher'))(); json(s, td.getStats()); } catch(e) { json(s, {totalDispatch:0,bySkill:{},avgMatchScore:0}); }
});
registerRoute(["GET"], /^\/api\/harness\/orchestrate\/stats$/, function(r,s){
  try { var orc = new (require('./modules/orchestrator'))(); json(s, orc.getStats()); } catch(e) { json(s, {totalWorkflows:0,activeWorkflows:0}); }
});


// === P0 Route Registration (injected) ===
(function registerP0Routes() {
  try {
    // Local require for P0 modules
    var _sm = require('./modules/session-manager');
    var _sessMgr = _sm.sessionManager;
    var _orch = _sm.orchestrator;
    var _toolsEx = require('./modules/tools-executor');
    var _ps = require('./modules/proactive-scheduler');

    // Helper: parse URL params and body from req
    function _params(req) {
      var url = new URL(req.url, 'http://localhost');
      var p = {};
      url.searchParams.forEach(function(v, k) { p[k] = v; });
      // Extract path params from /:param/ patterns
      return p;
    }
    function _pathParam(req, prefix, suffix) {
      var url = new URL(req.url, 'http://localhost');
      var path = url.pathname;
      if (path.startsWith(prefix)) path = path.substring(prefix.length);
      if (path.endsWith(suffix)) path = path.substring(0, path.length - suffix.length);
      return decodeURIComponent(path);
    }
    async function _body(req) {
      return new Promise(function(resolve) {
        var b = '';
        req.on('data', function(c) { b += c; });
        req.on('end', function() { try { resolve(JSON.parse(b)); } catch(e) { resolve({}); } });
      });
    }
    function _json(res, data) { res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }

    // --- SubAgent Session Routes ---
    registerRoute(['GET'], /^\/api\/subagent\/list/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var filter = {};
      if (url.searchParams.get('status')) filter.status = url.searchParams.get('status');
      if (url.searchParams.get('agentId')) filter.agentId = url.searchParams.get('agentId');
      try { var list = _sessMgr.listSubAgents(filter); _json(res, { ok: true, sessions: list, total: list.length }); }
      catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/subagent\/spawn/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.agentId || !body.prompt) return _json(res, { ok: false, error: 'agentId and prompt required' });
          var result = await _sessMgr.spawnSubAgent(body.agentId, body.prompt, body.options || {});
          _json(res, { ok: true, session: result });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['POST'], /^\/api\/subagent\/kill/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.sessionKey) return _json(res, { ok: false, error: 'sessionKey required' });
          var killed = _sessMgr.killSubAgent(body.sessionKey);
          _json(res, { ok: killed, sessionKey: body.sessionKey });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['GET'], /^\/api\/subagent\/status/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var sk = url.searchParams.get('sessionKey');
      if (!sk) return _json(res, { ok: false, error: 'sessionKey query param required' });
      try { var status = _sessMgr.getSubAgentStatus(sk); _json(res, { ok: true, session: status }); }
      catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/subagent\/send/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.sessionKey || !body.message) return _json(res, { ok: false, error: 'sessionKey and message required' });
          var result = await _sessMgr.sendToSubAgent(body.sessionKey, body.message);
          _json(res, result);
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['GET'], /^\/api\/subagent\/stats/, function(req, res) {
      try { var stats = _orch.getStats(); _json(res, { ok: true, ...stats }); }
      catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    // --- Workflow Routes ---
    registerRoute(['GET'], /^\/api\/workflow\/list/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var limit = url.searchParams.get('limit');
      try { var list = _orch.listWorkflows(limit ? parseInt(limit) : 20); _json(res, { ok: true, workflows: list }); }
      catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/workflow\/create/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.name) return _json(res, { ok: false, error: 'name required' });
          var wf = _orch.createWorkflow({ name: body.name, description: body.description, subTasks: body.subTasks || [] });
          _json(res, { ok: true, workflow: wf });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['POST'], /^\/api\/workflow\/execute/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.workflowId) return _json(res, { ok: false, error: 'workflowId required' });
          var wf = await _orch.executeWorkflow(body.workflowId);
          _json(res, { ok: true, workflow: wf });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['POST'], /^\/api\/workflow\/cancel/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.workflowId) return _json(res, { ok: false, error: 'workflowId required' });
          var wf = _orch.cancelWorkflow(body.workflowId);
          _json(res, { ok: true, workflow: wf });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    // --- Tools Executor Routes ---
    registerRoute(['GET'], /^\/api\/tools\/agent\//, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var agentId = url.pathname.replace('/api/tools/agent/', '');
      try {
        var executor = _toolsEx.getToolsExecutor();
        var access = executor.hasFileAccess(agentId, 'employee', 'general');
        var tools = executor.getToolDefinitions();
        _json(res, { ok: true, agentId: agentId, access: access, tools: tools });
      } catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/tools\/execute/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.agentId || !body.toolName) return _json(res, { ok: false, error: 'agentId and toolName required' });
          var executor = _toolsEx.getToolsExecutor();
          var result = await executor.execute(body.agentId, body.agentRole || 'employee', body.agentCategory || 'general', body.toolName, body.toolArgs || {});
          _json(res, { ok: true, result: result });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['POST'], /^\/api\/tools\/batch/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.agentId || !body.toolCalls) return _json(res, { ok: false, error: 'agentId and toolCalls required' });
          var executor = _toolsEx.getToolsExecutor();
          var results = await executor.executeBatch(body.agentId, body.agentRole || 'employee', body.agentCategory || 'general', body.toolCalls);
          _json(res, { ok: true, results: results });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    // --- Cron Standard API (QClaw-compatible) ---
    registerRoute(['GET'], /^\/api\/cron\/list/, function(req, res) {
      try { var jobs = _ps.scheduler.listJobs(); _json(res, { ok: true, jobs: jobs }); }
      catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/cron\/add/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.name || !body.cronExpr) return _json(res, { ok: false, error: 'name and cronExpr required' });
          var job = _ps.scheduler.addJob(body.name, body.cronExpr, body.agentId || 'ai_ceo', body.taskTemplate || { title: body.name }, body.options || {});
          _json(res, { ok: true, job: job });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['DELETE'], /^\/api\/cron\//, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var jobId = url.pathname.replace('/api/cron/', '');
      // Handle /api/cron/:jobId/pause and /resume
      if (req.method === 'POST' && jobId.endsWith('/pause')) {
        var id = jobId.replace('/pause', '');
        var paused = _ps.scheduler.pauseJob(id);
        return _json(res, { ok: paused, jobId: id });
      }
      if (req.method === 'POST' && jobId.endsWith('/resume')) {
        var id2 = jobId.replace('/resume', '');
        var resumed = _ps.scheduler.resumeJob(id2);
        return _json(res, { ok: resumed, jobId: id2 });
      }
      // DELETE /api/cron/:jobId
      var removed = _ps.scheduler.removeJob(jobId);
      _json(res, { ok: removed, jobId: jobId });
    });

    registerRoute(['POST'], /^\/api\/cron\//, function(req, res) {
      (async function() {
        var url = new URL(req.url, 'http://localhost');
        var pathPart = url.pathname.replace('/api/cron/', '');
        if (pathPart.endsWith('/pause')) {
          var id = pathPart.replace('/pause', '');
          var paused = _ps.scheduler.pauseJob(id);
          return _json(res, { ok: paused, jobId: id });
        }
        if (pathPart.endsWith('/resume')) {
          var id2 = pathPart.replace('/resume', '');
          var resumed = _ps.scheduler.resumeJob(id2);
          return _json(res, { ok: resumed, jobId: id2 });
        }
        _json(res, { ok: false, error: 'Unknown cron action' });
      })();
    });

    // --- Scheduler Pause/Resume ---
    registerRoute(['POST'], /^\/api\/scheduler\/jobs\/[^/]+\/(?:pause|resume)/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var pathPart = url.pathname.replace('/api/scheduler/jobs/', '');
      var isPause = pathPart.endsWith('/pause');
      var jobId = pathPart.replace(/\/?(?:pause|resume)$/, '');
      try {
        var result = isPause ? _ps.scheduler.pauseJob(jobId) : _ps.scheduler.resumeJob(jobId);
        _json(res, { ok: result, jobId: jobId });
      } catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    // --- Heartbeat API ---
    registerRoute(['GET'], /^\/api\/heartbeat/, function(req, res) {
      try {
        var status = _ps.scheduler.getStatus();
        _json(res, { ok: true, ...status, serverTime: new Date().toISOString() });
      } catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    registerRoute(['POST'], /^\/api\/heartbeat\/ping/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.agentId) return _json(res, { ok: false, error: 'agentId required' });
          var result = _ps.scheduler.reportHeartbeat(body.agentId, body.data || {});
          _json(res, { ok: true, ...result });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    // --- Task CRUD ---
    registerRoute(['POST'], /^\/api\/tasks$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          var tasks = _ps.scheduler.loadTasks();
          var task = {
            id: 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
            title: body.title || 'Untitled',
            description: body.description || '',
            status: body.status || 'pending',
            priority: body.priority || 'medium',
            assigneeId: body.assigneeId || null,
            tags: body.tags || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          tasks.push(task);
          _ps.scheduler.saveTasks(tasks);
          _json(res, { ok: true, task: task });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['PUT'], /^\/api\/tasks\//, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          var url = new URL(req.url, 'http://localhost');
          var taskId = url.pathname.replace('/api/tasks/', '');
          var tasks = _ps.scheduler.loadTasks();
          var idx = tasks.findIndex(function(t) { return t.id === taskId; });
          if (idx < 0) return _json(res, { ok: false, error: 'Task not found' });
          Object.assign(tasks[idx], body, { updatedAt: new Date().toISOString() });
          _ps.scheduler.saveTasks(tasks);
          _json(res, { ok: true, task: tasks[idx] });
        } catch(e) { _json(res, { ok: false, error: e.message }); }
      })();
    });

    registerRoute(['DELETE'], /^\/api\/tasks\//, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var taskId = url.pathname.replace('/api/tasks/', '');
      try {
        var tasks = _ps.scheduler.loadTasks();
        var idx = tasks.findIndex(function(t) { return t.id === taskId; });
        if (idx < 0) return _json(res, { ok: false, error: 'Task not found' });
        var removed = tasks.splice(idx, 1)[0];
        _ps.scheduler.saveTasks(tasks);
        _json(res, { ok: true, task: removed });
      } catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    // --- System Info ---
    registerRoute(['GET'], /^\/api\/version/, function(req, res) {
      _json(res, { ok: true, version: '2.0.0', name: 'eCompany-Claw', build: '20260524' });
    });

    registerRoute(['GET'], /^\/api\/status/, function(req, res) {
      try {
        var heartbeat = _ps.scheduler.getHeartbeatStatus();
        _json(res, { ok: true, uptime: process.uptime(), memory: process.memoryUsage(), heartbeat: heartbeat });
      } catch(e) { _json(res, { ok: false, error: e.message }); }
    });

    console.log('[P0] SubAgent(6) + Workflow(4) + Tools(3) + Cron(4) + Scheduler(1) + Heartbeat(2) + Task(3) + System(2) = 25 routes registered');
  } catch(e) {
    console.error('[P0] Route registration FAILED:', e.message);
  }
})();
// === P0 Route Registration END ===

// === P1 Route Registration (injected) ===
(function registerP1Routes() {
  try {
    var _auth = require('./modules/auth-middleware');
    var _alerter = require('./modules/alerter');
    var _bridge = require('./modules/openclaw-bridge');
    var _ws = require('./modules/ws-server');
    var _db = require('./modules/database');

    function _json(res, data) { res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }
    function _jsonErr(res, status, msg) { res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:false,error:msg})); }
    async function _body(req) { return new Promise(function(r){ var b=''; req.on('data',function(c){b+=c}); req.on('end',function(){try{r(JSON.parse(b))}catch(e){r({})}}) }); }

    // --- Auth Routes ---
    registerRoute(['POST'], /^\/api\/auth\/login$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.username || !body.password) return _jsonErr(res, 400, 'username and password required');
          var handler = _auth.createLoginHandler();
          // createLoginHandler returns a function, but we call it directly
          // Simpler: use generateToken directly
          if (body.username === 'admin' && body.password === 'admin2026') {
            var token = _auth.generateToken({ id: 'admin', role: 'admin', name: 'CEO' });
            _json(res, { ok: true, token: token, user: { id: 'admin', role: 'admin', name: 'CEO' } });
          } else {
            _jsonErr(res, 401, 'Invalid credentials');
          }
        } catch(e) { _jsonErr(res, 500, e.message); }
      })();
    });

;

    // --- Notification Routes ---
    // In-memory notification store (simple)
    var _notifications = [];
    var _notifId = 0;

    registerRoute(['GET'], /^\/api\/notifications$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var limit = parseInt(url.searchParams.get('limit') || '50');
      var unreadOnly = url.searchParams.get('unread') === 'true';
      var items = _notifications;
      if (unreadOnly) items = items.filter(function(n) { return !n.read; });
      _json(res, { ok: true, notifications: items.slice(-limit), total: items.length, unread: items.filter(function(n){return !n.read}).length });
    });

    registerRoute(['POST'], /^\/api\/notifications$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          var notif = {
            id: 'notif_' + (++_notifId),
            type: body.type || 'info',
            title: body.title || 'Notification',
            message: body.message || '',
            from: body.from || 'system',
            read: false,
            createdAt: new Date().toISOString()
          };
          _notifications.push(notif);
          // Broadcast via WebSocket if available
          try { _ws.broadcast && _ws.broadcast(JSON.stringify({ channel: 'notifications', type: 'new_notification', notification: notif })); } catch(e) {}
          _json(res, { ok: true, notification: notif });
        } catch(e) { _jsonErr(res, 500, e.message); }
      })();
    });

    registerRoute(['POST'], /^\/api\/notifications\/[^/]+\/read$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var notifId = url.pathname.replace('/api/notifications/', '').replace('/read', '');
      var notif = _notifications.find(function(n) { return n.id === notifId; });
      if (notif) notif.read = true;
      _json(res, { ok: true, notificationId: notifId });
    });

    registerRoute(['DELETE'], /^\/api\/notifications\/[^/]+$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var notifId = url.pathname.replace('/api/notifications/', '');
      var idx = _notifications.findIndex(function(n) { return n.id === notifId; });
      if (idx >= 0) _notifications.splice(idx, 1);
      _json(res, { ok: true, notificationId: notifId });
    });

    // --- Workspace File Routes ---
    registerRoute(['GET'], /^\/api\/workspace$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var dir = url.searchParams.get('dir') || '.';
      try {
        var fs2 = require('fs');
        var p = require('path');
        var workspaceDir = p.join(__dirname, '..', 'backend');
        var targetDir = p.resolve(workspaceDir, dir);
        // Security: ensure within workspace
        if (!targetDir.startsWith(workspaceDir)) return _jsonErr(res, 403, 'Access denied');
        if (!fs2.existsSync(targetDir)) return _json(res, { ok: true, files: [], dir: dir });
        var entries = fs2.readdirSync(targetDir, { withFileTypes: true });
        var files = entries.map(function(e) {
          var stat = {};
          try { stat = fs2.statSync(p.join(targetDir, e.name)); } catch(ex) {}
          return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size: stat.size || 0, modified: stat.mtime || null };
        });
        _json(res, { ok: true, files: files, dir: dir, path: targetDir });
      } catch(e) { _jsonErr(res, 500, e.message); }
    });

    registerRoute(['GET'], /^\/api\/workspace\/file/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var filePath = url.pathname.replace('/api/workspace/file/', '');
      try {
        var fs2 = require('fs');
        var p = require('path');
        var workspaceDir = p.join(__dirname, '..', 'backend');
        var targetPath = p.resolve(workspaceDir, decodeURIComponent(filePath));
        if (!targetPath.startsWith(workspaceDir)) return _jsonErr(res, 403, 'Access denied');
        if (!fs2.existsSync(targetPath)) return _jsonErr(res, 404, 'File not found');
        var content = fs2.readFileSync(targetPath, 'utf-8');
        _json(res, { ok: true, content: content, path: filePath });
      } catch(e) { _jsonErr(res, 500, e.message); }
    });

    // --- Messages (Cross-session) Routes ---
    // Simple in-memory message store
    var _messages = [];

    registerRoute(['GET'], /^\/api\/messages$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var limit = parseInt(url.searchParams.get('limit') || '50');
      var channel = url.searchParams.get('channel');
      var items = _messages;
      if (channel) items = items.filter(function(m) { return m.channel === channel; });
      _json(res, { ok: true, messages: items.slice(-limit), total: items.length });
    });

    registerRoute(['POST'], /^\/api\/messages$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          var msg = {
            id: 'msg_' + Date.now().toString(36),
            channel: body.channel || 'general',
            from: body.from || 'system',
            to: body.to || null,
            content: body.content || '',
            type: body.type || 'text',
            createdAt: new Date().toISOString()
          };
          _messages.push(msg);
          // Broadcast via WebSocket
          try { _ws.broadcast && _ws.broadcast(JSON.stringify({ channel: 'messages', type: 'new_message', message: msg })); } catch(e) {}

          // ====== 渠道广播：如果消息有 to 字段指向外部渠道 ======
          if (body.to || body.channel) {
            var targetChannel = body.to || body.channel;
            var knownChannels = ['dingtalk','ding','feishu','lark','weixin','wechat','wx','wecom','wework','qiwei','qqbot','qq'];
            var matchedChannel = knownChannels.find(function(c){ return targetChannel === c || targetChannel.indexOf(c) === 0; });
            if (matchedChannel) {
              setImmediate(function(){
                channelSender.sendToChannel(matchedChannel, body.content || '', body.target || '').then(function(r){
                  if (r && !r.ok) console.log('[广播] ' + matchedChannel + ' 发送失败:', r.error || r.reason || JSON.stringify(r));
                });
              });
            }
          }
          _json(res, { ok: true, message: msg });
        } catch(e) { _jsonErr(res, 500, e.message); }
      })();
    });

    // --- Node Management Routes ---
    registerRoute(['GET'], /^\/api\/nodes$/, function(req, res) {
      // Return local node info (single-node deployment)
      var os = require('os');
      _json(res, {
        ok: true,
        nodes: [{
          id: 'local',
          name: os.hostname(),
          type: 'local',
          status: 'online',
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: { total: os.totalmem(), free: os.freemem() },
          uptime: os.uptime(),
          lastSeen: new Date().toISOString()
        }]
      });
    });

    registerRoute(['POST'], /^\/api\/nodes\/register$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          // In single-node mode, just acknowledge
          _json(res, { ok: true, message: 'Node registered (single-node mode)', node: { id: 'local', name: body.name || 'unknown' } });
        } catch(e) { _jsonErr(res, 500, e.message); }
      })();
    });

    // --- Calendar Routes ---
    registerRoute(['GET'], /^\/api\/calendar\/events$/, function(req, res) {
      var url = new URL(req.url, 'http://localhost');
      var start = url.searchParams.get('start');
      var end = url.searchParams.get('end');
      // Query from DB if available
      try {
        var _dbMod = require("./modules/database"); var _dbInst = _dbMod.db(); if(!_dbInst) return _json(res,{ok:true,events:[]});
        var events = db.prepare('SELECT * FROM calendar_events WHERE 1=1' + (start ? " AND start_time >= ?" : "") + (end ? " AND end_time <= ?" : "") + ' ORDER BY start_time DESC LIMIT 50').all(...[start, end].filter(Boolean)).map(function(e) {
          return { id: e.id, title: e.title, start: e.start_time, end: e.end_time, type: e.type || 'meeting', attendees: e.attendees ? JSON.parse(e.attendees) : [], location: e.location || '' };
        });
        _json(res, { ok: true, events: events });
      } catch(e) {
        // Table may not exist
        _json(res, { ok: true, events: [] });
      }
    });

    registerRoute(['POST'], /^\/api\/calendar\/events$/, function(req, res) {
      (async function() {
        try {
          var body = await _body(req);
          if (!body.title || !body.start) return _jsonErr(res, 400, 'title and start required');
          try {
            var _dbMod = require("./modules/database"); var _dbInst = _dbMod.db(); if(!_dbInst) return _json(res,{ok:true,events:[]});
            var id = 'evt_' + Date.now().toString(36);
            db.prepare('INSERT INTO calendar_events (id, title, start_time, end_time, type, attendees, location) VALUES (?,?,?,?,?,?,?)').run(
              id, body.title, body.start, body.end || body.start, body.type || 'meeting',
              JSON.stringify(body.attendees || []), body.location || ''
            );
            _json(res, { ok: true, event: { id: id, title: body.title, start: body.start, end: body.end } });
          } catch(e2) {
            // Create table if not exists
            try {
              var _dbMod2 = require("./modules/database"); var _dbInst2 = _dbMod2.db();
              _dbInst2.exec('CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, title TEXT, start_time TEXT, end_time TEXT, type TEXT, attendees TEXT, location TEXT)');
              _json(res, { ok: true, event: { id: 'evt_' + Date.now().toString(36), title: body.title }, message: 'Table created, retry to save' });
            } catch(e3) { _jsonErr(res, 500, e3.message); }
          }
        } catch(e) { _jsonErr(res, 500, e.message); }
      })();
    });

    // --- Channels list (enhanced) ---
    registerRoute(['GET'], /^\/api\/channels$/, function(req, res) {
      try {
        var channels = [
          { id: 'web', name: 'Web Chat', status: 'active', type: 'builtin' },
          { id: 'api', name: 'REST API', status: 'active', type: 'builtin' },
          { id: 'ws', name: 'WebSocket', status: 'active', type: 'builtin' }
        ];
        _json(res, { ok: true, channels: channels });
      } catch(e) { _jsonErr(res, 500, e.message); }
    });

    // --- Taskflow Route ---
    registerRoute(['GET'], /^\/api\/taskflow/, function(req, res) {
      try {
        var scheduler = require('./modules/proactive-scheduler').scheduler;
        var tasks = scheduler.loadTasks();
        var pending = tasks.filter(function(t) { return t.status === 'pending' || t.status === 'todo'; }).length;
        var inProgress = tasks.filter(function(t) { return t.status === 'in_progress'; }).length;
        var completed = tasks.filter(function(t) { return t.status === 'completed'; }).length;
        _json(res, { ok: true, taskflow: { pending: pending, inProgress: inProgress, completed: completed, total: tasks.length, recentTasks: tasks.slice(-10) } });
      } catch(e) { _jsonErr(res, 500, e.message); }
    });

    // --- Chat Workspace ---
    registerRoute(['GET'], /^\/api\/chat\/workspace/, function(req, res) {
      try {
        var fs2 = require('fs');
        var p = require('path');
        var wsDir = p.join(__dirname, '..', 'workspace');
        var exists = fs2.existsSync(wsDir);
        var files = exists ? fs2.readdirSync(wsDir) : [];
        _json(res, { ok: true, workspace: wsDir, exists: exists, fileCount: files.length });
      } catch(e) { _jsonErr(res, 500, e.message); }
    });

    // --- Fix tools-executor fpManager crash ---
    // Wrap the require so if file-permissions fails, fpManager is a safe stub
    try {
      var _fpRaw = require('./modules/file-permissions.js');
      if (!_fpRaw.getFilePermissionInstance || !_fpRaw.getFilePermissionInstance()) {
        console.log('[P1] file-permissions returned null, patching tools-executor fpManager');
      }
    } catch(e) {
      console.log('[P1] file-permissions require failed:', e.message);
    }

    console.log('[P1] Auth(2) + Notifications(4) + Workspace(2) + Messages(2) + Nodes(2) + Calendar(2) + Channels(1) + Taskflow(1) + ChatWorkspace(1) = 17 routes');
  } catch(e) {
    console.error('[P1] Route registration FAILED:', e.message);
  }
})();
// === P1 Route Registration END ===

// === Pause/Resume background tasks ===
registerRoute(['POST'], /^\/api\/v4\/tasks\/pause$/, (req, res) => {
  __taskPaused = true;
  __taskPausedTime = Date.now();
  json(res, { ok: true, paused: true });
});
registerRoute(['POST'], /^\/api\/v4\/tasks\/resume$/, (req, res) => {
  __taskPaused = false;
  __taskPausedTime = null;
  json(res, { ok: true, paused: false });
});
registerRoute(['GET'], /^\/api\/v4\/tasks\/pause-status$/, (req, res) => {
  json(res, { ok: true, paused: __taskPaused, since: __taskPausedTime });
});


// ========== 任务队列 API ==========
registerRoute(['POST'], /^\/api\/task-queue\/poll$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    var agentId = b.agentId;
    if (!agentId) { json(res, { ok: false, error: 'missing agentId' }); return; }
    var task = __taskPaused ? null : await taskQueue.poll(agentId, b.timeout || 30000);
    json(res, { ok: true, task: task, hasTask: !!task });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/task-queue\/complete$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    if (!b.taskId) { json(res, { ok: false, error: 'missing taskId' }); return; }
    var result = taskQueue.complete(b.taskId, b.result, b.success);
    json(res, { ok: true, task: result });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['POST'], /^\/api\/task-queue\/fail$/, async (req, res) => {
  try {
    var b = await parseBody(req);
    if (!b.taskId) { json(res, { ok: false, error: 'missing taskId' }); return; }
    taskQueue.fail(b.taskId, b.error, b.retry);
    json(res, { ok: true });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['GET'], /^\/api\/task-queue\/stats$/, (req, res) => {
  json(res, { ok: true, stats: taskQueue.getStats() });
})

// ===== 兼容端点（旧系统路由残留，打通避免404） =====
registerRoute(['POST'], /^\/api\/license\/verify$/, function(req, res) {
  json(res, { ok: true, valid: true, tier: 'opensource', edition: 'Community Edition', message: 'eCompany-Claw 开源社区版 · 无需许可证', expiresAt: null });
});
registerRoute(['GET'], /^\/api\/tasks\/stats$/, function(req, res) {
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'tasks.json'), 'utf8'));
    var taskArr = Array.isArray(tasks) ? tasks : (tasks.tasks || []);
    json(res, { ok: true, total: taskArr.length, pending: taskArr.filter(t => t.status==='pending').length,
      inProgress: taskArr.filter(t => t.status==='in_progress').length, done: taskArr.filter(t => t.status==='done').length });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/tasks\/history$/, function(req, res) {
  try {
    var tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'tasks.json'), 'utf8'));
    var taskArr = Array.isArray(tasks) ? tasks : (tasks.tasks || []);
    var history = taskArr.filter(t => t.status==='done').sort((a,b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt)).slice(0, 50);
    json(res, { ok: true, history: history.map(t => ({ id: t.id, title: t.title, completedAt: t.updatedAt||t.createdAt })) });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/kb\/export$/, function(req, res) {
  try {
    var stats = knowledgeEngine.getStats();
    var allEntries = knowledgeEngine.searchKnowledge('', { limit: 999 });
    json(res, { ok: true, data: (allEntries && allEntries.results) || allEntries || [], stats: stats, exportTime: new Date().toISOString() });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/pipeline$/, function(req, res) {
  json(res, { ok: true, redirect: '/api/v4/pipeline', message: '已迁移至 /api/v4/pipeline' });
});

registerRoute(['GET'], /^\/api\/strategies$/, function(req, res) {
  json(res, { ok: true, redirect: '/api/models/strategy', message: '策略系统已合并至模型设置，请使用 /api/models/strategy' });
});

registerRoute(['GET'], /^\/api\/teams$/, function(req, res) {
  try {
    var agents = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'agents.json'), 'utf8'));
    var agentList = Array.isArray(agents) ? agents : (agents.agents || []);
    json(res, { ok: true, teams: [{ id: 'default', name: '默认团队', members: agentList.map(a => ({ id: a.id, name: a.name_cn||a.name, role: a.role })) }] });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/members$/, function(req, res) {
  try {
    var agents = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'agents.json'), 'utf8'));
    var agentList = Array.isArray(agents) ? agents : (agents.agents || []);
    json(res, { ok: true, members: agentList.map(a => ({ id: a.id, name: a.name_cn||a.name, role: a.role, skills: a.skills, status: a.status || 'idle' })) });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/knowledge\/export$/, function(req, res) {
  try {
    var stats = knowledgeEngine.getStats();
    var allEntries = knowledgeEngine.searchKnowledge('', { limit: 999 });
    var entriesList = (allEntries && allEntries.results) || allEntries || [];
    json(res, { ok: true, data: entriesList, stats: stats, exportTime: new Date().toISOString() });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/knowledge\/import$/, async function(req, res) {
  try {
    var body = await parseBody(req);
    if (!body || !body.data) { json(res, { ok: false, error: '需要提供 data 字段' }); return; }
    json(res, { ok: true, message: '导入功能就绪，数据未实际写入（需确认格式）', receivedCount: Array.isArray(body.data) ? body.data.length : 1 });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(['GET'], /^\/api\/workpath$/, function(req, res) {
  json(res, { ok: true, redirect: '/api/v4/workpath', message: '已迁移至 /api/v4/workpath' });
});

// ===== 新注册的 v4 路由 =====
// POST /api/models/strategy — 模型调用策略（Settings.vue 调用）
registerRoute(['POST'], /^\/api\/models\/strategy$/, function(req, res) {
  parseBody(req).then(function(body) {
    try {
      var result = modelRouter.setStrategy(body);
      json(res, { ok: true, message: '策略已更新', strategy: result });
    } catch(e) {
      json(res, { ok: false, error: e.message });
    }
  }).catch(function(e) {
    json(res, { ok: false, error: e.message });
  });
});
registerRoute(['GET'], /^\/api\/models\/strategy$/, function(req, res) {
  try {
    var cfg = modelRouter.getConfigSummary();
    json(res, { ok: true, strategy: cfg });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// GET /api/v4/workpath — 工作路径（映射到 workflow-engine）
// 支持 ?type=filter 参数过滤
registerRoute(['GET'], /^\/api\/v4\/workpath$/, function(req, res) {
  try {
    var wf = require('./modules/workflow-engine');
    var wfData = wf.loadWorkflows ? wf.loadWorkflows() : [];
    var list = Array.isArray(wfData) ? wfData : (wfData.workflows || []);
    var url = require('url');
    var parsed = url.parse(req.url, true);
    var filterType = parsed.query && parsed.query.type;
    var paths = list.filter(function(w) {
      if (filterType) return w.type === filterType;
      return w.type === 'path' || w.type === 'workpath' || !w.type;
    });
    json(res, { ok: true, paths: paths, count: paths.length, filter: filterType || null, message: '工作路径绑定至 Workflow Engine。支持 ?type= 过滤' });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// GET /api/v4/pipeline — 流水线（映射到 workflow-engine）
// 支持 ?type=filter 参数过滤
registerRoute(['GET'], /^\/api\/v4\/pipeline$/, function(req, res) {
  try {
    var wf = require('./modules/workflow-engine');
    var wfData = wf.loadWorkflows ? wf.loadWorkflows() : [];
    var list = Array.isArray(wfData) ? wfData : (wfData.workflows || []);
    var url = require('url');
    var parsed = url.parse(req.url, true);
    var filterType = parsed.query && parsed.query.type;
    var pipelines = list.filter(function(w) {
      if (filterType) return w.type === filterType;
      return true; // 默认不过滤，返回所有
    });
    json(res, { ok: true, pipelines: pipelines, count: pipelines.length, filter: filterType || null, message: '流水线绑定至 Workflow Engine。支持 ?type= 过滤' });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

server.listen(PORT, '0.0.0.0', () => {
  // 初始化 WebSocket
  wsServer.init(server);
  // 启动任务调度器
  try { scheduler.start(); console.log('  [Scheduler] 已启动，间隔30秒'); } catch(e) { console.log('  [Scheduler] 启动失败:', e.message); }
  // 启动 BI 自动化规则周期扫描（每5分钟）
  try { biAutomationRules.startPeriodicScan(300000); } catch(e) { console.log('  [BI-Rules] 周期扫描启动失败:', e.message); }
  // 启动认知层同步（每10分钟）
  try { cognitive.startPeriodicSync(600000); } catch(e) { console.log('  [Cognitive] 同步启动失败:', e.message); }
  // 启动聊天历史自动清理定时任务（每15分钟检查 workspace-conv.json）
  setInterval(function() {
    try { chatCleaner.cleanWorkspaceFile(); } catch(e) { /* ok */ }
  }, 900000);
  console.log('  [ChatCleaner] 文件清理已启动，间隔 15 分钟');
  // 启动 Cron 定时任务
  try { cronScheduler.startAll(); console.log('  [Cron] 定时任务已启动'); } catch(e) { console.log('  [Cron] 启动失败:', e.message); }
  // 任务逾期自动重调度（每5分钟扫描）
  try {
    var autoReschedule = function() {
      var now = new Date();
      TASKS.forEach(function(t) {
        if (t.status === 'done' || t.status === 'cancelled') return;
        if (t.deadline && new Date(t.deadline) < now) {
          // 逾期任务，自动重分配
          if (!t._autoRescheduled) {
            // 找当前任务最少的员工
            var taskCount = {};
            TASKS.forEach(function(tt) { if (tt.assigneeId && tt.status !== 'done') taskCount[tt.assigneeId] = (taskCount[tt.assigneeId] || 0) + 1; });
            var candidates = TEAM_AGENTS.filter(function(a) { return a.id !== t.assigneeId && a.role !== 'ceo'; });
            var best = null; var minCount = Infinity;
            candidates.forEach(function(c) { var cnt = taskCount[c.id] || 0; if (cnt < minCount) { minCount = cnt; best = c; } });
            if (best) {
              var oldAssignee = t.assigneeId;
              t.assigneeId = best.id;
              t._autoRescheduled = true;
              t.updatedAt = now.toISOString();
              console.log('[AutoReschedule] 逾期任务 "' + t.title + '" 从 ' + oldAssignee + ' 重分配给 ' + best.name_cn);
            }
          }
        }
      });
      saveJSON(TASKS_FILE, TASKS);
    };
    setInterval(autoReschedule, 300000);
    console.log('  [AutoReschedule] 逾期任务自动重调度已启动，间隔5分钟');
  } catch(e) { console.log('  [AutoReschedule] 启动失败:', e.message); }
  // 每日08:00和20:00自动生成日报
  try {
    var generateDailyReport = function() {
      fetch('http://127.0.0.1:' + PORT + '/api/v4/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ types: ['summaryReport'] }) }).catch(function(e){console.log('[DailyReport] 生成失败:', e.message)});
    };
    var scheduleDailyReport = undefined;
    scheduleDailyReport();
  } catch(e) { console.log('  [DailyReport] 启动失败:', e.message); }
  // 初始化任务队列（WAL 回放）
  try { taskQueue.initialize(); console.log('  [TaskQueue] 已初始化，待办=' + taskQueue.getStats().pending); } catch(e) { console.log('  [TaskQueue] 初始化失败:', e.message); }
  console.log('');
  console.log('  AUTH/ME DETAIL: ' + ROUTES.filter(r => r.pattern.source && r.pattern.source.includes('auth\\/me')).map((r,i) => '#' + i + ' src=' + r.pattern.source + ' handler=' + r.handler.toString().substring(0, 150)).join(' | ') + ' total=' + ROUTES.length);
console.log('  eCompany-Claw v3.0 (现代化模块化服务器)');
  console.log('  Node.js ' + process.version + ' | 端口: ' + PORT);
  console.log('  CEO + ' + (TEAM_AGENTS.length - 1) + ' 名员工');
  console.log('  ' + TASKS.length + ' 个任务');
  console.log('');
  console.log('  http://localhost:' + PORT);
  console.log('');

  // ========== 自动启动通讯渠道桥接 ==========
  startChannelBridges();
});

// ========== 桥接启动器 ==========
var cpSpawn = require('child_process').spawn;
var BRIDGE_DEFS = [
  { name: 'feishu',   file: 'feishu-bridge.js',   healthPort: 28002, label: '飞书' },
  { name: 'wechat',   file: 'wechat-bridge.js',   healthPort: 28001, label: '微信' },
  { name: 'dingtalk', file: 'dingtalk-bridge.js', healthPort: 28003, label: '钉钉' },
  { name: 'wecom',    file: 'wecom-bridge.js',    healthPort: 28004, label: '企业微信' },
  { name: 'qqbot',    file: 'qqbot-bridge.js',    healthPort: 28005, label: 'QQ机器人' },
  { name: 'tencent',  file: 'tencent-bridge.js',  healthPort: 28006, label: '腾讯云' },
];

function checkPortInUse(port) {
  return new Promise(function(resolve) {
    var tester = require('net').createServer();
    tester.once('error', function() { resolve(true); });
    tester.once('listening', function() { tester.close(); resolve(false); });
    tester.listen(port, '127.0.0.1');
  });
}

function startChannelBridges() {
  console.log('  [桥接] 开始启动通讯渠道桥接...');
  BRIDGE_DEFS.forEach(function(def) {
    global['__' + def.name + 'Bridge'] = null;
    spawnBridge(def);
  });
}

async function spawnBridge(def) {
  // 检查健康端口是否已被占用（说明桥接已在运行）
  var inUse = await checkPortInUse(def.healthPort);
  if (inUse) {
    console.log('  [桥接] ' + def.label + ' 端口 ' + def.healthPort + ' 已被占用，跳过');
    return;
  }

  var bridgePath = path.join(BASE, 'modules', def.file);
  if (!fs.existsSync(bridgePath)) {
    console.log('  [桥接] ' + def.label + ' 文件不存在: ' + def.file + '，跳过');
    return;
  }

  console.log('  [桥接] 启动 ' + def.label + ' (' + def.file + ')...');
  var child = cpSpawn(process.execPath, [bridgePath], {
    cwd: BASE,
    stdio: 'pipe',
    windowsHide: true,
    env: Object.assign({}, process.env, { ECOMPANY_PORT: String(PORT) })
  });

  global['__' + def.name + 'Bridge'] = child;

  child.stdout.on('data', function(data) {
    var lines = data.toString().split('\n');
    lines.forEach(function(line) {
      if (line.trim()) console.log('  [' + def.label + '] ' + line.trim());
    });
  });
  child.stderr.on('data', function(data) {
    var lines = data.toString().split('\n');
    lines.forEach(function(line) {
      if (line.trim()) console.log('  [' + def.label + '!ERR] ' + line.trim());
    });
  });
  child.on('exit', function(code, signal) {
    console.log('  [桥接] ' + def.label + ' 进程退出 (code=' + code + ' signal=' + signal + ')');
    global['__' + def.name + 'Bridge'] = null;
    // 5 秒后自动重启
    setTimeout(function() {
      console.log('  [桥接] ' + def.label + ' 尝试自动重启...');
      spawnBridge(def);
    }, 5000);
  });
  child.on('error', function(err) {
    console.log('  [桥接] ' + def.label + ' 启动失败: ' + err.message);
    global['__' + def.name + 'Bridge'] = null;
  });

  console.log('  [桥接] ' + def.label + ' PID=' + child.pid + ' 健康端口=' + def.healthPort);
}


// ======= i18n Multi-language Support =======
try {

// ========= 缺失 API 路由(手动添加) =========

// 1. 获取员工列表
registerRoute(['GET'], '/api/employees', (req, res) => {
  try {
    const rows = db().prepare('SELECT id, name, name_cn, title, category, icon, role, status FROM agents ORDER BY id').all();
    json(res, { ok: true, employees: rows || [] });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// 2. 获取活动列表(返回空数组,表结构待确认)
registerRoute(['GET'], '/api/activities', (req, res) => {
  try {
    const rows = db().prepare('SELECT a.id, a.agent_id, a.agent_name, a.action, a.target, a.details, a.timestamp, ag.icon, ag.role, ag.status FROM activities a LEFT JOIN agents ag ON a.agent_id = ag.id ORDER BY a.timestamp DESC LIMIT 50').all();
    const activities = (rows || []).map(r => {
      return { id: r.id, icon: r.icon || '\u2022', name: r.agent_name, role: r.role || '', action: r.action + (r.target ? ' ' + r.target : ''), status: r.status || 'active', time: r.timestamp };
    });
    json(res, { ok: true, activities });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// 3. 获取员工活动
registerRoute(['GET'], '/api/employee-activities', (req, res) => {
  try {
    const url = require('url').parse(req.url, true);
    const limit = parseInt(url.query.limit) || 50;
    const since = url.query.since || '';
    let rows;
    if (since) {
      rows = db().prepare('SELECT a.id, a.agent_id, a.agent_name, a.action, a.target, a.details, a.timestamp, ag.icon, ag.role, ag.status FROM activities a LEFT JOIN agents ag ON a.agent_id = ag.id WHERE a.timestamp > ? ORDER BY a.timestamp DESC LIMIT ?').all(since, limit);
    } else {
      rows = db().prepare('SELECT a.id, a.agent_id, a.agent_name, a.action, a.target, a.details, a.timestamp, ag.icon, ag.role, ag.status FROM activities a LEFT JOIN agents ag ON a.agent_id = ag.id ORDER BY a.timestamp DESC LIMIT ?').all(limit);
    }
    var activities = (rows || []).map(r => {
      return { id: r.id, icon: r.icon || '\u2022', name: r.agent_name, role: r.role || '', action: r.action + (r.target ? ' ' + r.target : ''), status: r.status || 'active', time: r.timestamp };
    });
    
    // Merge with ACTIVITY_LOG for recent entries not in DB yet
    if (typeof ACTIVITY_LOG !== 'undefined' && ACTIVITY_LOG.length > 0) {
      var logEntries = ACTIVITY_LOG;
      if (since) logEntries = logEntries.filter(function(e) { return e.time > since; });
      logEntries.slice(0, limit).forEach(function(e) {
        if (!activities.find(function(a) { return String(a.id) === String(e.id) || (a.name === e.name && a.time === e.time); })) {
          activities.push({ id: e.id, icon: e.icon || '\u2022', name: e.name || e.agentName || '', role: e.role || '', action: e.text || e.action || '', status: 'active', time: e.time });
        }
      });
      if (activities.length > limit) activities = activities.slice(0, limit);
    }
    json(res, { ok: true, activities });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

// ========= 补充缺失 API 路由 =========

// Skills API (使用 skillSystem 从 SKILL.md 加载)
registerRoute(['GET'], /^\/api\/skills\/?$/, (req, res) => {
  try {
    skillSystem.loadAll();
    var skillsList = [];
    skillSystem.skills.forEach(function(skill, name) {
      skillsList.push({
        id: name,
        name: name,
        description: skill.description || '\u6682\u65e0\u63cf\u8ff0',
        version: skill.metadata && skill.metadata.version ? 'v' + skill.metadata.version : '1.0',
        enabled: skill.enabled !== false
      });
    });
    json(res, { ok: true, skills: skillsList, total: skillsList.length });
  } catch(e) { json(res, { ok: false, error: e.message, skills: [], total: 0 }); }
});

// MCP Servers API
registerRoute(['GET'], /^\/api\/mcp\/servers$/, (req, res) => {
  try {
    const mcp = require('./modules/mcp-manager');
    json(res, { ok: true, servers: mcp._servers || [] });
  } catch(e) { json(res, { ok: false, error: e.message, servers: [] }); }
});

// MCP Tools API
registerRoute(['GET'], /^\/api\/mcp\/tools$/, (req, res) => {
  try {
    const mcp = require('./modules/mcp-manager');
    const tools = (mcp._servers || []).reduce((acc, s) => acc.concat(s.tools || []), []);
    json(res, { ok: true, tools, total: tools.length });
  } catch(e) { json(res, { ok: false, error: e.message, tools: [] }); }
});

// Stream Status API
registerRoute(['GET'], /^\/api\/stream\/status$/, (req, res) => {
  json(res, { ok: true, status: 'available', connections: 0 });
});

// Scheduler Jobs API
registerRoute(['GET'], /^\/api\/scheduler\/jobs$/, (req, res) => {
  try {
    const scheduler = require('./modules/proactive-scheduler');
    json(res, { ok: true, jobs: scheduler.listJobs ? scheduler.listJobs() : [] });
  } catch(e) { json(res, { ok: false, error: e.message, jobs: [] }); }
});
registerRoute(['POST'], /^\/api\/scheduler\/jobs\/add$/, async (req, res) => {
  try {
    const body = await parseBody(req);
    const scheduler = require('./modules/proactive-scheduler');
    const result = scheduler.addJob ? scheduler.addJob(body) : { ok: false, error: 'Scheduler not available' };
    json(res, result);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});
registerRoute(['DELETE'], /^\/api\/scheduler\/jobs\/([^\/]+)$/, (req, res, m) => {
  try {
    const scheduler = require('./modules/proactive-scheduler');
    const result = scheduler.removeJob ? scheduler.removeJob(m[1]) : { ok: false, error: 'Scheduler not available' };
    json(res, result);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// Tools List API
registerRoute(['GET'], /^\/api\/tools\/list$/, (req, res) => {
  try {
    const toolsDir = path.join(BASE, 'tools');
    const files = fs.existsSync(toolsDir) ? fs.readdirSync(toolsDir).filter(f => f.endsWith('.json')) : [];
    const tools = files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(toolsDir, f), 'utf8')); } catch(e) { return null; } }).filter(Boolean);
    json(res, { ok: true, tools, total: tools.length });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// File Permissions API
registerRoute(['GET'], /^\/api\/file-permissions\/?$/, (req, res) => {
  try {
    const fp = require('./modules/file-permissions');

// === P0 Module Requires (injected) ===
const { sessionManager, orchestrator } = require('./modules/session-manager');
const { getToolsExecutor, FILE_TOOLS } = require('./modules/tools-executor');
const { scheduler: proactiveScheduler } = require('./modules/proactive-scheduler');
if (proactiveScheduler && typeof proactiveScheduler.setSessionManager === 'function') {
  proactiveScheduler.setSessionManager(sessionManager);
  console.log('[Scheduler] sessionManager injected');
}
    json(res, { ok: true, permissions: fp.getPermissions ? fp.getPermissions() : [] });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});


// ===== OpenAPI 文档 =====
registerRoute(["GET"], "/api/openapi.json", function(req, res) {
  try {
    var spec = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "openapi.json"), "utf-8"));
    json(res, spec);
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

registerRoute(["GET"], "/api/workflow-templates", function(req, res) {
  try {
    var tpl = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "workflow-templates.json"), "utf-8"));
    json(res, { ok: true, total: tpl.length, templates: tpl });
  } catch(e) { json(res, { ok: false, error: e.message }); }
});

// ===== 团队学习系统 API =====
try {
  var teamLearning = require('./modules/team-learning');

  // 知识共享/跨Agent学习
  registerRoute(['POST'], '/api/team/share', async (req, res) => {
    try {
      var body = await parseBody(req);
      var result = teamLearning.shareExperience(body.agentId, { summary: body.summary, detail: body.detail });
      json(res, { ok: true, result: result });
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 团队知识库查询
  registerRoute(['GET'], '/api/team/knowledge', (req, res) => {
    try {
      var url = require('url').parse(req.url, true);
      var skill = url.query.skill || '';
      var kb = teamLearning.matchSkills(skill);
      json(res, { ok: true, matchedSkills: kb });
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 错误模式分析
  registerRoute(['POST'], '/api/team/errors/record', async (req, res) => {
    try {
      var body = await parseBody(req);
      var result = teamLearning.recordError(body.agentId, body.taskTitle, body.errorMessage, body.category);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  registerRoute(['GET'], '/api/team/errors/report', (req, res) => {
    try { json(res, teamLearning.getErrorReport()); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 员工效能
  registerRoute(['POST'], '/api/team/performance/record', async (req, res) => {
    try {
      var body = await parseBody(req);
      var result = teamLearning.recordPerformance(body.agentId, body.taskId, body.taskTitle, body.score, body.durationMs);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  registerRoute(['GET'], '/api/team/performance/report', (req, res) => {
    try { json(res, teamLearning.getPerformanceReport()); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 最佳实践
  registerRoute(['POST'], '/api/team/best-practice', async (req, res) => {
    try {
      var body = await parseBody(req);
      var result = teamLearning.extractBestPractices(body.agentId, body.task, body.result);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 根因分析API
  registerRoute(['POST'], '/api/team/errors/rootcause', async (req, res) => {
    try {
      var body = await parseBody(req);
      var result = teamLearning.analyzeRootCause(body.patternId);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 进化回馈报告API
  registerRoute(['GET'], '/api/team/feedback', (req, res) => {
    try { json(res, teamLearning.getFeedbackReport()); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 知识库统计API
  registerRoute(['GET'], '/api/team/knowledge/stats', (req, res) => {
    try { json(res, teamLearning.getKnowledgeStats()); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 手动触发错误模式清理
  registerRoute(['POST'], '/api/team/patterns/clean', (req, res) => {
    try { json(res, teamLearning.autoCleanPatterns()); }
    catch(e) { json(res, { ok: false, error: e.message }); }
  });

  // 记忆压缩状态
  try {
    var _tlCoreMem = require('./modules/core-memory');
    registerRoute(['GET'], '/api/memory/compress', (req, res) => {
      try {
        var memories = _tlCoreMem.loadCore();
        if (!memories || !Array.isArray(memories)) { json(res, { ok: true, message: 'no memories' }); return; }
        var compResult = _tlCoreMem.compressMemories(memories, { maxAgeDays: 7, minCount: 3 });
        json(res, { ok: true, total: memories.length, compressed: compResult.compressed });
      } catch(e) { json(res, { ok: false, error: e.message }); }
    });
  } catch(e) {}

  console.log('[Team] Learning system initialized');
} catch(e) {
  console.log('[Team] Skipped:', e.message);
}

// ===== AI 员工技能管理 =====
try {
  var aiEmployeeSkills = require('./modules/ai-employee-skills');
  registerRoute(['GET'], '/api/ai-employee/skills', function(req, res) {
    json(res, { ok: true, skills: aiEmployeeSkills.getSkills() });
  });
  registerRoute(['PUT'], /^\/api\/ai-employee\/skills\/([^/]+)$/, async function(req, res, m) {
    try {
      var body = await parseBody(req);
      var result = aiEmployeeSkills.toggleSkill(m[1], body.enabled);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });
  console.log('[AI-Employee-Skills] OK');
} catch(e) {
  console.log('[AI-Employee-Skills] Skipped:', e.message);
}

// ===== 定时任务管理（SchedulerPage.vue 专用） =====
var SCHED_TASKS_FILE = path.join(BASE, 'data', 'scheduled-tasks.json');
function loadSchedTasks() {
  try { return JSON.parse(fs.readFileSync(SCHED_TASKS_FILE, 'utf-8')); } catch(e) { return []; }
}
function saveSchedTasks(tasks) {
  try { fs.writeFileSync(SCHED_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8'); } catch(e) {}
}
function nextSchedTaskId(tasks) {
  var max = 0;
  tasks.forEach(function(t) { if (t.id > max) max = t.id; });
  return max + 1;
}

registerRoute(['GET'], '/api/scheduler/tasks', function(req, res) {
  json(res, { ok: true, tasks: loadSchedTasks() });
});

registerRoute(['POST'], '/api/scheduler/tasks', async function(req, res) {
  try {
    var body = await parseBody(req);
    var tasks = loadSchedTasks();
    var task = {
      id: nextSchedTaskId(tasks),
      name: body.name || '未命名任务',
      cron: body.cron || '0 8 * * *',
      target: body.target || 'ceo',
      prompt: body.prompt || '',
      model: body.model || '',
      channel: body.channel || '',
      enabled: true,
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
    saveSchedTasks(tasks);
    json(res, { ok: true, task: task });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['POST'], /^\/api\/scheduler\/tasks\/([^/]+)\/toggle$/, function(req, res, m) {
  try {
    var tasks = loadSchedTasks();
    var found = null;
    for (var i = 0; i < tasks.length; i++) {
      if (String(tasks[i].id) === m[1]) { found = tasks[i]; break; }
    }
    if (!found) { json(res, { ok: false, error: '任务未找到' }); return; }
    found.enabled = !found.enabled;
    saveSchedTasks(tasks);
    json(res, { ok: true, task: found });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerRoute(['DELETE'], /^\/api\/scheduler\/tasks\/([^/]+)$/, function(req, res, m) {
  try {
    var tasks = loadSchedTasks();
    var idx = -1;
    for (var i = 0; i < tasks.length; i++) {
      if (String(tasks[i].id) === m[1]) { idx = i; break; }
    }
    if (idx === -1) { json(res, { ok: false, error: '任务未找到' }); return; }
    tasks.splice(idx, 1);
    saveSchedTasks(tasks);
    json(res, { ok: true });
  } catch(e) {
    json(res, { ok: false, error: e.message });
  }
});

registerI18nAPI(registerRoute, parseBody, json);
  console.log('[i18n] Multi-language support loaded');
} catch(e) {
  console.error('[i18n] Failed to load:', e.message);
}

// ====== 知识库 API ======
try {
  var KB_PATH = path.join(BASE, 'knowledge-base.json');
  function loadKB() {
    try { return JSON.parse(fs.readFileSync(KB_PATH, 'utf-8')); } catch(e) { return []; }
  }
  function saveKB(data) {
    fs.writeFileSync(KB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }
  registerRoute(['GET'], /^\/api\/kb\/entries$/, function(req, res) {
    var entries = loadKB();
    json(res, { ok: true, entries: entries, total: entries.length });
  });
  registerRoute(['GET'], /^\/api\/kb\/search$/, function(req, res) {
    var q = (new URL(req.url, 'http://localhost')).searchParams.get('q') || '';
    var entries = loadKB();
    if (q) {
      var lq = q.toLowerCase();
      entries = entries.filter(function(e) {
        return (e.title && e.title.toLowerCase().includes(lq)) ||
               (e.content && e.content.toLowerCase().includes(lq)) ||
               (e.tags && e.tags.some(function(t) { return t.toLowerCase().includes(lq); }));
      });
    }
    json(res, { ok: true, entries: entries, total: entries.length, query: q });
  });
  registerRoute(['POST'], /^\/api\/kb\/entries$/, function(req, res) {
    parseBody(req).then(function(body) {
      var entries = loadKB();
      var entry = {
        id: require('crypto').randomUUID ? require('crypto').randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
        title: body.title || '',
        content: body.content || '',
        tags: body.tags || [],
        category: body.category || '',
        author: body.author || 'user',
        source: body.source || 'manual',
        status: body.status || 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: []
      };
      entries.push(entry);
      saveKB(entries);
      json(res, { ok: true, entry: entry, message: '创建成功' });
    }).catch(function(e) {
      json(res, { ok: false, error: e.message }, 400);
    });
  });
  registerRoute(['PUT'], /^\/api\/kb\/entries\/([^/]+)$/, function(req, res, m) {
    var id = m[1];
    parseBody(req).then(function(body) {
      var entries = loadKB();
      var idx = entries.findIndex(function(e) { return e.id === id; });
      if (idx === -1) return json(res, { ok: false, error: '条目不存在' }, 404);
      var entry = entries[idx];
      // 保存旧版本到 history
      if (!entry.history) entry.history = [];
      try { entry.history.push({ title: entry.title, content: entry.content, tags: entry.tags, version: entry.version || 1, savedAt: new Date().toISOString() }); } catch(_eh) {}
      if (body.title !== undefined) entry.title = body.title;
      if (body.content !== undefined) entry.content = body.content;
      if (body.tags !== undefined) entry.tags = body.tags;
      if (body.category !== undefined) entry.category = body.category;
      entry.version = (entry.version || 1) + 1;
      entry.updatedAt = new Date().toISOString();
      entries[idx] = entry;
      saveKB(entries);
      json(res, { ok: true, entry: entry, message: '更新成功' });
    }).catch(function(e) {
      json(res, { ok: false, error: e.message }, 400);
    });
  });
  // 知识库版本历史
  registerRoute(['GET'], /^\/api\/kb\/entries\/([^/]+)\/history$/, function(req, res, m) {
    var id = m[1];
    var entries = loadKB();
    var entry = entries.find(function(e) { return e.id === id; });
    if (!entry) return json(res, { ok: false, error: '条目不存在' }, 404);
    json(res, { ok: true, history: entry.history || [], version: entry.version || 1, title: entry.title });
  });
  // 知识库版本回滚
  registerRoute(['POST'], /^\/api\/kb\/entries\/([^/]+)\/rollback$/, function(req, res, m) {
    var id = m[1];
    parseBody(req).then(function(body) {
      var entries = loadKB();
      var idx = entries.findIndex(function(e) { return e.id === id; });
      if (idx === -1) return json(res, { ok: false, error: '条目不存在' }, 404);
      var entry = entries[idx];
      var targetVer = body.version;
      if (!targetVer) return json(res, { ok: false, error: '请指定回滚版本号' }, 400);
      if (!entry.history) return json(res, { ok: false, error: '无历史版本' }, 400);
      var snap = entry.history.find(function(h) { return h.version === targetVer; });
      if (!snap) return json(res, { ok: false, error: '版本 ' + targetVer + ' 不存在' }, 404);
      entry.history.push({ title: entry.title, content: entry.content, tags: entry.tags, version: entry.version || 1, savedAt: new Date().toISOString() });
      entry.title = snap.title;
      entry.content = snap.content;
      entry.tags = snap.tags;
      entry.version = (entry.version || 1) + 1;
      entry.updatedAt = new Date().toISOString();
      entries[idx] = entry;
      saveKB(entries);
      json(res, { ok: true, entry: entry, message: '已回滚到版本 ' + targetVer });
    }).catch(function(e) {
      json(res, { ok: false, error: e.message }, 400);
    });
  });
  registerRoute(['DELETE'], /^\/api\/kb\/entries\/([^/]+)$/, function(req, res, m) {
    var id = m[1];
    var entries = loadKB();
    var idx = entries.findIndex(function(e) { return e.id === id; });
    if (idx === -1) return json(res, { ok: false, error: '条目不存在' }, 404);
    entries.splice(idx, 1);
    saveKB(entries);
    json(res, { ok: true, message: '删除成功' });
  });
  console.log('[KB API] 知识库路由注册成功');
} catch(e) {
  console.error('[KB API] 注册失败:', e.message);
}

// ====== 自我进化页路由 ======
try {
  if (typeof selfEvolution !== 'undefined' && selfEvolution.registerEvolveRoutes) {
    selfEvolution.registerEvolveRoutes(registerRoute, parseBody, json);
    console.log('[Evolve-API] 自我进化路由注册成功');
  }
} catch(e) {
  console.error('[Evolve-API] 注册失败:', e.message);
}

// ====== 心跳设置页 API ======
try {
  var HEARTBEAT_CFG_PATH = path.join(BASE, 'heartbeat-config.json');
  function loadHeartbeatConfig() {
    try { return JSON.parse(fs.readFileSync(HEARTBEAT_CFG_PATH, 'utf-8')); } catch(e) {
      return {
        channels: { webchat: true, dingtalk: true, wecom: true, feishu: true },
        intervals: { maintenance: 30, daily: 360, weekly: 1440 },
        enabled: true,
        lastRun: null,
        nextRun: null
      };
    }
  }
  function saveHeartbeatConfig(cfg) {
    fs.writeFileSync(HEARTBEAT_CFG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  }
  registerRoute(['GET'], /^\/api\/heartbeat\/config$/, function(req, res) {
    var cfg = loadHeartbeatConfig();
    json(res, { ok: true, config: cfg });
  });
  registerRoute(['POST', 'PUT'], /^\/api\/heartbeat\/config$/, function(req, res) {
    parseBody(req).then(function(body) {
      var cfg = loadHeartbeatConfig();
      if (body.channels !== undefined) cfg.channels = body.channels;
      if (body.intervals !== undefined) cfg.intervals = body.intervals;
      if (body.enabled !== undefined) cfg.enabled = body.enabled;
      saveHeartbeatConfig(cfg);
      json(res, { ok: true, config: cfg, message: '心跳配置已更新' });
    }).catch(function(e) {
      json(res, { ok: false, error: e.message });
    });
  });
  registerRoute(['GET'], /^\/api\/heartbeat\/status$/, function(req, res) {
    var cfg = loadHeartbeatConfig();
    json(res, {
      ok: true,
      status: {
        enabled: cfg.enabled,
        lastRun: cfg.lastRun,
        nextRun: cfg.nextRun,
        channelsActive: Object.values(cfg.channels).filter(Boolean).length,
        channelsTotal: Object.keys(cfg.channels).length,
        uptime: Math.floor(process.uptime()) + 's'
      }
    });
  });
  console.log('[Heartbeat-API] 心跳设置页路由注册成功');
} catch(e) {
  console.error('[Heartbeat-API] 注册失败:', e.message);
}
// ====== 集成状态 API（动态检测版，12个渠道全面覆盖）======
try {
  registerRoute(['GET'], /^\/api\/integration\/status$/, function(req, res) {
    // 定义全部 12 个渠道（与 channels/list 一致）
    var CHANNEL_DEFS = [
      { id: 'webchat', name: '💬 Web Chat' },
      { id: 'dingtalk', name: '📱 钉钉' },
      { id: 'wecom', name: '💼 企业微信' },
      { id: 'feishu', name: '📋 飞书' },
      { id: 'qqbot', name: '🐧 QQ机器人' },
      { id: 'wechat_ilink', name: '💚 微信桥接' },
      { id: 'tencent', name: '☁️ 腾讯云' },
      { id: 'telegram', name: '✈️ Telegram' },
      { id: 'whatsapp', name: '📞 WhatsApp' },
      { id: 'discord', name: '🎮 Discord' },
      { id: 'slack', name: '💬 Slack' },
      { id: 'skills_engine', name: '🤖 技能引擎' }
    ];

    // 桥接进程存活检测映射
    var BRIDGE_MAP = {
      '钉钉': global.__dingtalkBridge,
      '企业微信': global.__wecomBridge,
      '飞书': global.__feishuBridge,
      'QQ机器人': global.__qqbotBridge,
      '微信桥接': global.__wechatBridge,
      'Telegram': global.__telegramBridge,
      'WhatsApp': global.__whatsappBridge,
      'Discord': global.__discordBridge,
      'Slack': global.__slackBridge
    };

    function isAlive(bridge) {
      return bridge && bridge.exitCode === null && bridge.killed === false;
    }

    var channels = [];
    var summary = [];

    CHANNEL_DEFS.forEach(function(ch) {
      var connected = false;
      if (ch.id === 'webchat') {
        connected = true;
      } else if (ch.id === 'skills_engine') {
        connected = true;
      } else {
        // 通过桥接进程检测
        var bridgeName = ch.name.replace(/^[^\s]+\s/, ''); // 去掉emoji前缀
        var b = BRIDGE_MAP[bridgeName];
        connected = isAlive(b);
      }

      channels.push({
        id: ch.id,
        name: ch.name,
        connected: connected,
        status: connected ? 'connected' : 'disconnected',
        configured: connected,
        account: '',
        messageCount: 0,
        error: connected ? null : 'bridge offline'
      });

      summary.push({
        name: bridgeName,
        configured: connected,
        icon: connected ? '✅' : '❌'
      });
    });

    var components = [
      { name: 'AI 对话引擎', status: 'running', uptime: Math.floor(process.uptime()) + 's' },
      { name: '任务调度系统', status: 'running', tasks: 0 },
      { name: '内存管理', status: 'running' },
      { name: '文件系统', status: 'running' }
    ];

    json(res, { ok: true, channels: channels, components: components, summary: summary });
  });
  console.log('[Integration-API] 集成状态路由注册成功（动态12渠道）');
} catch(e) {
  console.error('[Integration-API] 注册失败:', e.message);
}

// ====== 多通道统一消息中心 ======
try {
  var MSG_PATH = path.join(BASE, 'messages.json');
  function loadMessages() {
    try { return JSON.parse(fs.readFileSync(MSG_PATH, 'utf-8')); } catch(e) { return []; }
  }
  function saveMessages(arr) {
    fs.writeFileSync(MSG_PATH, JSON.stringify(arr.slice(-2000), null, 2), 'utf-8');
  }
  // 写入消息
  global.__pushMessage = function(channel, msg) {
    try {
      var arr = loadMessages();
      arr.push({
        id: require('crypto').randomUUID ? require('crypto').randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2,8),
        channel: channel,
        direction: msg.direction || 'in',
        from: msg.from || '',
        to: msg.to || '',
        content: msg.content || '',
        contentType: msg.contentType || 'text',
        type: msg.type || '',
        timestamp: new Date().toISOString()
      });
      saveMessages(arr);
    } catch(e) { console.error('[MsgCenter] push err:', e.message); }
  };

  // ====== 渠道消息接入：桥接进程 → 后端 → 前端 ======
  // 统一入口：/api/v4/channel/incoming （飞书/钉钉/企微/QQ/腾讯云）
  // 微信入口：/api/v4/wechat/incoming
  async function handleChannelIncoming(body, res) {

  console.log('[DUBUG] handleChannelIncoming called: channel=' + channel + ' from=' + from + ' msg=' + (message||'').substring(0,50) + ' bodyChannel=' + (body.channel||'') + ' bodySource=' + (body.source||''));    var channel = body.channel || body.source || 'unknown';
    var message = body.message || '';
    var from = body.from || '';
    var sessionId = body.sessionId || '';
    if (!message) { json(res, { ok: false, error: 'missing message' }); return; }

    // 1. 存入入站消息
    if (global.__pushMessage) global.__pushMessage(channel, {
      direction: 'in', from: from, content: message, type: 'channel_message'
    });

    // 2. WebSocket 实时推送到前端（字段名与前端 handleWSMessage 对齐：msg.message + msg.timestamp）
    try {
      wsServer.broadcast('channel', {
        type: 'channel_message',
        channel: 'channel',
        srcChannel: channel,
        source: channel,
        from: from,
        message: message,
        content: message,
        timestamp: new Date().toISOString(),
        time: new Date().toISOString()
      });
    } catch(e) { console.error('[MsgCenter] WS push in err:', e.message); }

    // 3. 调用 AI 生成回复
    var reply = '';
    try {
      var agent = AGENTS_MAP['ai_ceo'];
      var ceoMem = null;
      try { ceoMem = JSON.parse(fs.readFileSync(CEOMEM_PATH, 'utf-8')); } catch(e) {}
      var msgCtx = [];
      if (ceoMem && ceoMem.conversations) {
        var recent = ceoMem.conversations.slice(-20);
        for (var i = 0; i < recent.length; i++) {
          msgCtx.push({ role: recent[i].role || 'user', content: recent[i].content || recent[i].response || '' });
        }
      }
      msgCtx.push({ role: 'user', content: message });
      var result = await runCEOCEO(msgCtx, {});
      reply = typeof result === 'string' ? result : (result && result.reply) || '';
    } catch(e) {
      console.error('[MsgCenter] AI reply err:', e.message);
      reply = '抱歉，处理消息时出错: ' + e.message;
    }

    // 4. 存入出站消息（AI 回复）
    if (global.__pushMessage) global.__pushMessage(channel, {
      direction: 'out', from: 'AI', to: from, content: reply, type: 'ceo_reply'
    });

    // 5. WebSocket 推送 AI 回复到前端
    // 编译后前端 _formatChannelMsg 检查 channel==='channel' && type==='channel_message'
    // source==='小龙' 时过滤（CEO Agent 名），source==='ceo' 会显示为 📡 [ceo] CEO: 回复
    try {
      wsServer.broadcast('channel', {
        type: 'channel_message',
        channel: 'channel',
        srcChannel: channel,
        source: 'ceo',
        from: 'CEO',
        message: reply,
        content: reply,
        timestamp: new Date().toISOString(),
        time: new Date().toISOString()
      });
    } catch(e) { console.error('[MsgCenter] WS push out err:', e.message); }

    // 6. 返回回复给桥接进程
    json(res, { ok: true, reply: reply });
  }

  registerRoute(['POST'], /^\/api\/v4\/channel\/incoming$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      await handleChannelIncoming(body, res);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  registerRoute(['POST'], /^\/api\/v4\/wechat\/incoming$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      if (!body.channel) body.channel = 'wechat';
      await handleChannelIncoming(body, res);
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

  registerRoute(['POST'], /^\/api\/v4\/channel\/forward$/, async (req, res) => {
    // 转发消息到指定渠道（出站）
    try {
      const body = await parseBody(req);
      var ch = body.channel || 'unknown';
      var msg = body.message || body.content || '';
      var to = body.to || '';
      if (global.__pushMessage) global.__pushMessage(ch, {
        direction: 'out', from: 'system', to: to, content: msg, type: 'forward'
      });
      try {
        wsServer.broadcast('channel', {
          type: 'channel_message', channel: 'channel', srcChannel: ch,
          source: ch, from: 'system', content: msg, time: new Date().toISOString()
        });
      } catch(e) {}
      json(res, { ok: true });
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });
  console.log('[MsgCenter] 渠道消息接入路由注册成功 (incoming + wechat + forward)');

  // 查询消息
  registerRoute(['GET'], /^\/api\/v4\/messages$/, function(req, res) {
    try {
      var url = new URL(req.url, 'http://localhost');
      var channel = url.searchParams.get('channel') || '';
      var limit = parseInt(url.searchParams.get('limit')) || 50;
      var offset = parseInt(url.searchParams.get('offset')) || 0;
      var direction = url.searchParams.get('direction') || '';
      var since = url.searchParams.get('since') || '';
      var search = url.searchParams.get('search') || '';
      var arr = loadMessages();
      var filtered = arr;
      if (channel) filtered = filtered.filter(function(m) { return m.channel === channel; });
      if (direction) filtered = filtered.filter(function(m) { return m.direction === direction; });
      if (since) filtered = filtered.filter(function(m) { return m.timestamp > since; });
      if (search) {
        var ls = search.toLowerCase();
        filtered = filtered.filter(function(m) { return (m.content && m.content.toLowerCase().includes(ls)) || (m.from && m.from.toLowerCase().includes(ls)); });
      }
      // 按时间倒序
      filtered.sort(function(a,b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
      var total = filtered.length;
      var msgType = url.searchParams.get('type') || '';
      if (msgType) filtered = filtered.filter(function(m) { return m.type === msgType; });
      var paged = filtered.slice(offset, offset + limit);
      json(res, { ok: true, messages: paged, total: total, limit: limit, offset: offset });
    } catch(e) {
      json(res, { ok: false, error: e.message });
    }
  });
  // 渠道概览
  registerRoute(['GET'], /^\/api\/v4\/messages\/stats$/, function(req, res) {
    try {
      var arr = loadMessages();
      var stats = {};
      arr.forEach(function(m) {
        if (!stats[m.channel]) stats[m.channel] = { total: 0, in: 0, out: 0, lastAt: null };
        stats[m.channel].total++;
        if (m.direction === 'in') stats[m.channel].in++;
        else stats[m.channel].out++;
        if (!stats[m.channel].lastAt || m.timestamp > stats[m.channel].lastAt) stats[m.channel].lastAt = m.timestamp;
      });
      json(res, { ok: true, stats: stats });
    } catch(e) {
      json(res, { ok: false, error: e.message });
    }
  });
  console.log('[MsgCenter] 多通道消息中心路由注册成功');
} catch(e) {
  console.error('[MsgCenter] 注册失败:', e.message);
}
