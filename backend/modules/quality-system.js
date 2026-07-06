/**
 * eCompany P3: 质量体系模块
 * 功能：
 *   1. 任务质量自动评分（A/B/C/D）
 *   2. 审批流程（老板审批节点）
 *   3. 决策追溯（Audit Log）
 *   4. 质量报告
 *   5. CEO 工具增强
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const TASKS_FILE = path.join(BASE, 'tasks.json');
const AUDIT_LOG_FILE = path.join(BASE, 'audit-log.json');
const QUALITY_REPORT_FILE = path.join(BASE, 'quality-reports.json');

// 最大审计日志条目数
const MAX_AUDIT_ENTRIES = 500;

// ========== 辅助函数 ==========

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      var raw = fs.readFileSync(file, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF || raw.charCodeAt(0) === 239)
        raw = raw.replace(/^[\uFEFF\xEF\xBB\xBF]+/, '');
      if (raw.trim().length === 0) return fallback;
      return JSON.parse(raw);
    }
  } catch(e) { /* ignore */ }
  return fallback;
}

function writeJSON(file, data) {
  try {
    var dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch(e) { return false; }
}

function loadTasks() {
  return readJSON(TASKS_FILE, []);
}

function saveTasks(tasks) {
  return writeJSON(TASKS_FILE, tasks);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========== AI 评分调用 ==========

/**
 * 调用 AI 对任务结果进行质量评分
 * @param {string} taskTitle - 任务标题
 * @param {string} taskResult - 任务执行结果
 * @returns {Promise<Object>} 评分结果
 */
async function callAIScoring(taskTitle, taskResult) {
  // 尝试调用 AI 进行评分
  try {
    // 读取 AI 配置
    var prov = readJSON(path.join(BASE, 'ai-provider.json'), { provider: 'deepseek', apiKey: '', apiBase: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' });
    var apiKey = prov.apiKey || process.env.DEEPSEEK_API_KEY || '';

    // 如果未配置 API Key，使用规则评分
    if (!apiKey) {
      return ruleBasedScoring(taskTitle, taskResult);
    }

    var apiBase = prov.apiBase || 'https://api.deepseek.com/v1/chat/completions';
    var model = prov.model || 'deepseek-chat';
    var provider = (prov.provider || 'deepseek').toLowerCase();

    var response = await fetch(apiBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的任务质量评估专家。请对以下任务结果进行评分，返回严格的 JSON 格式（不要任何 markdown 标记）。\n\n评分维度（每项 0-100）：\n- completeness（完成度）：任务目标的达成程度\n- quality（质量）：输出内容的专业性和准确性\n- timeliness（时效性）：对截止时间的遵守程度\n- innovation（创新性）：解决方案的创新程度\n\n总体等级：\n- A（优秀 85-100）：全面超出预期\n- B（良好 70-84）：达到预期\n- C（及格 55-69）：基本完成但存在不足\n- D（不及格 0-54）：未达标\n\n返回格式：\n{"overall":"A","dimensions":{"completeness":85,"quality":80,"timeliness":90,"innovation":70},"feedback":"简要评价"}'
          },
          {
            role: 'user',
            content: '任务标题：' + taskTitle + '\n\n任务结果：' + taskResult
          }
        ],
        max_tokens: 512,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return ruleBasedScoring(taskTitle, taskResult);
    }

    var data = await response.json();
    var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

    // 尝试解析 AI 返回的 JSON
    try {
      // 清理可能的 markdown 标记
      var cleanContent = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(cleanContent);
      if (parsed.overall && parsed.dimensions) {
        return {
          overall: parsed.overall,
          dimensions: {
            completeness: Math.min(100, Math.max(0, parsed.dimensions.completeness || 0)),
            quality: Math.min(100, Math.max(0, parsed.dimensions.quality || 0)),
            timeliness: Math.min(100, Math.max(0, parsed.dimensions.timeliness || 0)),
            innovation: Math.min(100, Math.max(0, parsed.dimensions.innovation || 0))
          },
          feedback: parsed.feedback || 'AI 评分完成',
          reviewMethod: 'ai'
        };
      }
    } catch(e) { /* parse failed, fallback to rule-based */ }

    return ruleBasedScoring(taskTitle, taskResult);
  } catch(e) {
    return ruleBasedScoring(taskTitle, taskResult);
  }
}

/**
 * 基于规则的评分（AI 不可用时回退）
 */
function ruleBasedScoring(taskTitle, taskResult) {
  var resultText = (taskResult || '') + ' ' + (taskTitle || '');
  var score = 70; // 基础分

  // 完成度评价
  var completeness = 70;
  if (resultText.length > 200) completeness += 15;
  if (resultText.length > 500) completeness += 5;
  if (resultText.includes('完成') || resultText.includes('success') || resultText.includes('成功')) completeness += 5;
  if (resultText.includes('实现') || resultText.includes('implement')) completeness += 5;

  // 质量评价
  var quality = 70;
  if (resultText.includes('测试') || resultText.includes('test') || resultText.includes('验证')) quality += 10;
  if (resultText.includes('优化') || resultText.includes('optimize') || resultText.includes('重构')) quality += 10;
  if (resultText.includes('文档') || resultText.includes('report') || resultText.includes('报告')) quality += 5;

  // 时效性：无截止时间则给中等分
  var timeliness = 75;

  // 创新性
  var innovation = 60;
  if (resultText.includes('设计') || resultText.includes('方案') || resultText.includes('架构')) innovation += 10;
  if (resultText.includes('改进') || resultText.includes('创新') || resultText.includes('新方案')) innovation += 15;

  // 限制范围
  completeness = Math.min(100, Math.max(0, completeness));
  quality = Math.min(100, Math.max(0, quality));
  timeliness = Math.min(100, Math.max(0, timeliness));
  innovation = Math.min(100, Math.max(0, innovation));

  // 计算总分（非简单平均，用于定等级）
  var weightedScore = completeness * 0.35 + quality * 0.30 + timeliness * 0.20 + innovation * 0.15;

  var overall;
  if (weightedScore >= 85) overall = 'A';
  else if (weightedScore >= 70) overall = 'B';
  else if (weightedScore >= 55) overall = 'C';
  else overall = 'D';

  return {
    overall: overall,
    dimensions: { completeness: completeness, quality: quality, timeliness: timeliness, innovation: innovation },
    feedback: overall === 'A' ? '出色完成，表现优异' : overall === 'B' ? '良好完成任务' : overall === 'C' ? '基本完成，存在改进空间' : '未达到预期，需改进',
    reviewMethod: 'rule-based'
  };
}

// ========== Audit Log ==========

function loadAuditLog() {
  return readJSON(AUDIT_LOG_FILE, { entries: [] });
}

function saveAuditLog(log) {
  if (log.entries.length > MAX_AUDIT_ENTRIES) {
    log.entries = log.entries.slice(-MAX_AUDIT_ENTRIES);
  }
  writeJSON(AUDIT_LOG_FILE, log);
}

/**
 * 记录审计条目
 * @param {string} actor - 执行者 ID
 * @param {string} action - 操作类型
 * @param {string} target - 目标/接收者
 * @param {Object} detail - 详情
 * @param {string} result - 结果（success/failure）
 */
function logAudit(actor, action, target, detail, result) {
  var log = loadAuditLog();
  var entry = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    actor: actor,
    action: action,
    target: target || '',
    detail: detail || {},
    result: result || 'success'
  };
  log.entries.push(entry);
  saveAuditLog(log);
  return entry;
}

/**
 * 查询审计日志
 * @param {Object} options
 * @param {string} options.since - ISO 起始时间
 * @param {string} options.actor - 按执行者筛选
 * @param {string} options.action - 按操作类型筛选
 * @param {number} options.limit - 返回条数限制
 * @param {number} options.offset - 偏移量
 * @returns {Array}
 */
function queryAuditLog(options) {
  var log = loadAuditLog();
  var entries = log.entries;

  if (options) {
    if (options.since) {
      var sinceTs = new Date(options.since).getTime();
      entries = entries.filter(function(e) {
        return new Date(e.timestamp).getTime() >= sinceTs;
      });
    }
    if (options.actor) {
      entries = entries.filter(function(e) { return e.actor === options.actor; });
    }
    if (options.action) {
      entries = entries.filter(function(e) { return e.action === options.action; });
    }
  }

  // 按时间降序
  entries = entries.sort(function(a, b) {
    return b.timestamp.localeCompare(a.timestamp);
  });

  var offset = (options && options.offset) || 0;
  var limit = (options && options.limit) || 50;

  return entries.slice(offset, offset + limit);
}

// ========== 质量评分 ==========

/**
 * 对任务进行 AI 质量评分并更新任务记录
 * @param {string} taskId - 任务 ID
 * @param {string} result - 任务执行结果
 * @param {Object} options - 可选参数
 * @param {string} options.reviewedBy - 评分执行者
 * @returns {Promise<Object>} 评分结果
 */
async function scoreTask(taskId, result, options) {
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) throw new Error('任务不存在: ' + taskId);

  var scoreResult = await callAIScoring(task.title || '', result || task.result || '');

  task.score = {
    overall: scoreResult.overall,
    dimensions: scoreResult.dimensions,
    feedback: scoreResult.feedback,
    reviewedBy: (options && options.reviewedBy) || 'ai_reviewer',
    reviewedAt: new Date().toISOString()
  };

  // 更新 task
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);

  // 记录审计
  logAudit('system', 'quality_score', task.assigneeId || '', {
    taskId: taskId,
    title: task.title,
    score: scoreResult.overall,
    dimensions: scoreResult.dimensions
  }, 'success');

  return scoreResult;
}

