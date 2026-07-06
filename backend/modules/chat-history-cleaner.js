/**
 * chat-history-cleaner.js — 工作台历史消息自动清理引擎
 *
 * 功能：
 * 1. 当 localStorage 消息过多时，自动提取重要消息生成摘要
 * 2. 清理旧对话历史，仅保留最近 N 条 + 重要历史摘要
 * 3. 提供 API 供前端调用检查状态和触发清理
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SUMMARY_FILE = path.join(BASE, 'chat-summaries.json');

// ========== 持久化 ==========

let cache = null;
function load() {
  if (cache) return cache;
  try {
    if (fs.existsSync(SUMMARY_FILE)) {
      cache = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
    }
  } catch(e) { /* ignore */ }
  if (!cache) {
    cache = { summaries: [], compressedCount: 0, lastCleanAt: null };
    save();
  }
  return cache;
}
function save() {
  cache.lastCleanAt = new Date().toISOString();
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(cache, null, 2));
}

// ========== 重要消息评分 ==========

/**
 * 判断消息的重要性分数 0-100
 * 按角色、内容长度、关键词、是否含代码/文件、是否系统消息评分
 */
function calcImportance(msg) {
  if (!msg) return 0;
  let score = 10; // baseline

  const role = msg.role || '';
  const content = (msg.content || msg.text || '').toString();
  const type = msg.type || '';

  // 角色权重
  if (role === 'assistant') score += 15;
  else if (role === 'system') score += 20; // 系统消息通常重要

  // 类型权重
  if (type === 'tool_call') score += 15;
  else if (type === 'file_op') score += 10;
  else if (type === 'thinking') score -= 5; // 思考过程不重要

  // 内容长度权重（长消息通常包含更多信息）
  if (content.length > 500) score += 15;
  else if (content.length > 100) score += 5;

  // 含代码块
  if (content.includes('```')) score += 15;
  if (content.includes('<pre')) score += 10;

  // 含结构化内容
  if (content.includes('##') || content.includes('# ')) score += 10;
  if (/【.*?】/.test(content)) score += 5;
  if (content.includes('|') && content.includes('\n')) score += 5; // 表格

  // 关键词权重
  const keyTerms = [
    '修复', '完成', '上线', '部署', '发布', '解决', '成功',
    'critical', '紧急', '重要', '方案', '决策', '决定',
    '目标', '规划', '架构', '设计', '总结', '报告',
    'api', 'bug', 'error', '报错', '失败', '异常',
    '图', 'demo', 'mermaid', '流程图', '时序图',
    '版本', 'v1', 'v2', '发布', '改进',
    '问题', '原因', '分析', '影响', '解决', '建议',
    '告警', '通知', '提醒', '注意'
  ];
  keyTerms.forEach(function(term) {
    if (content.toLowerCase().includes(term)) score += 3;
  });

  // 错误/失败相关加重
  if (/err(or|ror)|失败|异常|5080|无法|超时|timeout/i.test(content)) score += 8;
  if (/✅|❌|⚠️|🚨/.test(content)) score += 5;

  // 含文件/数据引用
  if (msg.files || msg.fileName) score += 10;

  // 极小消息
  if (content.length < 20) score -= 3;

  return Math.min(Math.max(score, 0), 100);
}

/**
 * 提取重要消息生成摘要
 */
function extractSummary(messages) {
  if (!messages || messages.length === 0) return null;

  // 按重要性评分
  const scored = messages.map(function(m, i) {
    return { index: i, msg: m, importance: calcImportance(m) };
  });

  // 排序取前 10% 或至少 10 条
  const keepCount = Math.max(10, Math.ceil(scored.length * 0.1));
  scored.sort(function(a, b) { return b.importance - a.importance; });

  const important = scored.slice(0, keepCount).sort(function(a, b) { return a.index - b.index; });

  return {
    totalOriginals: messages.length,
    extractedCount: important.length,
    extractedAt: new Date().toISOString(),
    items: important.map(function(item) {
      const m = item.msg;
      return {
        role: m.role || m.type || 'unknown',
        content: (m.content || m.text || '').toString().substring(0, 500),
        importance: item.importance,
        time: m.time || m.timestamp || null,
        hasCode: (m.content || '').includes('```') || (m.content || '').includes('<pre'),
        isSystem: m.role === 'system'
      };
    })
  };
}

