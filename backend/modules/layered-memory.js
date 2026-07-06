/**
 * layered-memory.js — 分层记忆管理器
 * 
 * 架构：
 *   Level 1: 工作记忆（当前对话上下文，保存在内存中）
 *   Level 2: 核心记忆（结构化持久存储，core-memory.json 升级版）
 *   Level 3: 知识库（长期不变的知识，knowledge-base.json）
 * 
 * 核心机制：
 *   - 自动摘要：对话超过阈值后压缩成摘要
 *   - 重要性评分：计算每条对话/决策的重要性分数
 *   - 遗忘曲线：低分 + 长时间未访问 = 自动压缩
 *   - 按需 RAG：BM25 + 标签聚合，优于简单关键词搜索
 *   - 会话窗口管理：保持上下文长度的智能控制
 */

const fs = require('fs');
const path = require('path');
const coreMemory = require('./core-memory.js');

const BASE = path.join(__dirname, '..');
const MEMORY_DIR = path.join(BASE, 'memory');
const CEOMEM_PATH = path.join(BASE, 'memory-ai_ceo.json');

// ========== 配置 ==========
const CONFIG = {
  // 对话窗口
  maxShortTerm: 12,          // 保留的完整对话轮次
  summaryThreshold: 8,       // 超过该轮次开始考虑压缩
  contextWindowSize: 4000,   // 系统提示词中上下文最大字符数
  
  // 重要性评分
  importanceWeights: {
    hasUserCommand: 3.0,     // 包含用户指令
    containsDecision: 2.5,   // 包含决策
    mentionedByUser: 2.0,    // 用户主动提及
    hasTechnical: 1.5,       // 技术细节
    hasError: 1.0,           // 错误信息
    isRecent: 0.8,           // 近期
    hasAction: 0.5,          // 有后续动作
    isGreeting: -1.0         // 问候/闲聊
  },
  
  // 遗忘
  decayDays: 14,             // 14天后开始衰减
  decayRate: 0.1,            // 每天衰减 10%
  compressionThreshold: 3,   // 相似记忆 >=3 条时压缩
  maxUncompressed: 50,       // 核心记忆库最大未压缩条目
  maxCompressed: 30          // 压缩后摘要最大条目
};

// ========== 记忆条目结构 ==========
/*
{
  id: 'mem_xxx',
  content: '...',
  summary: null | '摘要',
  type: 'conversation' | 'decision' | 'task' | 'knowledge' | 'summary',
  tags: ['tag1', 'tag2'],
  importance: 0.0-10.0,
  timestamp: ISO,
  lastAccess: ISO,
  accessCount: 0,
  compressed: false,
  children: ['id1', 'id2']  // 被压缩的原始条目IDs
}
*/

// ========== 核心功能 ==========

/**
 * 计算记忆条目的重要性分数
 */
function calcImportance(entry) {
  if (typeof entry.importance === 'number' && entry.importance !== undefined) return entry.importance;
  
  let score = 1.0; // 基础分
  const content = (entry.content || '').toLowerCase();
  const tags = entry.tags || [];
  
  // 用户命令关键词
  const cmdKeywords = ['执行', '分配', '派任务', '去办', '检查', '修', '改', '重新', '命令', '指令', '安排'];
  cmdKeywords.forEach(kw => {
    if (content.includes(kw)) score += CONFIG.importanceWeights.hasUserCommand;
  });
  
  // 决策关键词
  const decKeywords = ['决定', '采用', '方案', '选择', '同意', '确认', '批准', '驳回'];
  decKeywords.forEach(kw => {
    if (content.includes(kw)) score += CONFIG.importanceWeights.containsDecision;
  });
  
  // 用户明确提及
  if (content.includes('老板') || content.includes('老板说') || content.includes('用户')) 
    score += CONFIG.importanceWeights.mentionedByUser;
  
  // 技术细节
  const techKeywords = ['代码', '函数', 'api', '端口', '路径', '文件', '配置', '修改', '部署'];
  techKeywords.forEach(kw => {
    if (content.includes(kw)) score += CONFIG.importanceWeights.hasTechnical * 0.3;
  });
  
  // 错误
  if (content.includes('错误') || content.includes('失败') || content.includes('异常') || content.includes('崩溃'))
    score += CONFIG.importanceWeights.hasError;
  
  // 近期加分（3天内）
  const age = Date.now() - new Date(entry.timestamp || Date.now()).getTime();
  const days = age / (24 * 60 * 60 * 1000);
  if (days < 3) score += CONFIG.importanceWeights.isRecent;
  if (days < 1) score += 0.5; // 24小时内额外加分
  
  // 动作附加
  if (tags.includes('assign') || tags.includes('完成任务') || tags.some(t => t.includes('tool')))
    score += CONFIG.importanceWeights.hasAction;
  
  // 闲聊降权
  if (content.length < 30 && (content.includes('你好') || content.includes('hi') || content.includes('在吗') || content.includes('嗯') || content === 'ok' || content === '好的'))
    score += CONFIG.importanceWeights.isGreeting;
  
  return Math.max(0, Math.min(10, parseFloat(score.toFixed(1))));
}