/**
 * 获取任务评分
 * @param {string} taskId
 * @returns {Object|null}
 */
function getTaskScore(taskId) {
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task || !task.score) return null;
  return task.score;
}

/**
 * 获取指定 Agent 的质量报告
 * @param {string} agentId
 * @returns {Object}
 */
function getAgentQualityReport(agentId) {
  var tasks = loadTasks();
  var agentTasks = tasks.filter(function(t) {
    return t.assigneeId === agentId && t.score;
  });

  if (agentTasks.length === 0) {
    return {
      agentId: agentId,
      totalTasks: 0,
      scoredTasks: 0,
      averageScore: 'N/A',
      scoreDistribution: { A: 0, B: 0, C: 0, D: 0 },
      recentScores: []
    };
  }

  var distribution = { A: 0, B: 0, C: 0, D: 0 };
  var totalWeighted = 0;

  agentTasks.forEach(function(t) {
    if (t.score && t.score.overall) {
      distribution[t.score.overall] = (distribution[t.score.overall] || 0) + 1;
    }
  });

  // 计算平均分（映射 A=90, B=75, C=60, D=40）
  var scoreMap = { A: 90, B: 75, C: 60, D: 40 };
  agentTasks.forEach(function(t) {
    if (t.score && t.score.overall && scoreMap[t.score.overall]) {
      totalWeighted += scoreMap[t.score.overall];
    }
  });

  var averageScore = (totalWeighted / agentTasks.length).toFixed(1);

  // 最近评分（按时间倒序）
  var recentScores = agentTasks
    .sort(function(a, b) {
      return (b.score && b.score.reviewedAt || '').localeCompare(a.score && a.score.reviewedAt || '');
    })
    .slice(0, 10)
    .map(function(t) {
      return {
        taskId: t.id,
        title: t.title,
        overall: t.score.overall,
        reviewedAt: t.score.reviewedAt
      };
    });

  return {
    agentId: agentId,
    totalTasks: tasks.filter(function(t) { return t.assigneeId === agentId; }).length,
    scoredTasks: agentTasks.length,
    averageScore: parseFloat(averageScore),
    scoreDistribution: distribution,
    recentScores: recentScores
  };
}

