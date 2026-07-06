/**
 * team-memory.js — 团队共享记忆池 v1.0
 *
 * 三大板块：
 *   经验板块 (experience) — 完成任务的关键经验、技术决策、实现方案
 *   知识板块 (knowledge)  — 技术文档、架构设计、最佳实践
 *   避坑指南 (pitfall)    — 常见错误、踩坑记录、教训总结
 *
 * 集成到 agent-executor.js：
 *   - buildPrompt 时自动注入相关经验 → 员工A的经验员工B可以直接用
 *   - 任务完成后自动提取经验存入共享池
 *   - 员工可通过内置工具查询共享记忆
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const MEMORY_FILE = path.join(BASE, 'team-memory.json');
const LOG_FILE = path.join(BASE, 'logs', 'team-memory.log');

// 确保日志目录
const LOG_DIR = path.join(BASE, 'logs');
if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(e) {}
}

// ========== 数据加载/保存 ==========

function load() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.experiences) data.experiences = [];
      if (!data.knowledge) data.knowledge = [];
      if (!data.pitfalls) data.pitfalls = [];
      if (!data.meta) data.meta = { totalAccess: 0, lastSync: null };
      return data;
    }
  } catch(e) { /* 初始化新的 */ }
  return {
    experiences: [],   // 经验板块
    knowledge: [],     // 知识板块
    pitfalls: [],      // 避坑指南
    meta: { totalAccess: 0, lastSync: null, created: new Date().toISOString() }
  };
}

function save(data) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch(e) { return false; }
}

function uuid() {
  return 'tm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function log(action, detail) {
  try {
    const line = '[' + new Date().toISOString() + '] ' + action + ' | ' + JSON.stringify(detail).substring(0, 500) + '\n';
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch(e) {}
}

// ========== 技能匹配（文本 → 技能标签）==========

function matchSkills(text) {
  const matched = [];
  const patterns = [
    { re: /前端|vue|react|angular|html|css|javascript|ui|组件|页面|交互/i, tag: '前端开发' },
    { re: /后端|api|接口|rest|graphql|微服务|node|express|koa/i, tag: '后端开发' },
    { re: /数据库|sql|mysql|mongo|postgres|redis|数据仓库/i, tag: '数据库' },
    { re: /安全|漏洞|渗透|xss|csrf|sql注入|认证|授权|权限/i, tag: '安全' },
    { re: /架构|设计模式|微服务|分布式|高并发|集群/i, tag: '架构设计' },
    { re: /测试|qa|jest|mocha|自动化测试|单元测试|e2e/i, tag: '测试' },
    { re: /部署|docker|k8s|ci|cd|jenkins|流水线|nginx/i, tag: 'DevOps' },
    { re: /性能|优化|缓存|加载|响应|并发|吞吐/i, tag: '性能优化' },
    { re: /ai|大模型|llm|prompt|rag|agent|gpt/i, tag: 'AI' },
    { re: /移动|ios|android|flutter|react native/i, tag: '移动端' },
    { re: /文档|写作|手册|readme|api文档/i, tag: '文档' },
    { re: /配置|config|环境|变量|参数/i, tag: '配置' },
    { re: /文件|读写|路径|文件系统|fs/i, tag: '文件系统' },
    { re: /错误|异常|报错|崩溃|宕机|失败/i, tag: '错误处理' },
    { re: /进程|线程|并发|并行|锁|同步/i, tag: '并发' },
    { re: /网络|tcp|http|websocket|socket|连接/i, tag: '网络' },
    { re: /项目|管理|排期|进度|敏捷|scrum/i, tag: '项目管理' },
    { re: /数据分析|etl|报表|bi|可视化/i, tag: '数据' },
    { re: /合规|审计|法务|政策|条例/i, tag: '合规' },
  ];
  const lower = (text || '').toLowerCase();
  patterns.forEach(p => {
    if (p.re.test(lower) && !matched.includes(p.tag)) {
      matched.push(p.tag);
    }
  });
  return matched.length > 0 ? matched : ['通用'];
}

// ========== 1. 经验板块 ==========

/**
 * 添加一条经验记录
 * @param {Object} opts
 * @param {string} opts.title - 经验标题
 * @param {string} opts.content - 经验详情（含技术决策、实现方案）
 * @param {string} opts.agentId - 贡献者ID
 * @param {string} opts.agentName - 贡献者名称
 * @param {string} opts.taskTitle - 关联的任务标题
 * @param {string} opts.taskId - 关联的任务ID
 * @param {Array} opts.tags - 自定义标签
 * @returns {Object} 新增的经验条目
 */
function addExperience(opts) {
  const data = load();
  const tags = [...new Set([...(opts.tags || []), ...matchSkills(opts.title + ' ' + opts.content)])];
  
  // 去重检查
  const isDup = data.experiences.some(e => 
    e.taskId && opts.taskId && e.taskId === opts.taskId
  );
  if (isDup) return null; // 相同任务不重复记录

  const entry = {
    id: uuid(),
    type: 'experience',
    title: opts.title || '未命名经验',
    content: opts.content || '',
    tags: tags,
    agentId: opts.agentId || 'unknown',
    agentName: opts.agentName || 'Unknown',
    taskTitle: opts.taskTitle || '',
    taskId: opts.taskId || '',
    usedCount: 0,
    rating: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.experiences.push(entry);
  // 最多保留500条
  if (data.experiences.length > 500) data.experiences = data.experiences.slice(-500);
  data.meta.lastSync = new Date().toISOString();
  save(data);
  log('ADD_EXPERIENCE', { id: entry.id, title: entry.title, agent: opts.agentName });
  return entry;
}

/**
 * 查询经验
 */
function searchExperiences(query, tag, limit) {
  const data = load();
  let results = data.experiences;
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.content || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter(e => (e.tags || []).some(tg => tg.toLowerCase() === t));
  }
  results = results.sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0));
  const sliced = results.slice(0, limit || 10);
  // 增加访问计数
  sliced.forEach(e => { e.usedCount = (e.usedCount || 0) + 1; });
  data.meta.totalAccess = (data.meta.totalAccess || 0) + sliced.length;
  save(data);
  return sliced;
}

