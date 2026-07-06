/**
 * Agent Memory System - AI员工记忆模块
 * 
 * 功能：
 * 1. 为每个AI员工建立长期记忆
 * 2. 语义搜索相关记忆
 * 3. 记忆重要性评分
 * 4. 自动记忆整合
 * 5. 记忆召回与调用
 */
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'ecompany.db');

let db = null;

function getDB() {
  if (!db) {
    try {
      const Database = require('better-sqlite3');
      db = new Database(DB_PATH);
      initMemoryTables();
    } catch (e) {
      console.log('[Memory] SQLite unavailable:', e.message);
      return null;
    }
  }
  return db;
}

function initMemoryTables() {
  if (!db) return;
  db.exec(`
    -- Agent个人记忆表
    CREATE TABLE IF NOT EXISTS agent_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      memory_type TEXT DEFAULT 'experience',
      importance INTEGER DEFAULT 5,
      tags TEXT DEFAULT '[]',
      keywords TEXT DEFAULT '',
      context TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      recall_count INTEGER DEFAULT 0,
      sentiment TEXT DEFAULT 'neutral',
      embedding_id TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- 记忆关系表（用于关联相关记忆）
    CREATE TABLE IF NOT EXISTS memory_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id_a INTEGER NOT NULL,
      memory_id_b INTEGER NOT NULL,
      relation_type TEXT DEFAULT 'related',
      strength REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (memory_id_a) REFERENCES agent_memories(id),
      FOREIGN KEY (memory_id_b) REFERENCES agent_memories(id)
    );

    -- 记忆会话表（记录每次记忆调用）
    CREATE TABLE IF NOT EXISTS memory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      session_type TEXT DEFAULT 'recall',
      query TEXT DEFAULT '',
      recalled_memories TEXT DEFAULT '[]',
      success INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 记忆统计表
    CREATE TABLE IF NOT EXISTS memory_stats (
      agent_id TEXT PRIMARY KEY,
      total_memories INTEGER DEFAULT 0,
      important_memories INTEGER DEFAULT 0,
      total_recalls INTEGER DEFAULT 0,
      avg_importance REAL DEFAULT 0,
      last_consolidation TEXT,
      knowledge_graph_size INTEGER DEFAULT 0,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(memory_type);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON agent_memories(importance);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON agent_memories(created_at);
  `);
}

/**
 * 记忆系统核心类
 */
class AgentMemory {
  constructor(agentId) {
    this.agentId = agentId;
    this.importanceThreshold = 3;
    this.maxMemories = 1000;
    this.consolidationInterval = 100;
  }

