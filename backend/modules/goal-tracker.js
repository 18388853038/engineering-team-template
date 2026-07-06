/**
 * eCompany Goal Tracker v1.0
 * 目标追踪与优先级评估系统
 *
 * 独立于 CEO 工具的优先级评估体系。
 * 支持：优先级矩阵评估、进度追踪、里程碑管理、依赖关系
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const TRACKER_FILE = path.join(BASE, 'goal-tracker.json');
const PRIORITY_CACHE_FILE = path.join(BASE, 'priority-cache.json');

// ========== 数据层 ==========

let trackerData = null;

function load() {
  if (trackerData) return trackerData;
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      trackerData = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
    }
  } catch(e) { /* ignore */ }
  if (!trackerData) {
    trackerData = { goals: {}, priorityHistory: [], lastUpdated: null };
    save();
  }
  return trackerData;
}

function save() {
  trackerData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(trackerData, null, 2));
}

function uuid() {
  return 'xxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========== 优先级矩阵引擎 ==========

/**
 * 优先级矩阵：基于 Urgency(时间紧迫度) × Importance(业务重要性)
 * 
 * urgency 因子：
 *   deadline 剩余时间比    0-40分
 *   依赖链风险             0-20分
 *   错失窗口成本           0-20分
 *   主管标记紧急           0-20分
 * 
 * importance 因子：
 *   业务影响范围           0-30分
 *   战略对齐度             0-25分
 *   收入/成本影响          0-25分
 *   风险等级               0-20分
 * 
 * 最终得分 = urgency * 0.5 + importance * 0.5  →  0-100
 * 等级：0-20 low, 21-50 medium, 51-75 high, 76-100 critical
 */

function calcPriority(goal) {
  const t = goal.tracking || {};
  const p = goal.priority || {};
  const now = Date.now();
  const created = new Date(goal.created_at || now).getTime();

  // --- Urgency (0-100) ---
  let urgency = 40; // baseline

  // 截止日期紧迫度
  if (goal.deadline) {
    const deadline = new Date(goal.deadline).getTime();
    const total = deadline - created;
    const remaining = deadline - now;
    if (remaining > 0 && total > 0) {
      const ratio = remaining / total;
      urgency += Math.round((1 - Math.min(ratio, 1)) * 30); // 越接近deadline分越高
    } else if (remaining <= 0) {
      urgency += 30; // 已过期
    }
    // 离deadline不到7天额外加分
    if (remaining > 0 && remaining < 7 * 86400000) {
      urgency += Math.round((1 - remaining / (7 * 86400000)) * 15);
    }
  }

  // 进度越高紧迫度越高 (接近完成时)
  const progress = p.progress || t.progress || 0;
  if (progress > 70) {
    urgency += Math.round((progress - 70) / 30 * 10);
  }

  // 手动紧急度标记
  if (p.urgency !== undefined) urgency += Math.round(p.urgency * 5); // 0-50

  // 依赖阻塞
  if (t.dependencies && t.dependencies.length > 0) {
    urgency += Math.min(t.dependencies.length * 5, 10);
  }

  // --- Importance (0-100) ---
  let importance = 40; // baseline

  if (p.importance !== undefined) importance += Math.round(p.importance * 5); // 0-50

  // 战略级加分
  if (goal.category === 'strategy' || goal.category === 'architecture') importance += 10;
  if (goal.category === 'operation') importance += 5;

  // 副作用影响
  if (t.dependents && t.dependents.length > 0) {
    importance += Math.min(t.dependents.length * 5, 10);
  }

  // 评分与等级
  const urgePct = Math.min(urgency, 100);
  const impPct = Math.min(importance, 100);
  const score = Math.round(urgePct * 0.5 + impPct * 0.5);
  let level;
  if (score >= 76) level = 'critical';
  else if (score >= 51) level = 'high';
  else if (score >= 21) level = 'medium';
  else level = 'low';

  return {
    score: Math.min(score, 100),
    level,
    urgency: urgePct,
    importance: impPct,
    computedAt: new Date().toISOString()
  };
}

function getQuadrant(urgency, importance) {
  // 四象限分类
  if (urgency >= 50 && importance >= 50) return 'Q1'; // 重要且紧急 → 立刻做
  if (importance >= 50 && urgency < 50) return 'Q2';  // 重要不紧急 → 计划做
  if (urgency >= 50 && importance < 50) return 'Q3';  // 紧急不重要 → 委托做
  return 'Q4'; // 不重要不紧急 → 减少做
}

// ========== 目标追踪 ==========

/**
 * 将 shared-memory 中的目标同步到 tracker，并补充优先级/进度数据
 */
function syncFromShared(sharedGoals) {
  load();
  const now = new Date().toISOString();
  let changed = false;

  (sharedGoals.current_goals || []).forEach(function(sg) {
    const id = sg.id;
    let tg = trackerData.goals[id];
    if (!tg) {
      // 新建追踪记录
      tg = {
        id,
        checkins: [],
        milestones: [],
        dependencies: [],
        dependents: [],
        priorityOverrides: null,
        category: 'general',
        tags: [],
        deadline: sg.deadline || null,
        createdAt: now
      };
      trackerData.goals[id] = tg;
      changed = true;
    }

    // 同步基础字段
    tg.title = sg.title;
    tg.description = sg.description || '';
    tg.status = sg.status;
    tg.assignee = sg.assignee || 'ai_ceo';
    tg.updatedAt = now;

    // 回写进度到 shared goal
    const p = tg.progress || 0;
    sg._progress = p;
    sg._priority = tg._lastPriority || calcPriority(tg);
  });

  // 清理已删除/完成的目标
  const activeIds = new Set((sharedGoals.current_goals || []).map(g => g.id));
  Object.keys(trackerData.goals).forEach(function(id) {
    if (!activeIds.has(id)) {
      // 归档到历史
      trackerData.priorityHistory.push({
        goal: trackerData.goals[id],
        archivedAt: now
      });
      delete trackerData.goals[id];
      changed = true;
    }
  });

  // 限制历史记录
  if (trackerData.priorityHistory.length > 200) {
    trackerData.priorityHistory = trackerData.priorityHistory.slice(-200);
  }

  if (changed) save();
  return trackerData.goals;
}

// ========== 优先级重算 ==========

function recalculateAll(sharedGoals) {
  load();
  syncFromShared(sharedGoals);
  const results = [];

  Object.keys(trackerData.goals).forEach(function(id) {
    const tg = trackerData.goals[id];
    const pr = tg.priorityOverrides
      ? { score: tg.priorityOverrides.score || 50, level: tg.priorityOverrides.level, urgency: 50, importance: 50, overridden: true }
      : calcPriority(tg);
    tg._lastPriority = pr;
    tg._lastQuadrant = getQuadrant(pr.urgency, pr.importance);
    results.push({ id, title: tg.title, priority: pr, quadrant: tg._lastQuadrant });
  });

  save();
  return { ok: true, evaluated: results.length, results };
}

function evaluateSingle(id, overrides) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;

  // 应用临时 overrides
  const testGoal = JSON.parse(JSON.stringify(tg));
  if (overrides) {
    if (!testGoal.priority) testGoal.priority = {};
    Object.assign(testGoal.priority, overrides);
  }

  const pr = calcPriority(testGoal);
  const quadrant = getQuadrant(pr.urgency, pr.importance);
  return {
    id,
    title: tg.title,
    priority: pr,
    quadrant,
    urgency: { score: pr.urgency, factors: { deadline: !!tg.deadline, progress: tg.progress || 0, dependencies: tg.dependencies?.length || 0 } },
    importance: { score: pr.importance, factors: { category: tg.category, dependents: tg.dependents?.length || 0 } }
  };
}

