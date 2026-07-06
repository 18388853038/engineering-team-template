/**
 * auto-learning.js — Agent自动学习闭环
 * 
 * 任务执行完成→总结经验→存入记忆→下次复用
 * 跨Agent知识共享→技能进化
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(BASE, 'memory');
const KNOWLEDGE_FILE = path.join(BASE, 'knowledge-base.json');

// ========== 1. 任务完成后自动学习 ==========

/**
 * Agent执行完任务后，自动总结并存入记忆
 */
function learnFromTask(agentId, task, result, durationMs) {
  try {
    var learnings = extractLearnings(task, result);
    if (!learnings || learnings.length === 0) return { stored: 0 };
    
    // 1. 存入Agent个人记忆
    var memoryFile = path.join(MEMORY_DIR, 'agent-' + agentId + '.json');
    var memory = loadJSON(memoryFile, { agentId: agentId, experiences: [], skills: {}, stats: { tasksDone: 0, tasksFailed: 0, totalDuration: 0 } });
    
    learnings.forEach(function(l) {
    if (!memory.experiences) memory.experiences = [];
      memory.experiences.push({
        id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: l.type || 'task',
        summary: l.summary || '',
        detail: l.detail || '',
        taskTitle: task.title || '',
        taskPriority: task.priority || 'medium',
        success: l.success !== false,
        durationMs: durationMs || 0,
        timestamp: new Date().toISOString(),
        tags: l.tags || []
      });
    });
    
    // 2. 更新统计
    if (!memory.skills) memory.skills = {};
    if (!memory.stats) memory.stats = { tasksDone: 0, tasksFailed: 0, totalDuration: 0 };
    memory.stats.tasksDone++;
    if (!memory.stats.totalDuration) memory.stats.totalDuration = 0;
    memory.stats.totalDuration += durationMs || 0;
    if (result && result.error) memory.stats.tasksFailed++;
    
    // 3. 更新技能统计
    var skillUsed = matchSkillForTask(task);
    if (skillUsed) {
      if (!memory.skills[skillUsed]) memory.skills[skillUsed] = { uses: 0, successes: 0, failures: 0 };
      memory.skills[skillUsed].uses++;
      if (result && !result.error) memory.skills[skillUsed].successes++;
      else memory.skills[skillUsed].failures++;
    }
    
    // 限制100条经历
    if (memory.experiences.length > 100) memory.experiences = memory.experiences.slice(-100);
    memory.updatedAt = new Date().toISOString();
    
    saveJSON(memoryFile, memory);
    
    // 4. 跨Agent知识共享 — 若有价值的经验写入知识库
    var shared = shareToKnowledgeBase(agentId, learnings);
    
    return { stored: learnings.length, shared: shared };
  } catch(e) {
    console.error('[AutoLearn] 学习失败:', e.message);
    return { stored: 0, error: e.message };
  }
}

/**
 * 从任务结果中提取可学习的经验
 */
function extractLearnings(task, result) {
  if (!task) return [];
  var learnings = [];
  var reply = result || task.result || '';
  
  if (typeof reply === 'string') {
    // 检测是否包含可学习的内容
    if (reply.length > 50) {
      learnings.push({
        type: 'execution',
        summary: (task.title || '任务').substring(0, 40),
        detail: reply.substring(0, 500),
        success: !reply.includes('错误') && !reply.includes('failed'),
        tags: extractTags(task)
      });
    }
  } else if (typeof reply === 'object' && reply) {
    learnings.push({
      type: 'execution',
      summary: task.title || '任务执行',
      detail: JSON.stringify(reply).substring(0, 500),
      success: !reply.error,
      tags: extractTags(task)
    });
  }
  
  // 如果是学习类任务，优先存储
  if (task.tags && task.tags.indexOf('learning') >= 0) {
    learnings.forEach(function(l) { l.type = 'learning'; });
  }
  
  return learnings;
}

/**
 * 提取任务标签
 */
function extractTags(task) {
  var tags = (task.tags || []).slice();
  if (task.priority) tags.push('priority:' + task.priority);
  if (task.schedulerAssigned) tags.push('scheduled');
  return tags;
}

/**
 * 匹配任务所用技能
 */
function matchSkillForTask(task) {
  if (!task || !task.title) return null;
  var title = (task.title || '') + ' ' + (task.description || '');
  var skillMap = {
    '优化|性能': '性能优化',
    '审查|审计|安全': '安全审计',
    '开发|编写|代码': '系统开发',
    '测试': '测试',
    '部署': 'DevOps',
    '设计|原型': '原型设计',
    '数据|分析': '数据分析',
    '文档|报告': '技术写作',
    '架构|设计|规划': '系统架构'
  };
  
  for (var pattern in skillMap) {
    if (new RegExp(pattern).test(title)) return skillMap[pattern];
  }
  return null;
}

// ========== 2. 跨Agent知识共享 ==========

/**
 * 将有价值的经验共享到知识库
 */