  /**
   * 存储新记忆
   */
  store(content, options = {}) {
    const database = getDB();
    if (!database) return { success: false, error: 'Database unavailable' };

    options = {
      type: 'experience',
      importance: 5,
      tags: [],
      context: '',
      sentiment: 'neutral',
      ...options
    };

    // 提取关键词
    const keywords = this._extractKeywords(content);

    const stmt = database.prepare(`
      INSERT INTO agent_memories 
      (agent_id, content, memory_type, importance, tags, keywords, context, sentiment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      this.agentId,
      content,
      options.type,
      options.importance,
      JSON.stringify(options.tags),
      keywords,
      options.context,
      options.sentiment
    );

    // 更新统计
    this._updateStats();

    // 检查是否需要整合
    this._checkConsolidation();

    return {
      success: true,
      memoryId: result.lastInsertRowid,
      keywords: keywords.split(',')
    };
  }

  /**
   * 召回相关记忆
   */
  recall(query, options = {}) {
    const database = getDB();
    if (!database) return [];

    options = {
      limit: 10,
      minImportance: 1,
      types: null,
      ...options
    };

    const queryKeywords = this._extractKeywords(query).split(',');
    
    // 构建搜索查询
    let sql = `
      SELECT * FROM agent_memories 
      WHERE agent_id = ? 
        AND importance >= ?
    `;
    const params = [this.agentId, options.minImportance];

    if (options.types && options.types.length > 0) {
      sql += ` AND memory_type IN (${options.types.map(() => '?').join(',')})`;
      params.push(...options.types);
    }

    sql += ` ORDER BY 
      (importance * 2 + recall_count) DESC,
      importance DESC,
      last_accessed DESC
    LIMIT ?`;
    params.push(options.limit);

    const memories = database.prepare(sql).all(...params);

    // 更新访问统计
    const updateStmt = database.prepare(`
      UPDATE agent_memories 
      SET access_count = access_count + 1, 
          last_accessed = datetime('now')
      WHERE id = ?
    `);

    memories.forEach(m => updateStmt.run(m.id));

    return memories.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
      relevance: this._calculateRelevance(m.keywords, queryKeywords)
    })).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 语义搜索记忆
   */
  search(query, options = {}) {
    const database = getDB();
    if (!database) return [];

    options = {
      limit: 20,
      fuzzy: true,
      ...options
    };

    const keywords = this._extractKeywords(query);
    const keywordList = keywords.split(',').filter(k => k.length > 1);

    if (keywordList.length === 0) return [];

    // 构建LIKE查询
    const conditions = keywordList.map(() => 'keywords LIKE ?').join(' OR ');
    const params = keywordList.map(k => `%${k}%`);
    
    let sql = `
      SELECT * FROM agent_memories 
      WHERE agent_id = ? 
        AND (${conditions})
      ORDER BY importance DESC, recall_count DESC
      LIMIT ?
    `;

    const results = database.prepare(sql).all(this.agentId, ...params, options.limit);

    return results.map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]'),
      relevance: this._calculateRelevance(m.keywords, keywordList)
    })).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 更新记忆
   */
  update(memoryId, updates) {
    const database = getDB();
    if (!database) return { success: false };

    const allowed = ['content', 'importance', 'tags', 'sentiment'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    
    if (fields.length === 0) return { success: false, error: 'No valid fields to update' };

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => {
      if (f === 'tags') return JSON.stringify(updates[f]);
      return updates[f];
    });

    if (updates.tags) {
      const keywords = this._extractKeywords(updates.content || '');
      const setKeywords = `, keywords = '${keywords}'`;
      database.prepare(`UPDATE agent_memories SET ${sets}${setKeywords} WHERE id = ? AND agent_id = ?`).run(...vals, memoryId, this.agentId);
    } else {
      database.prepare(`UPDATE agent_memories SET ${sets} WHERE id = ? AND agent_id = ?`).run(...vals, memoryId, this.agentId);
    }

    return { success: true };
  }

  /**
   * 删除记忆
   */
  delete(memoryId) {
    const database = getDB();
    if (!database) return { success: false };

    database.prepare('DELETE FROM agent_memories WHERE id = ? AND agent_id = ?').run(memoryId, this.agentId);
    database.prepare('DELETE FROM memory_relations WHERE memory_id_a = ? OR memory_id_b = ?').run(memoryId, memoryId);
    
    this._updateStats();
    return { success: true };
  }

  /**
   * 获取记忆统计
   */
  getStats() {
    const database = getDB();
    if (!database) return null;

    let stats = database.prepare('SELECT * FROM memory_stats WHERE agent_id = ?').get(this.agentId);
    
    if (!stats) {
      // 创建初始统计
      database.prepare(`
        INSERT INTO memory_stats (agent_id) VALUES (?)
      `).run(this.agentId);
      stats = database.prepare('SELECT * FROM memory_stats WHERE agent_id = ?').get(this.agentId);
    }

    const count = database.prepare(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN importance >= 7 THEN 1 ELSE 0 END) as important
      FROM agent_memories WHERE agent_id = ?
    `).get(this.agentId);

    return {
      ...stats,
      total_memories: count.total,
      important_memories: count.important
    };
  }