// ========== 进度与里程碑 ==========

function updateProgress(id, percent, note) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;

  if (!tg.checkins) tg.checkins = [];
  tg.checkins.push({
    ts: new Date().toISOString(),
    progress: percent,
    note: note || ''
  });
  if (tg.checkins.length > 50) tg.checkins = tg.checkins.slice(-50);

  tg.progress = Math.min(Math.max(percent, 0), 100);
  save();
  return tg;
}

function addMilestone(id, name) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  if (!tg.milestones) tg.milestones = [];
  const ms = { id: uuid(), name, done: false, addedAt: new Date().toISOString() };
  tg.milestones.push(ms);
  save();
  return ms;
}

function toggleMilestone(id, msId, done) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  const ms = (tg.milestones || []).find(m => m.id === msId);
  if (!ms) return null;
  ms.done = done !== false;
  ms.updatedAt = new Date().toISOString();
  // 自动算进度 = (完成的里程碑数 / 总数) * 100
  if (tg.milestones.length > 0) {
    const doneCount = tg.milestones.filter(m => m.done).length;
    tg.progress = Math.round(doneCount / tg.milestones.length * 100);
  }
  save();
  return { milestone: ms, progress: tg.progress };
}

function deleteMilestone(id, msId) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return false;
  const idx = (tg.milestones || []).findIndex(m => m.id === msId);
  if (idx === -1) return false;
  tg.milestones.splice(idx, 1);
  save();
  return true;
}

// ========== 依赖关系 ==========

function addDependency(id, dependsOnId, type) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  if (!tg.dependencies) tg.dependencies = [];
  if (tg.dependencies.find(d => d.id === dependsOnId)) return tg; // 已存在
  tg.dependencies.push({ id: dependsOnId, type: type || 'blocks', addedAt: new Date().toISOString() });
  save();
  // 反向记录
  const depTg = trackerData.goals[dependsOnId];
  if (depTg) {
    if (!depTg.dependents) depTg.dependents = [];
    if (!depTg.dependents.find(d => d.id === id)) {
      depTg.dependents.push({ id, type: type || 'blocks', addedAt: new Date().toISOString() });
      save();
    }
  }
  return tg;
}

