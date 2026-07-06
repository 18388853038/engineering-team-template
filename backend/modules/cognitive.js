/**
 * cognitive.js — eCompany 认知层核心
 * 
 * 职责：打通自我演化(self-evolution)、个体学习(auto-learning)、团队学习(team-learning)，
 * 形成真正的认知闭环。提供统一的路由、状态聚合、交叉调度。
 * 
 * 零内联：不修改现有 3 个模块的任何代码，仅通过 require 调用公开 API。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');

// ========== 引用现有模块（延迟 require，规避循环依赖） ==========

function getSE() {
  const sem = require('./self-evolution');
  // 保持单例
  if (!global.__seEngine) {
    global.__seEngine = new sem.SelfEvolutionEngine();
    // 恢复历史
    const histFile = require('path').join(__dirname, '..', 'evolution-history.json');
    if (require('fs').existsSync(histFile)) {
      try { global.__seEngine.loadHistory(); } catch(e) {}
    }
  }
  return global.__seEngine;
}
function getAL() { return require('./auto-learning'); }
function getTL() { return require('./team-learning'); }
function getBM() { return require('./shared-memory'); }

// ========== 持久化 ==========

const COGNITIVE_FILE = path.join(BASE, 'cognitive-state.json');

function loadState() {
  try { if (fs.existsSync(COGNITIVE_FILE)) return JSON.parse(fs.readFileSync(COGNITIVE_FILE, 'utf8')); } catch(e) {}
  return {
    lastSyncAt: null,
    crossLinks: [],         // 3个模块间的交叉引用记录
    findings: [],           // 认知层发现的趋势/洞察
    insightCount: 0,
    evolvedSkills: 0,
    createdAt: new Date().toISOString()
  };
}

function saveState(s) {
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(COGNITIVE_FILE, JSON.stringify(s, null, 2));
}

// ========== 认知闭合检查 ==========

/**
 * 检查三个模块之间的断裂点，返回需要修复的缺口列表
 */
function findCognitiveGaps() {
  const gaps = [];

  // 1. self-evolution → 团队学习断裂
  try {
    const se = getSE();
    if (se && se.cycleHistory) {
      const history = se.cycleHistory || [];
      const hasPatterns = history.some(c => (c.detected || []).some(d => d.type === 'recurring_error'));
      if (hasPatterns) {
        gaps.push({
          from: 'self-evolution',
          to: 'team-learning',
          type: 'pattern_not_synced',
          detail: 'self-evolution 检测到重复错误模式，但未同步到 team-learning 进行根因分析',
          severity: 'medium'
        });
      }
    }
  } catch(e) { /* ok */ }

  // 2. team-learning → 自动学习断裂
  try {
    const kb = loadJSON(path.join(BASE, 'knowledge-base.json'), []);
    const kbArr = Array.isArray(kb) ? kb : (kb.entries || []);
    if (kbArr.length > 5) {
      gaps.push({
        from: 'team-learning/auto-learning',
        to: 'cognitive-state',
        type: 'knowledge_unused',
        detail: `知识库有 ${kbArr.length} 条经验，但未被系统性地用于改善任务分配和优先级`,
        severity: 'low'
      });
    }
  } catch(e) { /* ok */ }

  // 3. BI 规则 → 认知层断裂
  try {
    const rulesFile = path.join(BASE, 'bi-rules.json');
    if (fs.existsSync(rulesFile)) {
      const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
      if (rules.activeRules && rules.activeRules.length > 0) {
        gaps.push({
          from: 'bi-automation-rules',
          to: 'cognitive',
          type: 'bi_not_aware',
          detail: `${rules.activeRules.length} 条 BI 规则处于活动状态，认知层未感知规则触发模式`,
          severity: 'medium'
        });
      }
    }
  } catch(e) { /* ok */ }

  return gaps;
}

// ========== 交叉调度 ==========

/**
 * 执行一次认知层同步：自动打通各模块
 */