  /**
   * 记忆整合（合并相似记忆，强化重要记忆）
   */
  consolidate() {
    const database = getDB();
    if (!database) return { success: false };

    const now = new Date().toISOString();

    // 1. 强化高频访问的记忆
    database.prepare(`
      UPDATE agent_memories 
      SET importance = MIN(10, importance + 1)
      WHERE agent_id = ? 
        AND access_count > 5 
        AND importance < 10
    `).run(this.agentId);

    // 2. 降低长期未访问的记忆
    database.prepare(`
      UPDATE agent_memories 
      SET importance = MAX(1, importance - 1)
      WHERE agent_id = ? 
        AND last_accessed < datetime('now', '-30 days')
        AND importance > 1
    `).run(this.agentId);

    // 3. 删除低价值记忆
    database.prepare(`
      DELETE FROM agent_memories 
      WHERE agent_id = ? 
        AND importance <= 1 
        AND recall_count = 0
        AND created_at < datetime('now', '-7 days')
    `).run(this.agentId);

    // 更新整合时间
    database.prepare(`
      UPDATE memory_stats 
      SET last_consolidation = ?, 
          knowledge_graph_size = (SELECT COUNT(*) FROM agent_memories WHERE agent_id = ?)
      WHERE agent_id = ?
    `).run(now, this.agentId, this.agentId);

    this._updateStats();
    return { success: true, consolidatedAt: now };
  }