// ========== 2. 知识板块 ==========

/**
 * 添加一条知识条目
 * @param {Object} opts
 * @param {string} opts.title - 知识标题
 * @param {string} opts.content - 知识内容
 * @param {string} opts.category - 分类（如：架构/API/部署/配置）
 * @param {string} opts.author - 作者
 * @param {Array} opts.tags - 自定义标签
 * @returns {Object} 新增的知识条目
 */
function addKnowledge(opts) {
  const data = load();
  const tags = [...new Set([...(opts.tags || []), ...matchSkills(opts.title + ' ' + opts.content)])];

  const entry = {
    id: uuid(),
    type: 'knowledge',
    title: opts.title || '未命名知识',
    content: opts.content || '',
    category: opts.category || '未分类',
    tags: tags,
    author: opts.author || 'system',
    version: 1,
    usedCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: []
  };

  data.knowledge.push(entry);
  if (data.knowledge.length > 500) data.knowledge = data.knowledge.slice(-500);
  data.meta.lastSync = new Date().toISOString();
  save(data);
  log('ADD_KNOWLEDGE', { id: entry.id, title: entry.title, category: entry.category });
  return entry;
}

/**
 * 更新知识条目（带版本历史）
 */
function updateKnowledge(id, updates) {
  const data = load();
  const idx = data.knowledge.findIndex(e => e.id === id);
  if (idx === -1) return null;
  
  const entry = data.knowledge[idx];
  // 保存历史版本
  entry.history = entry.history || [];
  entry.history.push({
    title: entry.title, content: entry.content, tags: [...(entry.tags || [])],
    category: entry.category, version: entry.version, timestamp: entry.updatedAt
  });
  if (entry.history.length > 20) entry.history = entry.history.slice(-20);

  if (updates.title) entry.title = updates.title;
  if (updates.content) entry.content = updates.content;
  if (updates.tags) entry.tags = [...new Set(updates.tags)];
  if (updates.category) entry.category = updates.category;
  entry.version++;
  entry.updatedAt = new Date().toISOString();
  data.meta.lastSync = new Date().toISOString();
  save(data);
  return entry;
}