async function runCognitiveSync() {
  const state = loadState();
  const gaps = findCognitiveGaps();
  const activities = [];

  // ===== 断裂点修复: self-evolution → team-learning =====
  try {
    const se = getSE();
    const tl = getTL();
    if (se && tl) {
      // 从 self-evolution 获取最近的 detected issues
      const history = se.cycleHistory || [];
      const recent = history.filter(c => {
        const t = new Date(c.completedAt || c.startedAt).getTime();
        return Date.now() - t < 86400000; // 24小时内
      });
      // 收集未被同步到 team-learning 的 detected 问题
      const unrecordedTypes = {};
      const errorsFile = path.join(BASE, 'team-errors.json');
      let existingPatterns = [];
      try { if (fs.existsSync(errorsFile)) {
        const ed = JSON.parse(fs.readFileSync(errorsFile, 'utf8'));
        existingPatterns = (ed.patterns || []).map(p => p.category);
      }} catch(e) {}

      recent.forEach(c => {
        (c.detected || []).forEach(d => {
          if (existingPatterns.indexOf(d.type) === -1 && !unrecordedTypes[d.type]) {
            unrecordedTypes[d.type] = { count: 1, example: d.detail || d.type, severity: d.severity || 'warning' };
          } else if (unrecordedTypes[d.type]) {
            unrecordedTypes[d.type].count++;
          }
        });
      });

      // 写入 team-learning 的错误系统
      const typeKeys = Object.keys(unrecordedTypes);
      typeKeys.forEach(type => {
        const info = unrecordedTypes[type];
        try {
          tl.recordError('cognitive_sync', type, info.example, type.slice(0, 20));
        } catch(e) { /* ok */ }
      });

      if (typeKeys.length > 0) {
        activities.push({
          module: 'self-evolution→team-learning',
          action: 'issues_synced',
          types: typeKeys,
          count: typeKeys.length
        });
      }

      // 对 active 错误模式执行根因分析 + 反馈到 BI 规则引擎
      try {
        const errorsReport = tl.getErrorReport();
        if (errorsReport && errorsReport.patterns) {
          (errorsReport.patterns || []).forEach(p => {
            if (p.status === 'active' || p.status === 'detected') {
              // 根因分析
              try { tl.analyzeRootCause(p.id); } catch(e) {}
              // 反馈到 BI 规则引擎
              try {
                const br = require('./bi-automation-rules');
                if (br && br.createRule) {
                  br.createRule({
                    name: 'cog_auto_' + (p.category || p.type || 'pattern') + '_' + Date.now().toString(36),
                    description: '认知层自动创建: ' + (p.detail || '重复错误模式').slice(0, 120),
                    enabled: true,
                    trigger: { type: 'error_rate', params: { threshold: (p.count || 1) > 3 ? 3 : 1 } },
                    condition: (p.count || 1) > 3 ? 'counter >= 3' : 'counter >= 1',
                    action: { type: 'notify', params: { message: '⚠️ [认知层] 自动告警: ' + (p.detail || '').slice(0, 80) } },
                    cooldownMs: 600000
                  });
                }
                // 也尝试 team-learning 自带的 feedbackToHarness
                try { tl.feedbackToHarness(p, null); } catch(e) {}
              } catch(e) {}
            }
          });
        }
      } catch(e) { /* ok */ }
    }
  } catch(e) { /* ok */ }

  // 3. 检查 auto-learning 的各 agent 技能进化
  try {
    const al = getAL();
    // 获取所有 agent 技能
    const agentsDir = path.join(BASE, 'memory');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('agent-') && f.endsWith('.json'));
      files.forEach(f => {
        const id = f.replace('agent-', '').replace('.json', '');
        try {
          const evo = al.getSkillEvolution(id);
          if (evo && evo.skills) {
            const skillCount = Object.keys(evo.skills).length;
            if (skillCount > 0) {
              activities.push({
                module: 'auto-learning',
                action: 'skills_checked',
                agentId: id,
                skills: skillCount
              });
            }
          }
        } catch(e) { /* ok */ }
      });
    }
  } catch(e) { /* ok */ }

  // 4. 生成认知洞察
  const insights = [];
  if (gaps.length > 0) {
    insights.push({
      type: 'cognitive_gap',
      detail: `发现 ${gaps.length} 个认知层断裂点`,
      gaps: gaps.map(g => `${g.from}→${g.to}: ${g.detail}`)
    });
  }

  if (activities.length > 0) {
    const agg = {};
    activities.forEach(a => { agg[a.module] = (agg[a.module] || 0) + 1; });
    insights.push({
      type: 'sync_result',
      detail: '认知层同步完成: ' + Object.entries(agg).map(([k,v]) => `${k}(${v})`).join(', ')
    });
  }

  // 5. 持久化（去重：相同type+detail的只保留最新一条）
  const newLinks = gaps.map(g => ({
    ...g,
    foundAt: new Date().toISOString()
  }));
  // 去重：对于每个新gap，如果crossLinks中已有相同type+detail的条目，替换它
  var deduped = state.crossLinks.slice(); // 复制
  newLinks.forEach(function(ng) {
    var idx = deduped.findIndex(function(ex) {
      return ex.type === ng.type && ex.detail === ng.detail;
    });
    if (idx >= 0) {
      deduped[idx] = ng; // 替换
    } else {
      deduped.unshift(ng); // 新增到头部
    }
  });
  state.crossLinks = deduped.slice(0, 100);
  if (insights.length > 0) {
      // 去重：相同type+detail的insight替换而非追加
  var insightObjs = insights.map(function(i) { return { ...i, id: ++state.insightCount, ts: new Date().toISOString() }; });
  var existingFindings = state.findings.slice();
  insightObjs.forEach(function(ins) {
    var idx = existingFindings.findIndex(function(ex) {
      return ex.type === ins.type && ex.detail === ins.detail;
    });
    if (idx >= 0) {
      existingFindings[idx] = ins; // 替换
    } else {
      existingFindings.unshift(ins); // 新增到头部
    }
  });
  state.findings = existingFindings.slice(0, 200);
  }
  state.lastSyncAt = new Date().toISOString();
  saveState(state);

  return {
    ok: true,
    gaps,
    activities,
    insights,
    crossLinkCount: state.crossLinks.length,
    totalFindings: state.findings.length
  };
}