  /**
   * 获取记忆时间线
   */
  getTimeline(options = {}) {
    const database = getDB();
    if (!database) return [];

    options = {
      limit: 50,
      type: null,
      ...options
    };

    let sql = 'SELECT * FROM agent_memories WHERE agent_id = ?';
    const params = [this.agentId];

    if (options.type) {
      sql += ' AND memory_type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(options.limit);

    return database.prepare(sql).all(...params).map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]')
    }));
  }

  /**
   * 关联记忆
   */
  relate(memoryIdA, memoryIdB, relationType = 'related', strength = 0.5) {
    const database = getDB();
    if (!database) return { success: false };

    database.prepare(`
      INSERT OR REPLACE INTO memory_relations 
      (memory_id_a, memory_id_b, relation_type, strength)
      VALUES (?, ?, ?, ?)
    `).run(memoryIdA, memoryIdB, relationType, strength);

    return { success: true };
  }

  /**
   * 获取相关记忆
   */
  getRelated(memoryId, limit = 5) {
    const database = getDB();
    if (!database) return [];

    const relations = database.prepare(`
      SELECT mr.*, am.content, am.importance 
      FROM memory_relations mr
      JOIN agent_memories am ON (
        (mr.memory_id_a = am.id AND mr.memory_id_b = ?) OR
        (mr.memory_id_b = am.id AND mr.memory_id_a = ?)
      )
      WHERE am.id != ?
      ORDER BY mr.strength DESC
      LIMIT ?
    `).all(memoryId, memoryId, memoryId, limit);

    return relations;
  }

  // ========== 私有方法 ==========

  /**
   * 提取关键词
   */
  _extractKeywords(text) {
    if (!text) return '';
    
    // 移除特殊字符
    let clean = text.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');
    
    // 英文分词
    const words = clean.toLowerCase().match(/[a-z]{3,}/g) || [];
    
    // 中文分词（简单版本）
    const chinese = clean.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    
    // 合并并去重
    const keywords = [...new Set([...words, ...chinese])];
    
    return keywords.slice(0, 20).join(',');
  }

  /**
   * 计算相关性
   */
  _calculateRelevance(memoryKeywords, queryKeywords) {
    if (!memoryKeywords || !queryKeywords || queryKeywords.length === 0) return 0;
    
    const memKws = memoryKeywords.split(',').filter(k => k.length > 1);
    const matches = queryKeywords.filter(q => 
      memKws.some(m => m.includes(q) || q.includes(m))
    );
    
    return matches.length / queryKeywords.length;
  }

  /**
   * 更新统计
   */
  _updateStats() {
    const database = getDB();
    if (!database) return;

    const stats = database.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(importance) as avg_importance,
        SUM(CASE WHEN importance >= 7 THEN 1 ELSE 0 END) as important
      FROM agent_memories WHERE agent_id = ?
    `).get(this.agentId);

    database.prepare(`
      INSERT OR REPLACE INTO memory_stats 
      (agent_id, total_memories, avg_importance, important_memories)
      VALUES (?, ?, ?, ?)
    `).run(this.agentId, stats.total, stats.avg_importance || 0, stats.important);
  }

  /**
   * 检查是否需要整合
   */
  _checkConsolidation() {
    const database = getDB();
    if (!database) return;

    const count = database.prepare(
      'SELECT COUNT(*) as c FROM agent_memories WHERE agent_id = ?'
    ).get(this.agentId);

    if (count.c > this.maxMemories) {
      this.consolidate();
    }
  }
}

/**
 * 全局记忆管理器
 */
class GlobalMemoryManager {
  constructor() {
    this.agentMemories = new Map();
  }

  getAgentMemory(agentId) {
    if (!this.agentMemories.has(agentId)) {
      this.agentMemories.set(agentId, new AgentMemory(agentId));
    }
    return this.agentMemories.get(agentId);
  }

  /**
   * 为所有Agent创建记忆表
   */
  initializeForAllAgents() {
    const database = getDB();
    if (!database) return false;

    const agents = database.prepare('SELECT id FROM agents').all();
    agents.forEach(agent => {
      this.getAgentMemory(agent.id);
    });

    console.log(`[Memory] Initialized for ${agents.length} agents`);
    return true;
  }

  /**
   * 获取所有Agent的记忆统计
   */
  getAllStats() {
    const database = getDB();
    if (!database) return [];

    return database.prepare(`
      SELECT ms.*, a.name_cn, a.icon, a.title
      FROM memory_stats ms
      JOIN agents a ON ms.agent_id = a.id
      ORDER BY ms.total_memories DESC
    `).all();
  }

  /**
   * 跨Agent记忆搜索
   */
  globalSearch(query, options = {}) {
    const database = getDB();
    if (!database) return [];

    options = { limit: 50, ...options };

    const keywords = new AgentMemory('')._extractKeywords(query);
    const keywordList = keywords.split(',').filter(k => k.length > 1);

    if (keywordList.length === 0) return [];

    const conditions = keywordList.map(() => 'keywords LIKE ?').join(' OR ');
    const params = keywordList.map(k => `%${k}%`);

    return database.prepare(`
      SELECT m.*, a.name_cn as agent_name, a.icon as agent_icon
      FROM agent_memories m
      JOIN agents a ON m.agent_id = a.id
      WHERE ${conditions}
      ORDER BY m.importance DESC, m.recall_count DESC
      LIMIT ?
    `).all(...params, options.limit).map(m => ({
      ...m,
      tags: JSON.parse(m.tags || '[]')
    }));
  }

  /**
   * 整合所有Agent的记忆
   */
  consolidateAll() {
    const database = getDB();
    if (!database) return { success: false };

    const agents = database.prepare('SELECT id FROM agents').all();
    const results = [];

    agents.forEach(agent => {
      const memory = this.getAgentMemory(agent.id);
      results.push({
        agentId: agent.id,
        ...memory.consolidate()
      });
    });

    return { success: true, results };
  }
}

// 导出单例
const globalMemory = new GlobalMemoryManager();

module.exports = {
  AgentMemory,
  GlobalMemoryManager,
  getAgentMemory: (agentId) => globalMemory.getAgentMemory(agentId),
  getAllMemoryStats: () => globalMemory.getAllStats(),
  globalMemorySearch: (query, options) => globalMemory.globalSearch(query, options),
  consolidateAllMemories: () => globalMemory.consolidateAll()
};
