/**
 * Harness 习惯记忆库系统
 * 
 * 功能：
 * 1. 记录用户操作习惯和命令历史
 * 2. 记忆衰减机制（遗忘曲线）
 * 3. 偏好推测 + 人工确认回路
 * 4. 仅 CEO / 安全总监 可查看分析
 */

const fs = require('fs');
const path = require('path');

const HABITS_FILE = path.join(__dirname, '..', 'harness-habits.json');
const PREFERENCES_FILE = path.join(__dirname, '..', 'harness-preferences.json');
const PENDING_FILE = path.join(__dirname, '..', 'harness-pending-confirmations.json');

// ========== 衰减参数 ==========
const DECAY_CONFIG = {
  // 半衰期：一个习惯记忆权重降到一半所需的天数
  // 周内习惯（如每周一看的报表）半衰期 14 天
  weekly: { halfLife: 14, label: '周习惯' },
  // 日常习惯（如常用格式/语气）半衰期 30 天
  daily: { halfLife: 30, label: '日常偏好' },
  // 长期偏好（如命名规范/技术栈选择）半衰期 90 天
  longTerm: { halfLife: 90, label: '长期偏好' }
};

// ========== 初始化 ==========

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch(e) { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ========== 核心：习惯记录 ==========

/**
 * 记录一条用户操作习惯
 */
function recordHabit(category, action, detail, metadata) {
  var habits = loadJSON(HABITS_FILE, { events: [], version: 1 });
  
  // 去重检查：同一 category + action 的最近 3 条不再重复记录
  var exists = false;
  var recentEvents = habits.events.slice(-10).reverse(); // 只看最近 10 条，从最新开始
  for (var ei = 0; ei < recentEvents.length; ei++) {
    if (recentEvents[ei].category === category && recentEvents[ei].action === action) {
      exists = true;
      break;
    }
  }
  // 如果存在且是同类 preference/format 习惯，跳过记录（只更新权重）
  if (exists && (category === 'preference' || category === 'format')) {
    // 找到最近的同类型事件，提升权重
    for (var ui = habits.events.length - 1; ui >= 0; ui--) {
      if (habits.events[ui].category === category && habits.events[ui].action === action) {
        habits.events[ui].weight = Math.min((habits.events[ui].weight || 1.0) + 0.5, 5.0);
        habits.events[ui].timestamp = Date.now();
        break;
      }
    }
    saveJSON(HABITS_FILE, habits);
    return { id: recentEvents[0].id, category: category, action: action, deduped: true };
  }
  
  var event = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2,6),
    category: category,     // 'command' | 'preference' | 'format' | 'report' | 'workflow'
    action: action,         // 具体行为：'read_report_A', 'use_async', 'prefer_short_style'
    detail: detail || '',
    metadata: metadata || {},
    timestamp: Date.now(),
    weight: 1.0,            // 初始权重
    source: 'observation'   // observation | confirmation | manual
  };
  
  habits.events.push(event);
  
  // 保留最近 5000 条
  if (habits.events.length > 5000) {
    habits.events = habits.events.slice(-5000);
  }
  
  saveJSON(HABITS_FILE, habits);
  return event;
}

/**
 * 批量记录操作
 */
function recordBatch(events) {
  events.forEach(function(e) {
    recordHabit(e.category, e.action, e.detail, e.metadata);
  });
}

// ========== 记忆衰减计算 ==========

/**
 * 计算某条事件的当前权重（带时间衰减）
 */
function decayWeight(event) {
  var daysOld = (Date.now() - event.timestamp) / (86400000); // ms → 天
  if (daysOld <= 0) return event.weight;
  
  // 根据类别选择半衰期
  var halfLife = DECAY_CONFIG.daily.halfLife;
  if (event.category === 'workflow' || event.category === 'report') {
    halfLife = DECAY_CONFIG.weekly.halfLife;
  } else if (event.category === 'preference' || event.category === 'format') {
    halfLife = DECAY_CONFIG.longTerm.halfLife;
  }
  
  // 指数衰减：weight * 0.5^(days/halfLife)
  var decayed = event.weight * Math.pow(0.5, daysOld / halfLife);
  return decayed;
}

/**
 * 分析习惯趋势（带衰减）
 */