function shareToKnowledgeBase(agentId, learnings) {
  if (!learnings || !Array.isArray(learnings)) return 0;
  try {
    var kbData = loadJSON(KNOWLEDGE_FILE, []);
    var kb = Array.isArray(kbData) ? kbData : (kbData.entries || []);
    var shared = 0;
    
    learnings.forEach(function(l) {
      // 只共享有价值的经验
      if (l.summary && l.summary.length > 10 && l.success) {
        // 检测是否已存在类似知识
        if (!Array.isArray(kb)) kb = [];
        var exists = kb.some(function(k) {
          return k.summary === l.summary || (k.agentId === agentId && k.timestamp === l.timestamp);
        });
        
        if (!exists) {
          kb.push({
            id: 'kb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            agentId: agentId,
            summary: l.summary,
            detail: l.detail,
            tags: l.tags || [],
            sharedAt: new Date().toISOString(),
            accessCount: 0
          });
          shared++;
        }
      }
    });
    
    // 限制500条
    if (kb.length > 500) kb = kb.slice(-500);
    if (shared > 0) saveJSON(KNOWLEDGE_FILE, kb);
    return shared;
  } catch(e) { return 0; }
}

// ========== 3. 记忆检索注入 ==========

/**
 * 为Agent檢索相关经验，作为上下文注入
 */
function getRelevantMemories(agentId, task, maxCount) {
  maxCount = maxCount || 5;
  var results = [];
  
  try {
    // 1. 从个人记忆检索
    var memoryFile = path.join(MEMORY_DIR, 'agent-' + agentId + '.json');
    if (fs.existsSync(memoryFile)) {
      var memory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
      var experiences = memory.experiences;
      if (!Array.isArray(experiences)) experiences = [];
      
      // 按相似度排序（基于关键词匹配）
      var keywords = extractKeywords(task);
      var scored = experiences.map(function(exp) {
        var score = 0;
        keywords.forEach(function(kw) {
          if ((exp.summary || '').indexOf(kw) >= 0) score += 3;
          if ((exp.detail || '').indexOf(kw) >= 0) score += 1;
        });
        if (exp.tags) {
          (task.tags || []).forEach(function(t) {
            if (exp.tags.indexOf(t) >= 0) score += 2;
          });
        }
        return { exp: exp, score: score };
      });
      
      scored.sort(function(a, b) { return b.score - a.score; });
      scored.slice(0, maxCount).forEach(function(s) {
        if (s.score > 0) results.push(s.exp);
      });
    }
    
    // 2. 从知识库检索
    if (results.length < maxCount) {
      var kbData = loadJSON(KNOWLEDGE_FILE, []);
      var kb = Array.isArray(kbData) ? kbData : (kbData.entries || []);
      var kbKeywords = extractKeywords(task);
      var kbScored = kb.map(function(k) {
        var score = 0;
        kbKeywords.forEach(function(kw) {
          if ((k.summary || '').indexOf(kw) >= 0) score += 2;
          if ((k.detail || '').indexOf(kw) >= 0) score += 1;
        });
        return { kb: k, score: score };
      });
      
      kbScored.sort(function(a, b) { return b.score - a.score; });
      kbScored.slice(0, maxCount - results.length).forEach(function(s) {
        if (s.score > 0) {
          results.push({ type: 'knowledge', summary: s.kb.summary, detail: s.kb.detail, agentId: s.kb.agentId });
          s.kb.accessCount = (s.kb.accessCount || 0) + 1;
        }
      });
      saveJSON(KNOWLEDGE_FILE, kb);
    }
    
  } catch(e) {
    console.error('[AutoLearn] 检索失败:', e.message);
  }
  
  return results.slice(0, maxCount);
}

/**
 * 从任务提取关键词
 */
function extractKeywords(task) {
  var text = (task.title || '') + ' ' + (task.description || '');
  // 取出中文词汇和英文单词
  var keywords = [];
  var cnWords = text.match(/[一-鿿]{2,}/g);
  if (cnWords) keywords = keywords.concat(cnWords);
  var enWords = text.match(/[a-zA-Z]{3,}/g);
  if (enWords) keywords = keywords.concat(enWords.map(function(w) { return w.toLowerCase(); }));
  return keywords;
}

// ========== 4. 技能进化统计 ==========

/**
 * 获取Agent技能进化报告
 */
function getSkillEvolution(agentId) {
  try {
    var memoryFile = path.join(MEMORY_DIR, 'agent-' + agentId + '.json');
    if (!fs.existsSync(memoryFile)) return { agentId: agentId, skills: {}, experiences: 0 };
    
    var memory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
    var skills = memory.skills || {};
    var stats = memory.stats || {};
    
    // 计算技能成长率
    var evolved = {};
    Object.keys(skills).forEach(function(s) {
      var sk = skills[s];
      evolved[s] = {
        uses: sk.uses || 0,
        successRate: sk.uses > 0 ? Math.round((sk.successes / sk.uses) * 100) : 0,
        failures: sk.failures || 0,
        level: sk.uses > 20 ? 'expert' : sk.uses > 10 ? 'advanced' : sk.uses > 5 ? 'intermediate' : 'beginner'
      };
    });
    
    return {
      agentId: agentId,
      skills: evolved,
      stats: stats,
      experiences: (memory.experiences || []).length,
      lastUpdated: memory.updatedAt
    };
  } catch(e) {
    return { agentId: agentId, error: e.message };
  }
}

// ========== 辅助函数 ==========

function loadJSON(file, defaultVal) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) {}
  return defaultVal;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  learnFromTask: learnFromTask,
  getRelevantMemories: getRelevantMemories,
  getSkillEvolution: getSkillEvolution,
  shareToKnowledgeBase: shareToKnowledgeBase
};