/**
 * 获取全局质量报告
 * @returns {Object}
 */
function getOverallReport() {
  var tasks = loadTasks();

  // 各 Agent 统计
  var agentMap = {};
  tasks.forEach(function(t) {
    if (!t.assigneeId) return;
    if (!agentMap[t.assigneeId]) {
      agentMap[t.assigneeId] = { total: 0, scored: 0, scoreSum: 0, distribution: { A: 0, B: 0, C: 0, D: 0 } };
    }
    agentMap[t.assigneeId].total++;
    if (t.score && t.score.overall) {
      agentMap[t.assigneeId].scored++;
      agentMap[t.assigneeId].distribution[t.score.overall] = (agentMap[t.assigneeId].distribution[t.score.overall] || 0) + 1;
    }
  });

  var scoreMap = { A: 90, B: 75, C: 60, D: 40 };
  var agentReports = {};
  Object.keys(agentMap).forEach(function(aid) {
    var d = agentMap[aid];
    var avg = 'N/A';
    if (d.scored > 0) {
      var sum = 0;
      Object.keys(d.distribution).forEach(function(grade) {
        sum += scoreMap[grade] * d.distribution[grade];
      });
      avg = (sum / d.scored).toFixed(1);
    }
    agentReports[aid] = { totalTasks: d.total, scoredTasks: d.scored, averageScore: avg, scoreDistribution: d.distribution };
  });

  // 全局评分分布
  var globalDist = { A: 0, B: 0, C: 0, D: 0 };
  tasks.forEach(function(t) {
    if (t.score && t.score.overall) {
      globalDist[t.score.overall] = (globalDist[t.score.overall] || 0) + 1;
    }
  });

  // 待审批数量
  var pendingApproval = tasks.filter(function(t) { return t.approval && t.approval.status === 'pending'; }).length;

  // 近期趋势（最近 20 个评分）
  var recentTasks = tasks
    .filter(function(t) { return t.score && t.score.reviewedAt; })
    .sort(function(a, b) {
      return (b.score.reviewedAt || '').localeCompare(a.score.reviewedAt || '');
    })
    .slice(0, 20)
    .map(function(t) {
      return {
        taskId: t.id,
        title: t.title,
        overall: t.score.overall,
        reviewedAt: t.score.reviewedAt
      };
    });

  return {
    agents: agentReports,
    globalDistribution: globalDist,
    totalScored: tasks.filter(function(t) { return t.score; }).length,
    pendingApproval: pendingApproval,
    trend: recentTasks,
    generatedAt: new Date().toISOString()
  };
}