function analyzeHabits(daysLimit) {
  daysLimit = daysLimit || 180; // 默认分析最近半年
  var habits = loadJSON(HABITS_FILE, { events: [] });
  var cutoff = Date.now() - daysLimit * 86400000;
  
  // 1. 按 action 聚合，计算加权频次
  var actionStats = {};
  habits.events.forEach(function(e) {
    if (e.timestamp < cutoff) return; // 超出时间范围
    var key = e.category + '::' + e.action;
    if (!actionStats[key]) {
      actionStats[key] = {
        category: e.category,
        action: e.action,
        count: 0,
        totalWeight: 0,
        lastSeen: 0,
        samples: []
      };
    }
    var w = decayWeight(e);
    actionStats[key].count++;
    actionStats[key].totalWeight += w;
    if (e.timestamp > actionStats[key].lastSeen) {
      actionStats[key].lastSeen = e.timestamp;
    }
    // 保留最近 3 个样本
    if (actionStats[key].samples.length < 3) {
      actionStats[key].samples.push(e.detail);
    }
  });
  
  return {
    analyzedAt: Date.now(),
    daysAnalyzed: daysLimit,
    totalEvents: habits.events.filter(function(e) { return e.timestamp >= cutoff; }).length,
    allEvents: habits.events.length,
    trends: Object.keys(actionStats).map(function(k) {
      var s = actionStats[k];
      return {
        category: s.category,
        action: s.action,
        frequency: s.count,
        weightedScore: Math.round(s.totalWeight * 100) / 100,
        lastSeen: s.lastSeen,
        lastSeenDaysAgo: Math.round((Date.now() - s.lastSeen) / 86400000),
        samples: s.samples
      };
    }).sort(function(a, b) { return b.weightedScore - a.weightedScore; })
  };
}

// ========== 偏好推测 + 确认回路 ==========

/**
 * 从习惯数据中推测老板偏好（权重最高的行为模式）
 */
function inferPreferences(minWeight) {
  minWeight = minWeight || 3.0; // 最小加权权重才值得推测
  var analysis = analyzeHabits(90); // 分析近 90 天
  
  var preferences = [];
  
  // 1. 分析高频高权重行为
  analysis.trends.forEach(function(t) {
    if (t.weightedScore < minWeight) return;
    
    // 归类为偏好推测
    var pref = {
      id: 'pref_' + Date.now().toString(36) + Math.random().toString(36).substring(2,4),
      category: t.category,
      action: t.action,
      inferredLabel: describePreference(t),
      confidence: Math.min(1.0, t.weightedScore / 20),
      evidence: {
        occurrences: t.frequency,
        weightedScore: t.weightedScore,
        recentDays: t.lastSeenDaysAgo,
        samples: t.samples
      },
      status: 'pending',  // pending | confirmed | rejected
      createdAt: Date.now()
    };
    preferences.push(pref);
  });
  
  return preferences.slice(0, 10); // 最多返回 10 条
}

/**
 * 生成人类可读的偏好描述
 */
function describePreference(trend) {
  var label = '';
  switch (trend.category) {
    case 'format':
      label = '您似乎偏好 ' + trend.action + ' 的格式风格';
      break;
    case 'command':
      label = '您经常使用 ' + trend.action + ' 类操作';
      break;
    case 'report':
      label = '您倾向于查看 ' + trend.action + ' 类报表';
      break;
    case 'workflow':
      label = '您习惯 ' + trend.action + ' 的工作流程';
      break;
    case 'preference':
      label = '您偏向 ' + trend.action;
      break;
    default:
      label = '观察到习惯：' + trend.action;
  }
  
  if (trend.lastSeenDaysAgo <= 7) {
    label += '（最近活跃）';
  } else if (trend.lastSeenDaysAgo <= 30) {
    label += '（近一个月）';
  } else {
    label += '（较早记录）';
  }
  
  return label;
}

/**
 * 获取待确认的偏好列表
 */
function getPendingConfirmations() {
  return loadJSON(PENDING_FILE, []);
}

/**
 * 提交一条偏好确认（老板或助理确认）
 */
function confirmPreference(prefId, confirmed, note) {
  var pending = loadJSON(PENDING_FILE, []);
  var prefs = loadJSON(PREFERENCES_FILE, []);
  
  var idx = -1;
  pending.forEach(function(p, i) {
    if (p.id === prefId) { idx = i; }
  });
  if (idx < 0) return { ok: false, message: '偏好不存在' };
  
  var pref = pending[idx];
  pref.status = confirmed ? 'confirmed' : 'rejected';
  pref.confirmedAt = Date.now();
  pref.note = note || '';
  
  if (confirmed) {
    // 写入核心偏好库
    pref.confidence = Math.min(1.0, pref.confidence + 0.3); // 确认后提高置信度
    prefs.push(pref);
    saveJSON(PREFERENCES_FILE, prefs);
  }
  
  // 从待确认列表移除
  pending.splice(idx, 1);
  saveJSON(PENDING_FILE, pending);
  
  return { ok: true, pref: pref };
}

