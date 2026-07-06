/**
 * team-learning.js — 团队学习系统
 *
 * 功能：
 * 1. 跨Agent知识共享 — 经验自动分发给相关角色
 * 2. 错误模式分析 — 聚合同类错误，生成预防规则
 * 3. 团队知识库沉淀 — 最佳实践的集中管理与技能映射
 * 4. 效能追踪与改进建议 — 自动识别技能短板
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const KNOWLEDGE_FILE = path.join(BASE, 'knowledge-base.json');
const ERRORS_FILE = path.join(BASE, 'team-errors.json');
const PERFORMANCE_FILE = path.join(BASE, 'team-performance.json');

// ========== Agent 角色技能映射 ==========
// 定义每个角色应该掌握的核心技能
const ROLE_SKILL_MAP = {
  ai_ceo: ['管理', '决策', '协调', '调度', '评估', '监督'],
  ai_cto: ['架构', '技术决策', '代码审查', '性能优化'],
  ai_cfo: ['财务', '预算', '成本分析', '报表'],
  ai_coo: ['运营', '流程', '效率分析'],
  ai_sr_frontend: ['前端开发', 'Vue', 'UI', 'CSS', '性能优化'],
  ai_sr_backend: ['后端开发', 'API', '数据库', 'Node.js'],
  ai_sr_sec: ['安全', '审计', '渗透测试', '合规'],
  ai_qa_dir: ['测试', 'QA', '自动化测试', '质量保证', '全链路检查'],
  ai_architect: ['架构设计', '系统设计', '技术选型'],
  ai_pm: ['项目管理', '需求分析', '进度跟踪'],
  ai_devops: ['DevOps', 'CI/CD', '部署', '监控'],
  ai_designer: ['UI设计', '原型设计', '用户体验'],
  ai_writer: ['技术写作', '文档', '报告'],
  ai_data: ['数据分析', '数据挖掘', '报表'],
  ai_hr: ['人员管理', '绩效评估', '招聘'],
  ai_legal: ['合规', '法务', '合同审查']
};

// ========== 1. 跨Agent知识共享 ==========

/**
 * 当某Agent学到了新经验，自动分发给相关角色
 * 分析经验内容，匹配相关技能，推送给拥有该技能的其他Agent
 */
function shareExperience(agentId, experience) {
  try {
    if (!experience || !experience.summary) return { shared: 0 };

    var kb = loadJSON(KNOWLEDGE_FILE, []);
    if (!Array.isArray(kb)) kb = kb.entries || [];
    var shared = 0;

    // 分析经验属于哪些技能类别
    var skills = matchSkills(experience.summary + ' ' + (experience.detail || ''));

    // 找出哪些Agent应该学习这个经验
    var targetAgents = findRelevantAgents(agentId, skills);

    var entry = {
      id: 'kb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      sourceAgent: agentId,
      summary: (experience.summary || '').substring(0, 300),
      detail: (experience.detail || '').substring(0, 2000),
      skills: skills,
      targetAgents: targetAgents,
      sharedAt: new Date().toISOString(),
      accessCount: 0,
      type: 'shared_experience'
    };

    // 去重：检查是否已有相似知识
    var isDuplicate = kb.some(function(k) {
      return k.summary === entry.summary ||
        (k.sourceAgent === agentId && 
         k.summary.substring(0, 50) === entry.summary.substring(0, 50));
    });

    if (!isDuplicate) {
      kb.push(entry);
      shared = targetAgents.length;

      // 限制2000条
      if (kb.length > 2000) kb = kb.slice(-2000);
      saveJSON(KNOWLEDGE_FILE, kb);
    }

    return { shared: shared, targetAgents: targetAgents, skills: skills };
  } catch (e) {
    return { shared: 0, error: e.message };
  }
}

/**
 * 找出应该学习该经验的相关Agent（排除自己）
 */
function findRelevantAgents(sourceAgentId, skills) {
  var result = [];
  try {
    var agentsFile = path.join(BASE, 'agents.json');
    var agents = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
    agents.forEach(function(a) {
      if (a.id === sourceAgentId) return;
      if (!a.skills && !a.title) return;
      var agentSkills = (a.skills || []).concat([a.title || '']).map(function(s) { return s.toLowerCase(); });
      var match = skills.some(function(s) {
        return agentSkills.some(function(as) { return as.includes(s.toLowerCase()) || s.toLowerCase().includes(as); });
      });
      if (match) result.push(a.id);
    });
  } catch (e) {}
  return result.slice(0, 10);
}