// ========== 审批流程 ==========

/**
 * 标记任务需要审批
 * @param {string} taskId
 * @param {string} reason - 审批原因
 */
function requireApproval(taskId, reason) {
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) throw new Error('任务不存在: ' + taskId);

  task.requires_approval = true;
  task.approval = {
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    comment: '',
    reason: reason || '需要老板确认'
  };

  // 如果任务完成了，改为 pending_approval 状态
  if (task.status === 'done' || task.status === 'completed') {
    task.status = 'pending_approval';
  }

  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);

  logAudit('system', 'require_approval', task.assigneeId || '', {
    taskId: taskId,
    title: task.title,
    reason: reason
  }, 'success');

  return task;
}

/**
 * 老板审批通过
 * @param {string} taskId
 * @param {string} by - 审批人
 * @param {string} comment - 审批意见
 */
function approveTask(taskId, by, comment) {
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) throw new Error('任务不存在: ' + taskId);
  if (!task.approval || task.approval.status !== 'pending') throw new Error('任务不在待审批状态');

  task.approval.status = 'approved';
  task.approval.approvedBy = by || 'boss';
  task.approval.approvedAt = new Date().toISOString();
  task.approval.comment = comment || '';
  task.status = 'approved';
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);

  logAudit(by || 'boss', 'approve_task', task.assigneeId || '', {
    taskId: taskId,
    title: task.title,
    comment: comment
  }, 'success');

  return task;
}

/**
 * 老板驳回任务
 * @param {string} taskId
 * @param {string} by - 审批人
 * @param {string} comment - 驳回原因
 */
function rejectTask(taskId, by, comment) {
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) throw new Error('任务不存在: ' + taskId);
  if (!task.approval || task.approval.status !== 'pending') throw new Error('任务不在待审批状态');

  task.approval.status = 'rejected';
  task.approval.approvedBy = by || 'boss';
  task.approval.approvedAt = new Date().toISOString();
  task.approval.comment = comment || '';
  task.status = 'rejected';
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);

  logAudit(by || 'boss', 'reject_task', task.assigneeId || '', {
    taskId: taskId,
    title: task.title,
    reason: comment
  }, 'success');

  return task;
}

/**
 * 获取待审批任务列表
 * @returns {Array}
 */
function getPendingApprovals() {
  var tasks = loadTasks();
  return tasks.filter(function(t) {
    return t.approval && t.approval.status === 'pending';
  }).map(function(t) {
    return {
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      assigneeId: t.assigneeId,
      priority: t.priority || 'medium',
      score: t.score || null,
      approval: t.approval,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    };
  });
}

/**
 * 任务完成后自动评分并检查是否需要审批
 * @param {string} taskId
 * @param {string} result
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function autoScoreAndApproval(taskId, result, options) {
  var resultData = {};

  // 1. 自动评分
  try {
    var scoreResult = await scoreTask(taskId, result, options);
    resultData.scored = true;
    resultData.score = scoreResult;
  } catch(e) {
    resultData.scored = false;
    resultData.scoreError = e.message;
  }

  // 2. 检查是否需要审批
  var tasks = loadTasks();
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (task && task.requires_approval) {
    try {
      requireApproval(taskId, '任务完成，需老板审批');
      resultData.requireApproval = true;
    } catch(e) {
      resultData.requireApproval = false;
      resultData.approvalError = e.message;
    }
  } else {
    resultData.requireApproval = false;
  }

  return resultData;
}

// ========== 导出 ==========

module.exports = {
  // 质量评分
  scoreTask: scoreTask,
  getTaskScore: getTaskScore,
  getAgentQualityReport: getAgentQualityReport,
  getOverallReport: getOverallReport,

  // 审批流程
  requireApproval: requireApproval,
  approveTask: approveTask,
  rejectTask: rejectTask,
  getPendingApprovals: getPendingApprovals,

  // 审计日志
  logAudit: logAudit,
  queryAuditLog: queryAuditLog,

  // 综合流程
  autoScoreAndApproval: autoScoreAndApproval,

  // 内部工具（供测试用）
  callAIScoring: callAIScoring,
  ruleBasedScoring: ruleBasedScoring
};