/**
 * 生成偏好确认建议（AI 自动生成待确认项）
 */
function generateConfirmations() {
  var inferred = inferPreferences(2.5);
  var existing = loadJSON(PENDING_FILE, []);
  var existingMap = {};
  existing.forEach(function(p) { existingMap[p.action] = true; });
  
  var prefs = loadJSON(PREFERENCES_FILE, []);
  var confirmedMap = {};
  prefs.forEach(function(p) { confirmedMap[p.action] = true; });
  
  var newPending = [];
  inferred.forEach(function(p) {
    // 跳过已经确认或在待确认列表中的
    if (confirmedMap[p.action]) return;
    if (existingMap[p.action]) return;
    newPending.push(p);
  });
  
  if (newPending.length > 0) {
    var allPending = existing.concat(newPending);
    saveJSON(PENDING_FILE, allPending);
  }
  
  return newPending;
}

// ========== 习惯提取器（从对话/命令中自动提取） ==========

/**
 * 从一条用户消息中提取可记录的习惯
 */
function extractHabitsFromMessage(message, context) {
  var habits = [];
  
  // 检测命令模式
  if (/^(使用|运行|执行|查|看|开|打|创建|写)/.test(message)) {
    habits.push({
      category: 'command', action: 'cli_style_prefix',
      detail: '使用动作前缀命令风格',
      metadata: { sample: message.substring(0, 50) }
    });
  }
  
  // 检测报表偏好
  if (/报表|报告|统计|数据|图表/.test(message)) {
    var reportType = '';
    if (/销售|营收|收入/.test(message)) reportType = '营收';
    else if (/用户|活跃|留存/.test(message)) reportType = '用户';
    else if (/任务|进度|完成/.test(message)) reportType = '任务';
    else reportType = '综合';
    habits.push({
      category: 'report', action: 'view_' + reportType + '_report',
      detail: '查看' + reportType + '类报表',
      metadata: { sample: message.substring(0, 50) }
    });
  }
  
  // 检测语气偏好
  if (/不要|别|不准|禁止|去掉/.test(message)) {
    habits.push({
      category: 'format', action: 'avoid_negative_tone',
      detail: '避免使用否定语气',
      metadata: { sample: message.substring(0, 50) }
    });
  }
  
  if (/简|短|快|直接|马上/.test(message)) {
    habits.push({
      category: 'preference', action: 'prefer_concise',
      detail: '偏好简洁直接的回复风格',
      metadata: { sample: message.substring(0, 50) }
    });
  }
  
  return habits;
}

// ========== API 接口 ==========

/**
 * 获取习惯分析报告（仅 CEO / 安全总监权限）
 */
function getHabitsReport(days) {
  var analysis = analyzeHabits(days || 90);
  var confirmed = loadJSON(PREFERENCES_FILE, []);
  var pending = loadJSON(PENDING_FILE, []);
  
  return {
    analysis: {
      totalEvents: analysis.totalEvents,
      allTimeEvents: analysis.allEvents,
      daysAnalyzed: analysis.daysAnalyzed,
      topTrends: analysis.trends.slice(0, 20)
    },
    confirmedPreferences: confirmed.filter(function(p) { return p.status === 'confirmed'; }).slice(-20),
    pendingConfirmations: pending.slice(-10)
  };
}

/**
 * 记录一次界面操作/选择偏好
 */
function recordPreference(category, action, detail) {
  return recordHabit(category, action, detail, { source: 'ui_interaction' });
}

// Export API
module.exports = {
  recordHabit: recordHabit,
  recordBatch: recordBatch,
  analyzeHabits: analyzeHabits,
  decayWeight: decayWeight,
  inferPreferences: inferPreferences,
  getPendingConfirmations: getPendingConfirmations,
  confirmPreference: confirmPreference,
  generateConfirmations: generateConfirmations,
  extractHabitsFromMessage: extractHabitsFromMessage,
  getHabitsReport: getHabitsReport,
  recordPreference: recordPreference,
  
  // 方便初始化
  getConfig: function() { return { decayConfig: DECAY_CONFIG } }
};