/**
 * 查询知识
 */
function searchKnowledge(query, category, tag, limit) {
  const data = load();
  let results = data.knowledge;
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.content || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (category) {
    results = results.filter(e => e.category === category);
  }
  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter(e => (e.tags || []).some(tg => tg.toLowerCase() === t));
  }
  results = results.sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0));
  const sliced = results.slice(0, limit || 10);
  sliced.forEach(e => { e.usedCount = (e.usedCount || 0) + 1; });
  data.meta.totalAccess = (data.meta.totalAccess || 0) + sliced.length;
  save(data);
  return sliced;
}

// ========== 3. 避坑指南 ==========

/**
 * 添加一条避坑指南
 * @param {Object} opts
 * @param {string} opts.title - 坑的标题（如：xx模块的路径不能含中文）
 * @param {string} opts.content - 详细描述：怎么踩的坑、原因、如何避免
 * @param {string} opts.severity - 严重程度: high/mid/low
 * @param {string} opts.reportedBy - 发现者
 * @param {string} opts.solution - 解决方案/避免方法
 * @param {Array} opts.tags - 相关标签
 * @returns {Object} 新增的避坑条目
 */
function addPitfall(opts) {
  const data = load();
  const tags = [...new Set(['避坑', ...(opts.tags || []), ...matchSkills(opts.title + ' ' + opts.content + ' ' + (opts.solution || ''))])];

  const entry = {
    id: uuid(),
    type: 'pitfall',
    title: opts.title || '未命名避坑',
    content: opts.content || '',
    solution: opts.solution || '',
    severity: opts.severity || 'mid',
    reportedBy: opts.reportedBy || 'anonymous',
    tags: tags,
    hitCount: 0,       // 被命中（预防）的次数
    preventCount: 0,   // 成功避免了多少次
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.pitfalls.push(entry);
  if (data.pitfalls.length > 300) data.pitfalls = data.pitfalls.slice(-300);
  data.meta.lastSync = new Date().toISOString();
  save(data);
  log('ADD_PITFALL', { id: entry.id, title: entry.title, severity: entry.severity, by: opts.reportedBy });
  return entry;
}

/**
 * 查询避坑指南（按严重度优先）
 */
function searchPitfalls(query, severity, tag, limit) {
  const data = load();
  let results = data.pitfalls;
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.content || '').toLowerCase().includes(q) ||
      (e.solution || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (severity) {
    results = results.filter(e => e.severity === severity);
  }
  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter(e => (e.tags || []).some(tg => tg.toLowerCase() === t));
  }
  // 排序：high > mid > low，再按命中次数
  const severityOrder = { high: 0, mid: 1, low: 2 };
  results = results.sort((a, b) => {
    const sa = severityOrder[a.severity] || 1;
    const sb = severityOrder[b.severity] || 1;
    if (sa !== sb) return sa - sb;
    return (b.hitCount || 0) - (a.hitCount || 0);
  });
  const sliced = results.slice(0, limit || 10);
  sliced.forEach(e => { e.hitCount = (e.hitCount || 0) + 1; });
  data.meta.totalAccess = (data.meta.totalAccess || 0) + sliced.length;
  save(data);
  return sliced;
}

/**
 * 记录避坑被预防成功
 */
function recordPrevent(pitfallId) {
  const data = load();
  const entry = data.pitfalls.find(e => e.id === pitfallId);
  if (!entry) return false;
  entry.preventCount = (entry.preventCount || 0) + 1;
  save(data);
  return true;
}

// ========== 4. 统一搜索（员工用）==========

/**
 * 根据任务描述或技能标签，从三大板块检索相关记忆
 * 用于注入到员工提示词中
 */