/**
 * 加载 CEO 记忆
 */
function loadCEOMemory() {
  try {
    const raw = fs.readFileSync(CEOMEM_PATH, 'utf-8');
    const m = JSON.parse(raw);
    if (!m.decisions) m.decisions = [];
    if (!m.conversations) m.conversations = [];
    if (!m.sessionSummary) m.sessionSummary = '';
    if (!m.memory) m.memory = {};
    return m;
  } catch(e) {
    return { decisions: [], conversations: [], memory: {}, sessionSummary: '' };
  }
}

function saveCEOMemory(m) {
  try {
    if (!m.decisions) m.decisions = [];
    if (!m.conversations) m.conversations = [];

    // === 版本快照：在截断前保存完整数据快照 ===
    const versionsDir = path.join(MEMORY_DIR, 'versions');
    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
    const snapshotPath = path.join(versionsDir, `ceo-${ts}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(m, null, 2), 'utf-8');

    // 保留最近 100 个快照，删除最旧的
    try {
      const snapshots = fs.readdirSync(versionsDir)
        .filter(f => f.startsWith('ceo-') && f.endsWith('.json'))
        .sort();
      if (snapshots.length > 100) {
        snapshots.slice(0, snapshots.length - 100).forEach(f => {
          fs.unlinkSync(path.join(versionsDir, f));
        });
      }
    } catch(e) {}
    // === 版本快照结束 ===

    if (m.decisions.length > 200) m.decisions = m.decisions.slice(-200);
    if (m.conversations.length > 200) m.conversations = m.conversations.slice(-200);
    fs.writeFileSync(CEOMEM_PATH, JSON.stringify(m, null, 2), 'utf-8');
  } catch(e) {}
}

/**
 * 对一段对话内容生成摘要
 */
function generateSummary(conversations) {
  if (!conversations || conversations.length === 0) return '';
  
  const roles = {};
  conversations.forEach(c => {
    const role = c.role || 'unknown';
    if (!roles[role]) roles[role] = [];
    const text = typeof c.content === 'string' ? c.content : (c.content?.text || JSON.stringify(c.content));
    roles[role].push(text);
  });
  
  const parts = [];
  Object.keys(roles).forEach(role => {
    const count = roles[role].length;
    const avgLen = Math.round(roles[role].reduce((a, b) => a + b.length, 0) / count);
    const first = roles[role][0].substring(0, 80);
    const last = roles[role][count - 1].substring(0, 80);
    parts.push(`${role}(${count}条, 均${avgLen}字): 首"${first}..." 末"${last}..."`);
  });
  
  // 提取关键词
  const allText = conversations.map(c => typeof c.content === 'string' ? c.content : '').join('\n');
  const words = allText.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
  
  parts.push(`关键词: ${topWords.join(', ')}`);
  
  return parts.join(' | ');
}

/**
 * 压缩旧对话：将低重要度的旧 conversation 压缩为摘要
 */
function compressOldConversations(ceoMem) {
  const now = Date.now();
  const cutoff = now - CONFIG.decayDays * 24 * 60 * 60 * 1000;
  
  const oldConvs = ceoMem.conversations.filter(c => {
    const t = new Date(c.timestamp || c.createdAt || now).getTime();
    return t < cutoff;
  });
  
  if (oldConvs.length < CONFIG.compressionThreshold) return { compressed: 0 };

  // === 归档原始对话：压缩前写入 JSONL ===
  try {
    const archiveDir = path.join(MEMORY_DIR, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    const archiveFile = path.join(archiveDir, `conversations-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const lines = oldConvs.map(c => JSON.stringify(c)).join('\n') + '\n';
    fs.appendFileSync(archiveFile, lines, 'utf-8');
  } catch(e) {}
  // === 归档结束 ===
  
  // 按重要性分组
  const grouped = {};
  oldConvs.forEach(c => {
    const imp = calcImportance(c);
    const key = imp < 3 ? 'low' : imp < 6 ? 'medium' : 'high';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });
  
  let compressed = 0;
  Object.entries(grouped).forEach(([level, convs]) => {
    if (convs.length < CONFIG.compressionThreshold) return;
    
    const summary = generateSummary(convs);
    const avgImp = convs.reduce((a, c) => a + calcImportance(c), 0) / convs.length;
    
    const summaryEntry = {
      id: 'sum_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      content: `【${level}优先级摘要】${summary}`,
      role: 'system',
      type: 'compressed_summary',
      level: level,
      importance: parseFloat((avgImp * 0.7).toFixed(1)), // 稍微降权
      timestamp: new Date().toISOString(),
      originalCount: convs.length,
      originalIds: convs.map(c => c.id).filter(Boolean)
    };
    
    // 移除旧记录
    convs.forEach(c => {
      const idx = ceoMem.conversations.indexOf(c);
      if (idx >= 0) ceoMem.conversations.splice(idx, 1);
    });
    
    // 添加摘要
    ceoMem.conversations.push(summaryEntry);
    compressed += convs.length;
  });
  
  return { compressed };
}

/**
 * 构建上下文字符串（用于注入 CEO 系统提示词）
 */
function buildContext(ceoMem, query) {
  const parts = [];
  
  // 1. 近期高重要性决策
  const recentDecisions = [...ceoMem.decisions]
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 5);
  
  if (recentDecisions.length > 0) {
    parts.push('【近期重要决策】');
    recentDecisions.forEach((d, i) => {
      const text = typeof d.content === 'string' ? d.content : (d.content?.text || '');
      const imp = d.importance ? `(重要度:${d.importance})` : '';
      parts.push(`${i+1}. ${imp} ${text.substring(0, 150)}`);
    });
  }
  
  // 2. 核心记忆库语义检索
  try {
    const searchResult = coreMemory.semanticSearch(query || '', { k: 5 });
    if (searchResult.ok && searchResult.results.length > 0) {
      parts.push('\n【相关记忆检索】');
      searchResult.results.forEach((r, i) => {
        if (r.score > 0.1) {
          parts.push(`${i+1}. [${r.type}][${r.priority}] ${r.content.substring(0, 200)}`);
        }
      });
    }
  } catch(e) {}
  
  // 3. 会话摘要
  if (ceoMem.sessionSummary) {
    parts.push('\n【历史会话摘要】');
    parts.push(ceoMem.sessionSummary.substring(0, 500));
  }
  
  // 4. 活跃任务
  try {
    const tasksPath = path.join(BASE, 'tasks-v2.json');
    if (fs.existsSync(tasksPath)) {
      const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8') || '[]');
      if (tasks.length > 0) {
        const statusOrder = { active: 0, pending: 1, in_progress: 2, completed: 3, cancelled: 4, failed: 5 };
        const sorted = tasks
          .sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99))
          .slice(0, 8);
        parts.push('\n【活跃任务】');
        sorted.forEach(t => {
          parts.push(`- [${t.status || '未知'}] ${(t.title || t.description || '无标题').substring(0, 80)}`);
        });
      }
    }
  } catch(e) {}
  
  return parts.join('\n');
}