// ========== 清理建议生成 ==========

/**
 * 根据消息数量、总长度、localStorage 上限计算清理建议
 * @param {number} msgCount 消息总数
 * @param {number} estimatedSize 估算的 JSON 字符串长度（字节）
 * @returns {object} 清理建议
 */
function getCleanupAdvice(msgCount, estimatedSize) {
  const data = load();
  const LS_LIMIT = 5 * 1024 * 1024; // 5MB localStorage 限制
  const usage = estimatedSize / LS_LIMIT;
  let urgency = 'none';

  if (usage > 0.8) urgency = 'critical';
  else if (usage > 0.6) urgency = 'high';
  else if (usage > 0.4) urgency = 'medium';
  else if (msgCount > 200) urgency = 'low';

  // 清理策略
  const keepLatest = Math.min(msgCount, 50); // 保留最新 50 条
  const compressable = msgCount - keepLatest; // 可以被压缩的条数

  return {
    ok: true,
    status: {
      messageCount: msgCount,
      estimatedSizeKB: Math.round(estimatedSize / 1024),
      localStorageLimitMB: 5,
      usagePercent: Math.round(usage * 100),
      urgency: urgency
    },
    advice: {
      keepLatest: keepLatest,
      compressable: compressable > 0 ? compressable : 0,
      canExtractSummary: compressable > 10
    },
    totalCleanups: data.compressedCount || 0,
    lastClean: data.lastCleanAt
  };
}

/**
 * 对一批消息执行压缩：提取重要消息为摘要，保留最近 N 条
 */
function compressMessages(messages, opts) {
  if (!messages || messages.length === 0) return null;

  opts = opts || {};
  const keepCount = opts.keepCount || 50;
  const summaryThreshold = opts.summaryThreshold || 10; // 至少多少条旧消息才做摘要

  const totalBefore = messages.length;
  const compressableCount = Math.max(0, totalBefore - keepCount);

  if (compressableCount <= summaryThreshold) {
    return {
      changed: false,
      messageCount: totalBefore,
      reason: '消息数量未达到压缩阈值 (' + summaryThreshold + ')',
      summary: null
    };
  }

  // 提取旧消息（不上诉 keepCount 的部分）的重要摘要
  const oldMessages = messages.slice(0, compressableCount);
  const summary = extractSummary(oldMessages);

  // 保存摘要到持久化
  const data = load();
  if (summary) {
    data.summaries.push({
      id: 'sum_' + Date.now(),
      summary: summary,
      source: opts.source || 'chat_workspace'
    });
    // 只保留最近 50 个摘要
    if (data.summaries.length > 50) data.summaries = data.summaries.slice(-50);
    data.compressedCount = (data.compressedCount || 0) + summary.extractedCount;
    save();
  }

  // 保留最近消息 + 在底部插入一条摘要占位
  const result = messages.slice(compressableCount);
  if (summary && summary.extractedCount > 0) {
    const sumLine = {
      role: 'system',
      type: 'summary',
      content: '📋 已自动清理 ' + totalBefore + ' 条历史消息，提取 ' + summary.extractedCount + ' 条重要记录归档。摘要 ID: ' + (data.summaries.length > 0 ? data.summaries[data.summaries.length - 1].id : ''),
      time: new Date().toISOString()
    };
    result.unshift(sumLine);
  }

  return {
    changed: true,
    messageCount: result.length,
    totalBefore: totalBefore,
    compressed: compressableCount,
    summaryExtracted: summary ? summary.extractedCount : 0,
    summaryId: data.summaries.length > 0 ? data.summaries[data.summaries.length - 1].id : null,
    summary: summary
  };
}