function queryRelevantMemory(taskDescription, skillTags, limit) {
  const data = load();
  const results = [];
  const query = (taskDescription || '') + ' ' + (skillTags || []).join(' ');

  // 从三个板块各取最相关的
  if (query) {
    const q = query.toLowerCase();
    
    // 经验
    data.experiences.forEach(e => {
      let score = 0;
      if ((e.title || '').toLowerCase().includes(q)) score += 5;
      if ((e.content || '').toLowerCase().includes(q)) score += 3;
      if ((e.tags || []).some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q))) score += 2;
      if (score > 0) results.push({ ...e, _score: score, _section: '经验' });
    });

    // 知识
    data.knowledge.forEach(e => {
      let score = 0;
      if ((e.title || '').toLowerCase().includes(q)) score += 5;
      if ((e.content || '').toLowerCase().includes(q)) score += 3;
      if ((e.tags || []).some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q))) score += 2;
      if (score > 0) results.push({ ...e, _score: score, _section: '知识' });
    });

    // 避坑指南（权重翻倍——防止再踩坑最重要）
    data.pitfalls.forEach(e => {
      let score = 0;
      if ((e.title || '').toLowerCase().includes(q)) score += 10;
      if ((e.content || '').toLowerCase().includes(q)) score += 6;
      if ((e.solution || '').toLowerCase().includes(q)) score += 4;
      if ((e.tags || []).some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q))) score += 4;
      if (score > 0) results.push({ ...e, _score: score, _section: '避坑' });
    });
  }

  // 如果没匹配到，直接取各板块的热门
  if (results.length === 0) {
    const topExp = data.experiences.sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0)).slice(0, 2);
    const topKnow = data.knowledge.sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0)).slice(0, 2);
    const topPit = data.pitfalls.sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0)).slice(0, 2);
    topExp.forEach(e => results.push({ ...e, _score: 1, _section: '经验' }));
    topKnow.forEach(e => results.push({ ...e, _score: 1, _section: '知识' }));
    topPit.forEach(e => results.push({ ...e, _score: 1, _section: '避坑' }));
  }

  // 按分数排序
  results.sort((a, b) => (b._score || 0) - (a._score || 0));
  
  // 去重（按id）
  const seen = new Set();
  const unique = [];
  results.forEach(r => {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      unique.push(r);
    }
  });

  const sliced = unique.slice(0, limit || 6);
  
  // 更新访问计数
  const data2 = load();
  sliced.forEach(r => {
    if (r.type === 'experience') {
      const e = data2.experiences.find(x => x.id === r.id);
      if (e) e.usedCount = (e.usedCount || 0) + 1;
    } else if (r.type === 'knowledge') {
      const e = data2.knowledge.find(x => x.id === r.id);
      if (e) e.usedCount = (e.usedCount || 0) + 1;
    } else if (r.type === 'pitfall') {
      const e = data2.pitfalls.find(x => x.id === r.id);
      if (e) e.hitCount = (e.hitCount || 0) + 1;
    }
  });
  data2.meta.totalAccess = (data2.meta.totalAccess || 0) + sliced.length;
  save(data2);

  return sliced;
}

// ========== 5. 构建注入提示词 ==========

/**
 * 构建员工提示词中的团队记忆上下文
 * 用于 buildPrompt 中注入
 */