/**
 * 上下文窗口管理器 — 智能压缩对话历史
 */
function manageContextWindow(messages, ceoMem) {
  // 分离 system 和 普通消息
  const systemMsgs = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  
  // 保留完整的 recent 对话
  let recent = nonSystem.slice(-CONFIG.maxShortTerm);
  let older = nonSystem.slice(0, -CONFIG.maxShortTerm);
  
  // 如果 older 不够多，直接返回
  if (older.length < 3) {
    return { messages, summaryGenerated: false };
  }
  
  // 生成旧的摘要
  const summary = generateSummary(older);
  
  // 更新 CEO 记忆中的会话摘要
  if (summary && summary.length > 20) {
    ceoMem.sessionSummary = summary;
    saveCEOMemory(ceoMem);
  }
  
  // 构建新的消息数组
  const summaryMsg = {
    role: 'system',
    content: `【之前对话共 ${older.length} 轮摘要】\n${summary.substring(0, 600)}`
  };
  
  return {
    messages: [...systemMsgs, summaryMsg, ...recent],
    summaryGenerated: true
  };
}

/**
 * 将一条重要对话/决策记录到核心记忆库
 */
async function recordImportantEvent(params) {
  const { content, type, tags, priority } = params;
  if (!content || content.length < 10) return { ok: false, error: '内容太短' };
  
  // 使用 core-memory 的写入接口
  const result = await coreMemory.writeMemory({
    content: content.trim(),
    tags: tags || [],
    priority: priority || 'medium',
    type: type || 'general',
    timestamp: new Date().toISOString()
  });
  
  return result;
}