// ========== 认知健康评分 ==========

function calcCognitiveHealth() {
  const state = loadState();
  let score = 100;
  const details = [];

  // 1. 断裂点扣分
  const gapPenalty = state.crossLinks.filter(l => l.foundAt && Date.now() - new Date(l.foundAt).getTime() < 86400000).length * 10;
  score -= Math.min(gapPenalty, 30);
  if (gapPenalty > 0) details.push({ factor: '断裂点', penalty: gapPenalty, detail: `${Math.round(gapPenalty/10)} 个活跃断裂点` });

  // 2. self-evolution 运行情况
  try {
    const se = getSE();
    if (se && se.cycleHistory) {
      const recent = se.cycleHistory.slice(-5).filter(c => c.status === 'completed');
      if (recent.length === 0) {
        score -= 15;
        details.push({ factor: 'self-evolution', penalty: 15, detail: '近期未完成演化循环' });
      }
    } else {
      score -= 10;
      details.push({ factor: 'self-evolution', penalty: 10, detail: '演化引擎未加载' });
    }
  } catch(e) {
    score -= 10;
    details.push({ factor: 'self-evolution', penalty: 10, detail: '加载失败' });
  }

  // 3. team-learning 活动
  try {
    const tl = getTL();
    if (tl && tl.getErrorReport) {
      const report = tl.getErrorReport();
      if (report && report.totalActions > 0) {
        details.push({ factor: 'team-learning', bonus: 5, detail: `${report.totalActions} 条活动记录` });
      } else {
        score -= 10;
        details.push({ factor: 'team-learning', penalty: 10, detail: '无活动数据' });
      }
    } else {
      score -= 10;
      details.push({ factor: 'team-learning', penalty: 10, detail: '未加载' });
    }
  } catch(e) {
    score -= 5;
    details.push({ factor: 'team-learning', penalty: 5, detail: '加载失败' });
  }

  // 4. auto-learning 活跃度
  try {
    const agentsDir = path.join(BASE, 'memory');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('agent-') && f.endsWith('.json'));
      const recentMemories = files.filter(f => Date.now() - fs.statSync(path.join(agentsDir, f)).mtimeMs < 86400000).length;
      if (recentMemories === 0 && files.length > 0) {
        score -= 10;
        details.push({ factor: 'auto-learning', penalty: 10, detail: `${files.length} 个Agent但24h内无更新` });
      } else if (files.length === 0) {
        score -= 5;
        details.push({ factor: 'auto-learning', penalty: 5, detail: '无Agent记忆文件' });
      } else {
        details.push({ factor: 'auto-learning', bonus: 5, detail: `${recentMemories}/${files.length} 个Agent近日有更新` });
      }
    }
  } catch(e) {
    score -= 5;
    details.push({ factor: 'auto-learning', penalty: 5, detail: '加载失败' });
  }

  return {
    score: Math.max(0, score),
    level: score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor',
    details
  };
}