function buildMemoryContext(agentSkills, taskContext) {
  const relevant = queryRelevantMemory(taskContext || '', agentSkills || [], 6);
  if (relevant.length === 0) return '';

  const parts = [];
  parts.push('\n## 📚 团队共享记忆 — 同事们积累的经验');
  parts.push('以下是和你当前任务相关的团队记忆，请参考：');
  parts.push('');

  // 避坑指南优先展示
  const pitfalls = relevant.filter(r => r.type === 'pitfall');
  const others = relevant.filter(r => r.type !== 'pitfall');

  if (pitfalls.length > 0) {
    parts.push('### ⚠️ 避坑指南（先看这个，避免重复踩坑）');
    pitfalls.forEach(p => {
      const severityLabel = { high: '🔴 高危', mid: '🟡 中危', low: '🟢 低危' };
      parts.push('- [' + (severityLabel[p.severity] || '⚠️') + '] ' + p.title);
      parts.push('  ' + (p.content || '').substring(0, 150));
      if (p.solution) parts.push('  ✅ 对策：' + p.solution.substring(0, 150));
    });
    parts.push('');
  }

  if (others.length > 0) {
    parts.push('### 💡 相关经验与知识');
    others.forEach(o => {
      const icon = o.type === 'experience' ? '🔧' : '📖';
      parts.push('- ' + icon + ' [' + (o._section || o.type) + '] ' + o.title);
      parts.push('  ' + (o.content || '').substring(0, 150));
    });
    parts.push('');
  }

  return parts.join('\n');
}

// ========== 6. 任务完成后自动提取经验 ==========

/**
 * 从任务完成结果中提取经验并存入共享池
 * 在 agent-executor 的 onTaskComplete 回调中调用
 */
function extractFromTaskCompletion(taskContext) {
  if (!taskContext || !taskContext.taskId) return null;

  const result = taskContext.result || '';
  const taskTitle = taskContext.taskTitle || '';
  const agentName = taskContext.agentName || '';
  const agentId = taskContext.agentId || '';

  // 如果结果太短（<50字）或者明显不是经验内容，跳过
  if (result.length < 50) return null;

  // 提取关键内容作为经验
  const contentPreview = result.substring(0, 1000);

  // 添加经验
  const exp = addExperience({
    title: '【' + agentName + '】' + taskTitle,
    content: contentPreview,
    agentId: agentId,
    agentName: agentName,
    taskTitle: taskTitle,
    taskId: taskContext.taskId,
    tags: matchSkills(taskTitle + ' ' + contentPreview)
  });

  // 检查结果中是否有"错误"/"注意"/"坑"/"不要"等关键词 → 同时存入避坑
  const lowerResult = (result + ' ' + taskTitle).toLowerCase();
  const dangerWords = ['错误', '注意', '坑', '不要', '避免', '失败', 'bug', '修复', '问题', '踩坑', '教训', '警告'];
  const hasDanger = dangerWords.some(w => lowerResult.includes(w));
  
  if (hasDanger) {
    // 提取作为避坑指南
    const lines = result.split('\n').filter(l => 
      dangerWords.some(w => l.toLowerCase().includes(w))
    );
    const dangerContent = lines.slice(0, 3).join('\n') || contentPreview.substring(0, 300);

    addPitfall({
      title: taskTitle + ' — 踩坑记录',
      content: dangerContent,
      solution: contentPreview.substring(0, 500),
      severity: 'mid',
      reportedBy: agentName,
      tags: matchSkills(taskTitle + ' ' + dangerContent)
    });
  }

  return exp;
}

// ========== 7. 内置工具定义（给AI员工用）==========