function removeDependency(id, dependsOnId) {
  load();
  const tg = trackerData.goals[id];
  if (!tg || !tg.dependencies) return false;
  const idx = tg.dependencies.findIndex(d => d.id === dependsOnId);
  if (idx === -1) return false;
  tg.dependencies.splice(idx, 1);
  save();
  // 清理反向记录
  const depTg = trackerData.goals[dependsOnId];
  if (depTg && depTg.dependents) {
    const di = depTg.dependents.findIndex(d => d.id === id);
    if (di !== -1) depTg.dependents.splice(di, 1);
    save();
  }
  return true;
}

// ========== 手动设置优先级 ==========

function setPriorityOverride(id, score, level) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  tg.priorityOverrides = {
    score: Math.min(Math.max(score || 50, 0), 100),
    level: level || 'medium',
    setAt: new Date().toISOString()
  };
  save();
  return tg;
}

function clearPriorityOverride(id) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  tg.priorityOverrides = null;
  save();
  return tg;
}

// ========== 查询 ==========

function getTrackingView() {
  load();
  const items = [];
  Object.keys(trackerData.goals).forEach(function(id) {
    const tg = trackerData.goals[id];
    const pr = tg._lastPriority || calcPriority(tg);
    items.push({
      id,
      title: tg.title,
      status: tg.status,
      priority: pr,
      quadrant: getQuadrant(pr.urgency, pr.importance),
      progress: tg.progress || 0,
      milestones: (tg.milestones || []).length,
      milestonesDone: (tg.milestones || []).filter(m => m.done).length,
      dependencies: (tg.dependencies || []).length,
      dependents: (tg.dependents || []).length,
      checkins: (tg.checkins || []).length,
      lastCheckin: tg.checkins?.length > 0 ? tg.checkins[tg.checkins.length - 1].ts : null,
      deadline: tg.deadline,
      category: tg.category || 'general',
      priorityOverridden: !!tg.priorityOverrides,
      updatedAt: tg.updatedAt
    });
  });
  return {
    ok: true,
    total: items.length,
    items: items.sort(function(a, b) { return b.priority.score - a.priority.score; })
  };
}

function getGoalDetail(id) {
  load();
  const tg = trackerData.goals[id];
  if (!tg) return null;
  const pr = tg._lastPriority || calcPriority(tg);
  return {
    id,
    title: tg.title,
    status: tg.status,
    description: tg.description,
    priority: pr,
    quadrant: getQuadrant(pr.urgency, pr.importance),
    progress: tg.progress || 0,
    milestones: tg.milestones || [],
    dependencies: tg.dependencies || [],
    dependents: tg.dependents || [],
    checkins: tg.checkins || [],
    deadline: tg.deadline,
    category: tg.category || 'general',
    tags: tg.tags || [],
    priorityOverrides: tg.priorityOverrides,
    createdBy: tg.assignee
  };
}

function getPriorityStats() {
  load();
  const stats = { critical: 0, high: 0, medium: 0, low: 0, byQuadrant: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 } };
  Object.keys(trackerData.goals).forEach(function(id) {
    const tg = trackerData.goals[id];
    if (tg.status === 'completed' || tg.status === 'archived') return;
    const pr = tg._lastPriority || calcPriority(tg);
    if (stats[pr.level] !== undefined) stats[pr.level]++;
    const q = getQuadrant(pr.urgency, pr.importance);
    stats.byQuadrant[q]++;
  });
  return stats;
}

// ========== HTTP 路由注册 ==========