/**
 * 全量记忆检索（融合搜索）
 */
async function searchAll(query, options = {}) {
  const limit = options.limit || 8;
  const results = [];
  
  // 1. 核心记忆库语义搜索
  try {
    const memSearch = coreMemory.semanticSearch(query, { k: Math.min(limit, 10) });
    if (memSearch.ok) {
      memSearch.results.forEach(r => results.push({
        source: 'core_memory',
        content: r.content,
        score: r.score,
        tags: r.tags,
        type: r.type,
        priority: r.priority,
        timestamp: r.timestamp
      }));
    }
  } catch(e) {}
  
  // 2. CEO 记忆中的决策
  try {
    const ceoMem = loadCEOMemory();
    const q = query.toLowerCase();
    (ceoMem.decisions || []).forEach(d => {
      const text = typeof d.content === 'string' ? d.content : '';
      if (text.toLowerCase().includes(q)) {
        results.push({
          source: 'ceo_decisions',
          content: text.substring(0, 300),
          score: 0.5,
          timestamp: d.timestamp || d.createdAt
        });
      }
    });
  } catch(e) {}
  
  // 3. 知识库
  try {
    const kb = require('./shared-memory.js');
    const kbResults = kb.searchKnowledge(query);
    if (kbResults && kbResults.length > 0) {
      kbResults.slice(0, 3).forEach(e => results.push({
        source: 'knowledge_base',
        content: `[${e.title}] ${e.content.substring(0, 200)}`,
        score: 0.4,
        tags: e.tags,
        timestamp: e.updatedAt
      }));
    }
  } catch(e) {}
  
  // 按分数降序 + 去重
  const seen = new Set();
  const deduped = results
    .filter(r => {
      const key = r.content.substring(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
  
  return { ok: true, query, results: deduped, total: results.length };
}

/**
 * 定期维护：压缩 + 清理
 */
function maintenance() {
  try {
    const ceoMem = loadCEOMemory();
    const convCount = (ceoMem.conversations || []).length;
    
    // 更新每条记录的重要性分数
    (ceoMem.decisions || []).forEach(d => {
      d.importance = d.importance || calcImportance(d);
    });
    (ceoMem.conversations || []).forEach(c => {
      c.importance = c.importance || calcImportance(c);
    });
    
    // 压缩旧的对话
    const result = compressOldConversations(ceoMem);
    if (result.compressed > 0) {
      saveCEOMemory(ceoMem);
    }
    
    // 清理核心记忆库中的低分条目
    try {
      const coreMem = coreMemory.loadCore();
      const now = Date.now();
      const before = coreMem.length;
      
      // 移除低分 + 30天未访问 + 非高优先级的条目
      coreMem = coreMem.filter(m => {
        const lastAccess = new Date(m.lastAccess || m.timestamp || now).getTime();
        const age = (now - lastAccess) / (24 * 60 * 60 * 1000);
        const imp = calcImportance(m);
        return !(age > CONFIG.decayDays && imp < 3 && m.priority !== 'high');
      });
      
      if (coreMem.length < before) {
        fs.writeFileSync(coreMemory.CORE_FILE, JSON.stringify(coreMem, null, 2), 'utf-8');
      }
    } catch(e) {}
    
    return {
      conversationsBefore: convCount,
      conversationsAfter: (ceoMem.conversations || []).length,
      compressed: result.compressed || 0
    };
  } catch(e) {
    return { error: e.message };
  }
}

// ========== 版本回溯功能 ==========

/**
 * 从归档中恢复原始对话
 * @param {string} id - 被压缩的 conversation id
 * @returns {{ found: boolean, record: object|null, archivedConversations: object[] }}
 */
function restoreConversation(id) {
  try {
    const archiveDir = path.join(MEMORY_DIR, 'archive');
    if (!fs.existsSync(archiveDir)) {
      return { found: false, record: null, archivedConversations: [] };
    }

    const files = fs.readdirSync(archiveDir)
      .filter(f => f.startsWith('conversations-') && f.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const filePath = path.join(archiveDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const allRecords = [];
      let foundRecord = null;

      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          allRecords.push(record);
          if (record.id === id) {
            foundRecord = record;
          }
        } catch(e) {
          // 跳过格式错误的行
        }
      }

      if (foundRecord) {
        return {
          found: true,
          record: foundRecord,
          archivedConversations: allRecords,
          sourceFile: file
        };
      }
    }

    return { found: false, record: null, archivedConversations: [] };
  } catch(e) {
    return { found: false, record: null, archivedConversations: [], error: e.message };
  }
}

/**
 * 获取版本快照历史列表
 * @param {object} options - { limit: number }
 * @returns {{ ok: boolean, snapshots: object[] }}
 */
function getVersionHistory(options = {}) {
  try {
    const versionsDir = path.join(MEMORY_DIR, 'versions');
    if (!fs.existsSync(versionsDir)) {
      return { ok: true, snapshots: [] };
    }

    const limit = options.limit || 50;
    const snapshots = fs.readdirSync(versionsDir)
      .filter(f => f.startsWith('ceo-') && f.endsWith('.json'))
      .sort()
      .slice(-limit)
      .reverse()
      .map(f => {
        const fp = path.join(versionsDir, f);
        let info = {
          filename: f,
          timestamp: f.replace('ceo-', '').replace('.json', '').replace(/-/g, ':')
        };
        try {
          const stat = fs.statSync(fp);
          info.fileSize = stat.size;
          info.fileSizeKB = Math.round(stat.size / 1024);
        } catch(e) {
          info.fileSize = 0;
        }
        try {
          const raw = fs.readFileSync(fp, 'utf-8');
          const data = JSON.parse(raw);
          info.decisions = (data.decisions || []).length;
          info.conversations = (data.conversations || []).length;
          info.hasSessionSummary = !!data.sessionSummary;
        } catch(e) {
          info.decisions = 0;
          info.conversations = 0;
          info.parseError = true;
        }
        return info;
      });

    return { ok: true, snapshots };
  } catch(e) {
    return { ok: false, snapshots: [], error: e.message };
  }
}

/**
 * 恢复指定时间戳的版本
 * @param {string} timestamp - ISO 时间戳，或靠近的快照文件名关键词
 * @returns {{ ok: boolean, restored: string|null, matchedFile: string|null, error?: string }}
 */
function restoreVersion(timestamp) {
  try {
    const versionsDir = path.join(MEMORY_DIR, 'versions');
    if (!fs.existsSync(versionsDir)) {
      return { ok: false, restored: null, matchedFile: null, error: 'versions 目录不存在' };
    }

    // 将传入的 ISO 时间戳转为快照文件名格式
    const tsNormalized = timestamp.replace(/:/g, '-').replace(/\.\d+Z$/, '').replace(/Z$/, '');

    const snapshots = fs.readdirSync(versionsDir)
      .filter(f => f.startsWith('ceo-') && f.endsWith('.json'))
      .sort();

    if (snapshots.length === 0) {
      return { ok: false, restored: null, matchedFile: null, error: '没有找到快照文件' };
    }

    // 精确匹配：尝试直接查找包含该时间戳的文件名
    let match = snapshots.find(f => f.includes(tsNormalized));

    // 模糊匹配：找最接近的
    if (!match) {
      const targetTime = new Date(timestamp).getTime();
      if (isNaN(targetTime)) {
        return { ok: false, restored: null, matchedFile: null, error: '无效的时间戳格式' };
      }

      let minDiff = Infinity;
      for (const f of snapshots) {
        const ft = f.replace('ceo-', '').replace('.json', '').replace(/-/g, ':');
        const ftTime = new Date(ft).getTime();
        if (!isNaN(ftTime)) {
          const diff = Math.abs(ftTime - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            match = f;
          }
        }
      }
    }

    if (!match) {
      return { ok: false, restored: null, matchedFile: null, error: '未找到匹配的快照' };
    }

    // 读取快照并写回主文件
    const snapshotPath = path.join(versionsDir, match);
    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    fs.writeFileSync(CEOMEM_PATH, JSON.stringify(snapshotData, null, 2), 'utf-8');

    return {
      ok: true,
      restored: match,
      matchedFile: match,
      stats: {
        decisions: (snapshotData.decisions || []).length,
        conversations: (snapshotData.conversations || []).length
      }
    };
  } catch(e) {
    return { ok: false, restored: null, matchedFile: null, error: e.message };
  }
}

module.exports = {
  // 核心功能
  calcImportance,
  generateSummary,
  compressOldConversations,
  buildContext,
  manageContextWindow,
  searchAll,
  recordImportantEvent,
  maintenance,
  
  // CEO 记忆代理
  loadCEOMemory,
  saveCEOMemory,
  
  // 版本回溯
  restoreConversation,
  getVersionHistory,
  restoreVersion,
  
  // 配置
  CONFIG
};