/**
 * 匹配经验内容所属的技能类别
 */
function matchSkills(text) {
  var matched = [];
  var patterns = {
    '前端|Vue|CSS|UI|页面|组件': '前端开发',
    '后端|API|接口|数据库|Node': '后端开发',
    '测试|QA|质量|自动化测试': '测试',
    '安全|审计|漏洞|权限|加密': '安全',
    '架构|设计|技术选型|系统设计': '架构',
    '部署|CI|CD|流水线|DevOps': 'DevOps',
    '性能|优化|加载|缓存': '性能优化',
    '管理|协调|调度|分配': '管理',
    '分析|数据|报表|统计': '数据分析',
    '文档|报告|写作|手册': '技术写作',
    '错误|失败|异常|Bug|故障': '错误处理',
    '配置|设置|环境|部署': '运维'
  };

  var lowerText = (text || '').toLowerCase();
  for (var pattern in patterns) {
    if (new RegExp(pattern, 'i').test(lowerText)) {
      matched.push(patterns[pattern]);
    }
  }
  return matched;
}

// ========== 2. 错误模式分析 ==========

/**
 * 记录错误并分析模式
 * 当某个错误模式重复出现时，自动生成预防建议
 */
function recordError(agentId, taskTitle, errorMessage, category) {
  try {
    var errors = loadJSON(ERRORS_FILE, { errors: [], patterns: [] });
    if (!errors.errors) errors.errors = [];
    if (!errors.patterns) errors.patterns = [];

    // 记录单次错误
    var entry = {
      id: 'err_' + Date.now().toString(36),
      agentId: agentId,
      taskTitle: taskTitle || '',
      message: (errorMessage || '').substring(0, 500),
      category: category || 'unknown',
      timestamp: new Date().toISOString()
    };
    errors.errors.push(entry);

    // 限制保留最近1000条
    if (errors.errors.length > 1000) errors.errors = errors.errors.slice(-1000);

    // 分析错误模式：同类别+相似消息 → 归类为模式
    var recentErrors = errors.errors.slice(-50);
    var categoryErrors = recentErrors.filter(function(e) { return e.category === (category || 'unknown'); });
    
    if (categoryErrors.length >= 3) {
      // 同一类别出现3次以上 → 升级为模式
      var patternKey = category + '_' + Date.now();
      var existingPattern = errors.patterns.find(function(p) { return p.category === category; });
      
      if (!existingPattern) {
        errors.patterns.push({
          id: 'pat_' + Date.now().toString(36),
          category: category,
          firstSeen: categoryErrors[0].timestamp,
          lastSeen: entry.timestamp,
          count: categoryErrors.length,
          sampleMessages: categoryErrors.slice(0, 5).map(function(e) { return e.message.substring(0, 100); }),
          status: 'detected',
          autoGeneratedSuggestion: generateSuggestion(category, categoryErrors.slice(0, 3))
        });
      } else {
        existingPattern.count = categoryErrors.length;
        existingPattern.lastSeen = entry.timestamp;
        if (existingPattern.sampleMessages.length < 5) {
          existingPattern.sampleMessages.push(entry.message.substring(0, 100));
        }
        // 如果多次出现且还没有规则，升级为active
        if (existingPattern.count >= 5 && existingPattern.status === 'detected') {
          existingPattern.status = 'active';
          existingPattern.suggestion = generateSuggestion(category, categoryErrors.slice(0, 5));
        }
      }
    }

    saveJSON(ERRORS_FILE, errors);
    return { ok: true, entry: entry, patterns: errors.patterns.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 根据错误模式生成预防建议
 */
function generateSuggestion(category, samples) {
  var suggestions = {
    'API': '检查API Key配置和网络连接，建议用/api/provider/test做连通性测试',
    'database': '检查数据库文件完整性和读写权限',
    '网络': '检查网络连通性，确认外部API可访问',
    '权限': '检查配置文件权限和用户授权状态',
    '超时': '增加API超时设置或优化查询性能',
    '配置': '验证配置文件格式和路径是否正确',
    '文件': '检查文件读写权限和磁盘空间',
    '内存': '监控内存使用率，考虑重启服务释放资源'
  };

  for (var key in suggestions) {
    if ((category || '').toLowerCase().includes(key.toLowerCase()) ||
        samples.some(function(s) { return (s || '').toLowerCase().includes(key.toLowerCase()); })) {
      return suggestions[key];
    }
  }
  return '检查相关日志，确认是否为偶发性问题。如反复出现，建议重启服务。';
}

/**
 * 获取错误分析报告
 */
function getErrorReport() {
  try {
    var errors = loadJSON(ERRORS_FILE, { errors: [], patterns: [] });
    var categoryStats = {};
    (errors.errors || []).forEach(function(e) {
      categoryStats[e.category] = (categoryStats[e.category] || 0) + 1;
    });

    // Top K categories
    var topCategories = Object.keys(categoryStats)
      .sort(function(a, b) { return categoryStats[b] - categoryStats[a]; })
      .slice(0, 10)
      .map(function(k) { return { category: k, count: categoryStats[k] }; });

    return {
      ok: true,
      totalErrors: (errors.errors || []).length,
      activePatterns: (errors.patterns || []).filter(function(p) { return p.status === 'active'; }).length,
      detectedPatterns: (errors.patterns || []).filter(function(p) { return p.status === 'detected'; }).length,
      topCategories: topCategories,
      patterns: (errors.patterns || []).slice(-10),
      recentErrors: (errors.errors || []).slice(-20)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ========== 3. 团队最佳实践沉淀 ==========

/**
 * 从成功任务中提取最佳实践
 */
function extractBestPractices(agentId, task, result) {
  try {
    var kb = loadJSON(KNOWLEDGE_FILE, []);
    if (!Array.isArray(kb)) kb = kb.entries || [];

    var success = !(result && result.error) && task && task.status === 'completed';
    if (!success) return { ok: false, reason: '不是成功完成的任务' };

    var summary = (task.title || '') + ' — ' + ((result && result.reply) || '');
    if (summary.length < 30) return { ok: false, reason: '经验太短' };

    var skills = matchSkills(summary);

    var entry = {
      id: 'bp_' + Date.now().toString(36),
      sourceAgent: agentId,
      summary: summary.substring(0, 500),
      skills: skills,
      taskTitle: task.title || '',
      createdAt: new Date().toISOString(),
      type: 'best_practice',
      accessCount: 0,
      rating: 0
    };

    // 去重
    var isDuplicate = kb.some(function(k) { return k.summary === entry.summary; });
    if (!isDuplicate) {
      kb.push(entry);
      if (kb.length > 2000) kb = kb.slice(-2000);
      saveJSON(KNOWLEDGE_FILE, kb);
      return { ok: true, entry: entry };
    }
    return { ok: false, reason: '重复' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ========== 4. 员工效能追踪 ==========

/**
 * 记录员工表现并进行效能分析
 */
function recordPerformance(agentId, taskId, taskTitle, score, durationMs) {
  try {
    var perf = loadJSON(PERFORMANCE_FILE, { records: [] });
    if (!perf.records) perf.records = [];

    perf.records.push({
      agentId: agentId,
      taskId: taskId,
      taskTitle: taskTitle || '',
      score: score || 'B',
      durationMs: durationMs || 0,
      timestamp: new Date().toISOString()
    });

    // 保留最近500条
    if (perf.records.length > 500) perf.records = perf.records.slice(-500);
    saveJSON(PERFORMANCE_FILE, perf);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 获取效能分析报告
 */
function getPerformanceReport() {
  try {
    var perf = loadJSON(PERFORMANCE_FILE, { records: [] });
    if (!perf.records || perf.records.length === 0) {
      return { ok: true, total: 0, message: '暂无效能数据' };
    }

    // 按Agent汇总
    var agentStats = {};
    perf.records.forEach(function(r) {
      if (!agentStats[r.agentId]) {
        agentStats[r.agentId] = { total: 0, scoreA: 0, scoreB: 0, scoreC: 0, avgDuration: 0, totalDuration: 0, recentTasks: [] };
      }
      var s = agentStats[r.agentId];
      s.total++;
      if (r.score === 'A') s.scoreA++;
      else if (r.score === 'C') s.scoreC++;
      else s.scoreB++;
      s.totalDuration += r.durationMs || 0;
      s.avgDuration = Math.round(s.totalDuration / s.total);
      if (s.recentTasks.length < 5) s.recentTasks.push(r.taskTitle);
    });

    // 找出短板：C评级多 或 耗时长的Agent
    var weakAgents = [];
    Object.keys(agentStats).forEach(function(id) {
      var s = agentStats[id];
      var weakRatio = s.total > 0 ? (s.scoreC / s.total) : 0;
      var durationIssue = s.avgDuration > 30000; // 超过30秒
      if (weakRatio > 0.3 || durationIssue) {
        weakAgents.push({
          agentId: id,
          scoreCRate: Math.round(weakRatio * 100) + '%',
          avgDurationMs: s.avgDuration,
          suggestion: weakRatio > 0.3 ? '需要技能培训或任务重新分配' : '任务耗时较长，考虑优化'
        });
      }
    });

    return {
      ok: true,
      totalRecords: perf.records.length,
      agentCount: Object.keys(agentStats).length,
      weakAgents: weakAgents,
      teamStats: {
        avgScoreARate: Math.round(Object.keys(agentStats).filter(function(id) { return agentStats[id].scoreA / agentStats[id].total > 0.5; }).length / Math.max(Object.keys(agentStats).length, 1) * 100) + '%',
        totalTasksCompleted: perf.records.length
      },
      detail: agentStats
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 重置效能数据（用于测试）
 */
function resetPerformance() {
  saveJSON(PERFORMANCE_FILE, { records: [] });
  return { ok: true };
}


/**
 * 获取知识库统计
 */
function getKnowledgeStats() {
  try {
    var kb = loadJSON(KNOWLEDGE_FILE, []);
    if (!Array.isArray(kb)) kb = kb.entries || [];
    var byType = {};
    var bySkill = {};
    var topShared = {};
    kb.forEach(function(e) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      (e.skills || []).forEach(function(s) { bySkill[s] = (bySkill[s] || 0) + 1; });
      if (e.sourceAgent) topShared[e.sourceAgent] = (topShared[e.sourceAgent] || 0) + 1;
    });
    var topSkills = Object.keys(bySkill).sort(function(a,b){return bySkill[b]-bySkill[a];}).slice(0,10);
    var topContributors = Object.keys(topShared).sort(function(a,b){return topShared[b]-topShared[a];}).slice(0,10);
    return { ok: true, totalEntries: kb.length, byType: byType, topSkills: topSkills, topContributors: topContributors };
  } catch(e) { return { ok: false, error: e.message }; }
}

/**
 * 根因分析
 */
function analyzeRootCause(patternId) {
  try {
    var errors = loadJSON(ERRORS_FILE, { errors: [], patterns: [] });
    var pattern = (errors.patterns || []).find(function(p) { return p.id === patternId; });
    if (!pattern) return { ok: false, error: '模式未找到' + patternId };
    var relatedErrors = (errors.errors || []).filter(function(e) { return e.category === pattern.category; });
    if (relatedErrors.length < 2) return { ok: true, pattern: pattern, rootCause: '数据不足，至少需要2条同类错误才能分析' };
    var wordFreq = {};
    var errorTexts = relatedErrors.map(function(e) { return (e.message || '') + ' ' + (e.taskTitle || ''); });
    errorTexts.forEach(function(txt) {
      var words = txt.split(/[\s,，。：:；;！!？?()（）\[\]{}]+/).filter(function(w) { return w.length > 1; });
      words.forEach(function(w) { wordFreq[w] = (wordFreq[w] || 0) + 1; });
    });
    var topKeywords = Object.keys(wordFreq).sort(function(a,b){return wordFreq[b]-wordFreq[a];}).slice(0,5).map(function(k){return{word:k,count:wordFreq[k],rate:Math.round(wordFreq[k]/relatedErrors.length*100)+'%'};});
    var tasks = relatedErrors.map(function(e){return e.taskTitle||'';}).filter(Boolean);
    var rootCause = '暂未识别到明确根因';
    var suggestion = pattern.suggestion || pattern.autoGeneratedSuggestion || '检查相关配置或日志';
    var allText = errorTexts.join(' ').toLowerCase();
    if (allText.includes('timeout') || allText.includes('超时')) { rootCause = 'API调用超时，可能是网络延迟或服务端响应慢'; suggestion = '增加API超时设置或检查网络连通性'; }
    else if (allText.includes('401') || allText.includes('403') || allText.includes('认证') || allText.includes('token')) { rootCause = '认证凭证过期或无效'; suggestion = '刷新API Key或检查认证配置'; }
    else if (allText.includes('404') || allText.includes('not found') || allText.includes('不存在')) { rootCause = '引用的资源不存在或路径错误'; suggestion = '检查文件路径、API端点或资源ID'; }
    else if (allText.includes('refused') || allText.includes('connect') || allText.includes('连接被拒绝')) { rootCause = '目标服务不可达，服务未启动或端口未监听'; suggestion = '检查目标服务状态'; }
    return { ok: true, pattern: { id: pattern.id, category: pattern.category, count: pattern.count, status: pattern.status }, relatedErrors: relatedErrors.length, topKeywords: topKeywords, rootCause: rootCause, suggestion: suggestion };
  } catch (e) { return { ok: false, error: e.message }; }
}

function feedbackToHarness(pattern, ruleEngine) {
  try {
    if (!pattern || pattern.status !== 'active') return { ok: false, reason: '模式非活跃状态' };
    var result = { ruleCreated: false, notified: false };
    if (ruleEngine && typeof ruleEngine.getInstance === 'function') {
      try {
        var ruleName = 'auto_' + pattern.category + '_' + Date.now().toString(36);
        var newRule = ruleEngine.getInstance().proposeRule({ type: 'operation', name: ruleName, condition: 'agent.errors.' + pattern.category + ' >= 3', action: 'warn', reason: '自动生成: 检测到模式 ' + pattern.category + ' 出现' + pattern.count + '次', severity: 'medium' }, 'auto_learning');
        if (newRule && newRule.success) { ruleEngine.getInstance().confirmRule(newRule.rule.id, 'auto_learning', '自动激活'); result.ruleCreated = true; result.ruleName = ruleName; }
      } catch(e) {}
    }
    var feedbackLog = path.join(BASE, 'feedback-loop.log');
    var entry = { timestamp: new Date().toISOString(), patternId: pattern.id, category: pattern.category, count: pattern.count, ruleCreated: result.ruleCreated, suggestion: pattern.suggestion || '' };
    try { var log = []; if (fs.existsSync(feedbackLog)) log = JSON.parse(fs.readFileSync(feedbackLog, 'utf8')); log.push(entry); if (log.length > 200) log = log.slice(-200); fs.writeFileSync(feedbackLog, JSON.stringify(log, null, 2), 'utf8'); result.notified = true; } catch(e) {}
    return { ok: true, result: result };
  } catch (e) { return { ok: false, error: e.message }; }
}

function getFeedbackReport() {
  try {
    var logPath = path.join(BASE, 'feedback-loop.log');
    if (!fs.existsSync(logPath)) return { ok: true, totalActions: 0, entries: [] };
    var log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return { ok: true, totalActions: log.length, ruleCreatedCount: log.filter(function(e){return e.ruleCreated;}).length, entries: log.slice(-20).reverse() };
  } catch (e) { return { ok: false, error: e.message }; }
}

function autoCleanPatterns() {
  try {
    var errors = loadJSON(ERRORS_FILE, { errors: [], patterns: [] });
    var now = Date.now(); var cleaned = 0;
    (errors.patterns || []).forEach(function(p) {
      if (p.status === 'detected') { var age = now - new Date(p.lastSeen || now).getTime(); if (age > 72 * 60 * 60 * 1000) { p.status = 'archived'; cleaned++; } }
    });
    if (cleaned > 0) saveJSON(ERRORS_FILE, errors);
    return { cleaned: cleaned };
  } catch (e) { return { cleaned: 0, error: e.message }; }
}


// ========== 辅助函数 ==========

function loadJSON(file, defaultVal) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return defaultVal;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

module.exports = {
  shareExperience,
  findRelevantAgents,
  matchSkills,
  recordError,
  getErrorReport,
  extractBestPractices,
  recordPerformance,
  getPerformanceReport,
  resetPerformance,
  analyzeRootCause,
  feedbackToHarness,
  getFeedbackReport,
  autoCleanPatterns,
  getKnowledgeStats,
  ROLE_SKILL_MAP
};