function registerGoalTrackerRoutes(registerRoute, parseBody, json) {
  // GET: 追踪视图（含优先级排序）
  registerRoute(['GET'], /^\/api\/goals\/tracking$/, function(req, res) {
    try {
      // 先同步 shared-memory
      var ctx = null;
      try { ctx = require('./shared-memory').getSharedContext(); } catch(e) {}
      if (ctx) syncFromShared(ctx);
      json(res, getTrackingView());
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // GET: 目标详情
  registerRoute(['GET'], /^\/api\/goals\/tracking\/([^/]+)$/, function(req, res, m) {
    try {
      var detail = getGoalDetail(m[1]);
      if (!detail) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, goal: detail });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 更新进度
  registerRoute(['POST'], /^\/api\/goals\/tracking\/([^/]+)\/progress$/, async function(req, res, m) {
    try {
      var b = await parseBody(req);
      var tg = updateProgress(m[1], b.percent, b.note || '');
      if (!tg) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, progress: tg.progress, checkins: tg.checkins?.slice(-1)[0] });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 添加里程碑
  registerRoute(['POST'], /^\/api\/goals\/tracking\/([^/]+)\/milestones$/, async function(req, res, m) {
    try {
      var b = await parseBody(req);
      if (!b.name) { json(res, { error: '缺少 name' }, 400); return; }
      var ms = addMilestone(m[1], b.name);
      if (!ms) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, milestone: ms });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // PATCH: 切换里程碑状态
  registerRoute(['PATCH'], /^\/api\/goals\/tracking\/([^/]+)\/milestones\/([^/]+)$/, async function(req, res, m) {
    try {
      var b = await parseBody(req);
      var result = toggleMilestone(m[1], m[2], b.done);
      if (!result) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // DELETE: 删除里程碑
  registerRoute(['DELETE'], /^\/api\/goals\/tracking\/([^/]+)\/milestones\/([^/]+)$/, function(req, res, m) {
    try {
      var ok = deleteMilestone(m[1], m[2]);
      json(res, { ok, message: ok ? '已删除' : '未找到' });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 添加依赖
  registerRoute(['POST'], /^\/api\/goals\/tracking\/([^/]+)\/dependencies$/, async function(req, res, m) {
    try {
      var b = await parseBody(req);
      if (!b.dependsOn) { json(res, { error: '缺少 dependsOn' }, 400); return; }
      var tg = addDependency(m[1], b.dependsOn, b.type);
      if (!tg) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, dependencies: tg.dependencies });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // DELETE: 删除依赖
  registerRoute(['DELETE'], /^\/api\/goals\/tracking\/([^/]+)\/dependencies\/([^/]+)$/, function(req, res, m) {
    try {
      var ok = removeDependency(m[1], m[2]);
      json(res, { ok, message: ok ? '已删除' : '未找到' });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 批量重算优先级
  registerRoute(['POST'], /^\/api\/goals\/priority\/recalc$/, async function(req, res) {
    try {
      var ctx = null;
      try { ctx = require('./shared-memory').getSharedContext(); } catch(e) {}
      if (!ctx) { json(res, { ok: false, error: '无法获取共享上下文' }, 500); return; }
      var result = recalculateAll(ctx);
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // GET: 评估单个优先级（支持模拟 override 参数）
  registerRoute(['GET'], /^\/api\/goals\/priority\/evaluate$/, async function(req, res) {
    try {
      var url = new URL(req.url, 'http://localhost');
      var id = url.searchParams.get('id');
      if (!id) { json(res, { error: '缺少 id 参数' }, 400); return; }
      var overrides = {};
      var u = url.searchParams.get('urgency');
      var i = url.searchParams.get('importance');
      if (u !== null) overrides.urgency = parseFloat(u);
      if (i !== null) overrides.importance = parseFloat(i);
      var result = evaluateSingle(id, Object.keys(overrides).length > 0 ? overrides : null);
      if (!result) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 手动设置优先级 override
  registerRoute(['POST'], /^\/api\/goals\/priority\/([^/]+)\/override$/, async function(req, res, m) {
    try {
      var b = await parseBody(req);
      var tg = setPriorityOverride(m[1], b.score, b.level);
      if (!tg) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, overrides: tg.priorityOverrides });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // DELETE: 清除 override
  registerRoute(['DELETE'], /^\/api\/goals\/priority\/([^/]+)\/override$/, function(req, res, m) {
    try {
      var tg = clearPriorityOverride(m[1]);
      if (!tg) { json(res, { error: '未找到' }, 404); return; }
      json(res, { ok: true, message: '已清除 override' });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // GET: 优先级统计
  registerRoute(['GET'], /^\/api\/goals\/priority\/stats$/, function(req, res) {
    try {
      var ctx = null;
      try { ctx = require('./shared-memory').getSharedContext(); } catch(e) {}
      if (ctx) syncFromShared(ctx);
      json(res, { ok: true, stats: getPriorityStats() });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // POST: 同步 shared-memory 目标
  registerRoute(['POST'], /^\/api\/goals\/tracking\/sync$/, async function(req, res) {
    try {
      var ctx = null;
      try { ctx = require('./shared-memory').getSharedContext(); } catch(e) {}
      if (!ctx) { json(res, { ok: false, error: '无法获取共享上下文' }, 500); return; }
      var synced = syncFromShared(ctx);
      var count = Object.keys(synced).length;
      json(res, { ok: true, synced: count, goals: synced });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

module.exports = {
  syncFromShared,
  recalculateAll,
  evaluateSingle,
  updateProgress,
  addMilestone,
  toggleMilestone,
  deleteMilestone,
  addDependency,
  removeDependency,
  setPriorityOverride,
  clearPriorityOverride,
  getTrackingView,
  getGoalDetail,
  getPriorityStats,
  registerGoalTrackerRoutes
};