const TEAM_MEMORY_TOOLS = [
  {
    id: 'query_experience',
    name: 'query_experience',
    description: '查询团队经验库：搜索其他同事完成类似任务时的经验、技术决策和实现方案。可以用关键词或技能标签搜索。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如"数据库连接""API鉴权""文件写入"' },
        tag: { type: 'string', description: '按技能标签筛选：前端开发/后端开发/数据库/安全/架构设计/DevOps等' },
        limit: { type: 'number', description: '返回条数，默认5' }
      },
      required: []
    }
  },
  {
    id: 'query_knowledge',
    name: 'query_knowledge',
    description: '查询团队知识库：搜索技术文档、架构设计、最佳实践等知识条目。可以用关键词、分类或标签搜索。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        category: { type: 'string', description: '分类筛选：技术-API/技术-数据库/技术-前端/技术-后端/架构/部署/配置等' },
        limit: { type: 'number', description: '返回条数，默认5' }
      },
      required: []
    }
  },
  {
    id: 'query_pitfalls',
    name: 'query_pitfalls',
    description: '查询避坑指南：搜索团队踩过的坑、常见错误和教训总结。开始新任务前建议先查一下避坑指南。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如"路径""编码""超时""权限"' },
        severity: { type: 'string', description: '严重度筛选: high/mid/low' },
        limit: { type: 'number', description: '返回条数，默认5' }
      },
      required: []
    }
  },
  {
    id: 'add_pitfall',
    name: 'add_pitfall',
    description: '添加避坑指南：当你发现一个坑或教训时，记录下来供全体同事参考。填上踩坑详情和解决方案。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '坑的标题，简明扼要' },
        content: { type: 'string', description: '踩坑详情：发生了什么、根因是什么' },
        solution: { type: 'string', description: '解决方案/避免方法' },
        severity: { type: 'string', description: '严重度: high(导致宕机/数据丢失)/mid(功能异常)/low(体验问题)，默认mid' }
      },
      required: ['title', 'content', 'solution']
    }
  }
];

// ========== 执行团队记忆工具 ==========

async function executeTeamMemoryTool(funcName, funcArgs) {
  switch (funcName) {
    case 'query_experience': {
      const results = searchExperiences(funcArgs.query, funcArgs.tag, funcArgs.limit);
      return { success: true, total: results.length, results: results.map(r => ({
        id: r.id, title: r.title, content: r.content.substring(0, 300),
        tags: r.tags, agentName: r.agentName, usedCount: r.usedCount
      })) };
    }
    case 'query_knowledge': {
      const results = searchKnowledge(funcArgs.query, funcArgs.category, funcArgs.tag, funcArgs.limit);
      return { success: true, total: results.length, results: results.map(r => ({
        id: r.id, title: r.title, content: r.content.substring(0, 300),
        category: r.category, tags: r.tags, author: r.author, version: r.version
      })) };
    }
    case 'query_pitfalls': {
      const results = searchPitfalls(funcArgs.query, funcArgs.severity, funcArgs.tag, funcArgs.limit);
      return { success: true, total: results.length, results: results.map(r => ({
        id: r.id, title: r.title, content: r.content.substring(0, 300),
        solution: (r.solution || '').substring(0, 300),
        severity: r.severity, hitCount: r.hitCount, preventCount: r.preventCount
      })) };
    }
    case 'add_pitfall': {
      const entry = addPitfall({
        title: funcArgs.title,
        content: funcArgs.content,
        solution: funcArgs.solution,
        severity: funcArgs.severity || 'mid',
        reportedBy: funcArgs._agentName || 'anonymous',
        tags: funcArgs.tags
      });
      return { success: true, entry: { id: entry.id, title: entry.title, severity: entry.severity } };
    }
    default:
      return { success: false, message: '未知团队记忆工具: ' + funcName };
  }
}

// ========== 统计 ==========

function getStats() {
  const data = load();
  return {
    totalExperiences: data.experiences.length,
    totalKnowledge: data.knowledge.length,
    totalPitfalls: data.pitfalls.length,
    totalAccess: data.meta.totalAccess || 0,
    topExperienceTags: getTopTags(data.experiences),
    topKnowledgeTags: getTopTags(data.knowledge),
    topPitfallTags: getTopTags(data.pitfalls),
    highSeverityPitfalls: data.pitfalls.filter(p => p.severity === 'high').length
  };
}

function getTopTags(items) {
  const freq = {};
  items.forEach(e => (e.tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

// ========== 导出 ==========

module.exports = {
  // 三大板块操作
  addExperience,
  searchExperiences,
  addKnowledge,
  updateKnowledge,
  searchKnowledge,
  addPitfall,
  searchPitfalls,
  recordPrevent,

  // 统一查询
  queryRelevantMemory,
  buildMemoryContext,
  extractFromTaskCompletion,

  // 工具支持
  TEAM_MEMORY_TOOLS,
  executeTeamMemoryTool,

  // 统计
  getStats,
  matchSkills
};