// ========== 状态聚合 ==========

function getCognitiveOverview() {
  const state = loadState();
  const health = calcCognitiveHealth();
  const gaps = state.crossLinks.slice(0, 20);

  // 从各模块收集
  let seInfo = { status: 'unloaded', cycleCount: 0, lastRun: null };
  let tlInfo = { status: 'unloaded', totalActions: 0 };
  let alInfo = { status: 'unloaded', agentCount: 0, totalExperiences: 0 };

  try {
    const se = getSE();
    if (se && se.cycleHistory) {
      seInfo = {
        status: 'loaded',
        cycleCount: (se.cycleHistory || []).length,
        lastRun: (se.cycleHistory || []).length > 0 ? (se.cycleHistory || []).slice(-1)[0].startedAt : null,
        lastSummary: (se.cycleHistory || []).length > 0 ? (se.cycleHistory || []).slice(-1)[0].summary : null
      };
    }
  } catch(e) { seInfo.status = 'error: ' + e.message; }

  try {
    const tl = getTL();
    if (tl && typeof tl.getErrorReport === 'function') {
      const r = tl.getErrorReport();
      if (r && r.ok) {
        tlInfo = {
          status: 'loaded',
          totalActions: r.totalActions || 0,
          patternCount: (r.patterns || []).length
        };
      } else {
        tlInfo = { status: 'loaded', totalActions: 0, patternCount: 0 };
      }
    }
  } catch(e) { tlInfo.status = 'error: ' + e.message; }

  try {
    const agentsDir = path.join(BASE, 'memory');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('agent-') && f.endsWith('.json'));
      alInfo = {
        status: 'loaded',
        agentCount: files.length
      };
    }
  } catch(e) { alInfo.status = 'error: ' + e.message; }

  return {
    ok: true,
    overview: {
      health,
      modules: {
        selfEvolution: seInfo,
        teamLearning: tlInfo,
        autoLearning: alInfo
      },
      synergy: {
        gaps: gaps.length,
        lastSync: state.lastSyncAt,
        findings: state.findings.length
      }
    },
    findings: state.findings.slice(0, 10),
    crossLinks: gaps.slice(0, 10)
  };
}

// ========== 认知路由注册（零内联，一次注册全部） ==========