// ========== 摘要查询 ==========

function getSummaries(limit) {
  const data = load();
  return {
    ok: true,
    total: data.summaries.length,
    compressedTotal: data.compressedCount || 0,
    summaries: data.summaries.slice(-(limit || 20)).reverse()
  };
}

function getSummaryById(id) {
  const data = load();
  const s = data.summaries.find(function(s) { return s.id === id; });
  if (!s) return null;
  return { ok: true, summary: s };
}

// ========== HTTP 路由 ==========

function registerCleanerRoutes(registerRoute, parseBody, json) {
  // 检查消息积压状态（供前端判断是否需要清理）
  registerRoute(['POST'], /^\/api\/chat\/history\/check$/, async function(req, res) {
    try {
      const body = await parseBody(req);
      const msgCount = body.messageCount || body.count || 0;
      const estimatedSize = body.estimatedSize || (msgCount * 3000); // 平均每条 ~3KB
      const advice = getCleanupAdvice(msgCount, estimatedSize);
      json(res, advice);
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // 执行压缩（传入完整消息列表，返回压缩后的消息列表）
  registerRoute(['POST'], /^\/api\/chat\/history\/compress$/, async function(req, res) {
    try {
      const body = await parseBody(req);
      if (!body.messages || !Array.isArray(body.messages)) {
        json(res, { ok: false, error: '需要 messages 参数' }, 400);
        return;
      }
      const result = compressMessages(body.messages, {
        keepCount: body.keepCount || 50,
        source: body.source || 'chat_workspace'
      });
      json(res, { ok: true, ...result });
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // 获取历史摘要列表
  registerRoute(['GET'], /^\/api\/chat\/history\/summaries$/, function(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const limit = parseInt(url.searchParams.get('limit')) || 20;
      json(res, getSummaries(limit));
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // 获取单条摘要详情
  registerRoute(['GET'], /^\/api\/chat\/history\/summaries\/([^/]+)$/, function(req, res, m) {
    try {
      const s = getSummaryById(m[1]);
      if (!s) { json(res, { error: '未找到' }, 404); return; }
      json(res, s);
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // 重要消息评分（前端可用于实时高亮）
  registerRoute(['POST'], /^\/api\/chat\/history\/importance$/, async function(req, res) {
    try {
      const body = await parseBody(req);
      if (!body.content) { json(res, { error: '需要 content' }, 400); return; }
      const score = calcImportance({ role: body.role, content: body.content, type: body.type });
      json(res, { ok: true, importance: score, level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low' });
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // 清理统计
  registerRoute(['GET'], /^\/api\/chat\/history\/stats$/, function(req, res) {
    try {
      const data = load();
      json(res, {
        ok: true,
        totalSummaries: data.summaries.length,
        totalCompressedRecords: data.compressedCount || 0,
        lastCleanAt: data.lastCleanAt
      });
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });
}

module.exports = {
  calcImportance,
  getCleanupAdvice,
  compressMessages,
  extractSummary,
  getSummaries,
  getSummaryById,
  registerCleanerRoutes,

  // 用于后端定时检查各 chat-workspace 的 workspace-conv.json
  cleanWorkspaceFile: function() {
    try {
      const wsFile = path.join(BASE, 'workspace-conv.json');
      if (!fs.existsSync(wsFile)) return { ok: true, reason: 'workspace-conv.json 不存在' };
      const data = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
      const msgs = data.messages || [];
      if (msgs.length <= 60) return { ok: true, messageCount: msgs.length, changed: false };
      const result = compressMessages(msgs, { keepCount: 50, source: 'workspace_file' });
      if (result && result.changed) {
        data.messages = result.messages;
        fs.writeFileSync(wsFile, JSON.stringify(data, null, 2));
        return { ok: true, changed: true, before: result.totalBefore, after: result.messageCount };
      }
      return { ok: true, changed: false, messageCount: msgs.length };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }
};