function registerCognitiveRoutes(registerRoute, parseBody, json) {
  // === 认知层总览 ===
  registerRoute(['GET'], /^\/api\/cognitive\/overview$/, (req, res) => {
    try { json(res, getCognitiveOverview()); }
    catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // === 认知健康评分 ===
  registerRoute(['GET'], /^\/api\/cognitive\/health$/, (req, res) => {
    try { json(res, { ok: true, health: calcCognitiveHealth() }); }
    catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // === 认知断裂点 ===
  registerRoute(['GET'], /^\/api\/cognitive\/gaps$/, (req, res) => {
    try {
      const state = loadState();
      json(res, { ok: true, gaps: state.crossLinks.slice(0, 50), total: state.crossLinks.length });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // === 执行认知同步 ===
  registerRoute(['POST'], /^\/api\/cognitive\/sync$/, async (req, res) => {
    try {
      const result = await runCognitiveSync();
      json(res, result);
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // === 认知洞察 ===
  registerRoute(['GET'], /^\/api\/cognitive\/findings$/, (req, res) => {
    try {
      const state = loadState();
      json(res, { ok: true, findings: state.findings.slice(0, 50), total: state.findings.length });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // === 模块级路由桥接 ===

  // 统一 self-evolution + 认知层信息
  registerRoute(['GET'], /^\/api\/cognitive\/evolve$/, (req, res) => {
    try {
      const se = getSE();
      const engine = se;
      const history = (engine && engine.cycleHistory) || [];
      const stats = { totalCycles: history.length, lastStatus: null, lastSummary: null };
      if (history.length > 0) {
        const last = history.slice(-1)[0];
        stats.lastStatus = last.status;
        stats.lastSummary = last.summary;
      }
      json(res, { ok: true, stats, history: history.slice(-20).reverse() });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 触发自我演化
  registerRoute(['POST'], /^\/api\/cognitive\/evolve\/run$/, async (req, res) => {
    try {
      const se = getSE();
      if (!se) { json(res, { ok: false, error: 'self-evolution 引擎未加载' }, 500); return; }
      const cycle = await se.runCycle('http://127.0.0.1:8005');
      // 同步到认知层
      await runCognitiveSync();
      json(res, { ok: true, cycle });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 团队学习状态（桥接）
  registerRoute(['GET'], /^\/api\/cognitive\/team$/, (req, res) => {
    try {
      const tl = getTL();
      // 这里只暴露汇总数据，不暴露 team-learning 内部实现细节
      const errorReport = (tl && typeof tl.getErrorReport === 'function') ? tl.getErrorReport() : {};
      const perfReport = (tl && typeof tl.getPerformanceReport === 'function') ? tl.getPerformanceReport() : {};
      const kbStats = (tl && typeof tl.getKnowledgeStats === 'function') ? tl.getKnowledgeStats() : {};
      json(res, { ok: true, errors: errorReport, performance: perfReport, knowledge: kbStats });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 个体学习状态（桥接）
  registerRoute(['GET'], /^\/api\/cognitive\/agents$/, (req, res) => {
    try {
      const al = getAL();
      const agentsDir = path.join(BASE, 'memory');
      const agents = [];
      if (fs.existsSync(agentsDir)) {
        const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('agent-') && f.endsWith('.json'));
        files.forEach(f => {
          try {
            const id = f.replace('agent-', '').replace('.json', '');
            const evo = al.getSkillEvolution(id);
            agents.push(evo);
          } catch(e) { /* skip */ }
        });
      }
      json(res, { ok: true, agents, total: agents.length });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 认知层发现/洞察
  registerRoute(['POST'], /^\/api\/cognitive\/findings$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      if (!body || !body.detail) { json(res, { error: '缺少 detail' }, 400); return; }
      const state = loadState();
      state.findings.unshift({
        id: ++state.insightCount,
        type: body.type || 'manual',
        detail: body.detail,
        source: body.source || 'manual',
        ts: new Date().toISOString()
      });
      if (state.findings.length > 200) state.findings = state.findings.slice(0, 200);
      saveState(state);
      json(res, { ok: true, finding: state.findings[0] });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

// ========== 辅助 ==========

function loadJSON(file, defaultVal) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) {}
  return defaultVal;
}

module.exports = {
  getCognitiveOverview,
  calcCognitiveHealth,
  runCognitiveSync,
  findCognitiveGaps,
  registerCognitiveRoutes,

  // 暴露给 server-modern 定时启动
  startPeriodicSync: function(intervalMs) {
    intervalMs = intervalMs || 600000; // 默认 10 分钟
    console.log('[Cognitive] 启动定时同步，间隔 ' + Math.round(intervalMs/60000) + ' 分钟');
    const tick = () => {
      runCognitiveSync().then(r => {
        if (r.gaps.length > 0 || r.insights.length > 0) {
          console.log('[Cognitive] 同步完成: gaps=' + r.gaps.length + ', activities=' + r.activities.length + ', insights=' + r.insights.length);
        }
      }).catch(e => console.log('[Cognitive] 同步失败:', e.message));
    };
    tick(); // 立即执行一次
    return setInterval(tick, intervalMs);
  }
};
