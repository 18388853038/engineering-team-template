/**
 * Memory API Routes - 记忆系统API接口
 */
const express = require('express');
const { getAgentMemory, getAllMemoryStats, globalMemorySearch, consolidateAllMemories } = require('./agent-memory');

function memoryRoutes(app) {
  const router = express.Router();

  // ========== 存储记忆 ==========
  router.post('/:agentId/memories', (req, res) => {
    try {
      const { agentId } = req.params;
      const { content, type, importance, tags, context, sentiment } = req.body;

      if (!content) {
        return res.status(400).json({ error: '记忆内容不能为空' });
      }

      const memory = getAgentMemory(agentId);
      const result = memory.store(content, {
        type: type || 'experience',
        importance: importance || 5,
        tags: tags || [],
        context: context || '',
        sentiment: sentiment || 'neutral'
      });

      res.json({ success: true, ...result });
    } catch (e) {
      console.error('[Memory API] Store error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 批量存储记忆 ==========
  router.post('/:agentId/memories/batch', (req, res) => {
    try {
      const { agentId } = req.params;
      const { memories } = req.body;

      if (!memories || !Array.isArray(memories)) {
        return res.status(400).json({ error: 'memories 必须是数组' });
      }

      const memory = getAgentMemory(agentId);
      const results = memories.map(m => memory.store(m.content, m));

      res.json({
        success: true,
        stored: results.length,
        results
      });
    } catch (e) {
      console.error('[Memory API] Batch store error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 召回记忆 ==========
  router.get('/:agentId/recall', (req, res) => {
    try {
      const { agentId } = req.params;
      const { q, limit, minImportance, types } = req.query;

      if (!q) {
        return res.status(400).json({ error: '查询内容不能为空' });
      }

      const memory = getAgentMemory(agentId);
      const results = memory.recall(q, {
        limit: parseInt(limit) || 10,
        minImportance: parseInt(minImportance) || 1,
        types: types ? types.split(',') : null
      });

      res.json({
        success: true,
        count: results.length,
        memories: results
      });
    } catch (e) {
      console.error('[Memory API] Recall error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 语义搜索 ==========
  router.get('/:agentId/search', (req, res) => {
    try {
      const { agentId } = req.params;
      const { q, limit } = req.query;

      if (!q) {
        return res.status(400).json({ error: '搜索内容不能为空' });
      }

      const memory = getAgentMemory(agentId);
      const results = memory.search(q, {
        limit: parseInt(limit) || 20
      });

      res.json({
        success: true,
        count: results.length,
        memories: results
      });
    } catch (e) {
      console.error('[Memory API] Search error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 获取记忆列表 ==========
  router.get('/:agentId/memories', (req, res) => {
    try {
      const { agentId } = req.params;
      const { type, limit } = req.query;

      const memory = getAgentMemory(agentId);
      const results = memory.getTimeline({
        type: type || null,
        limit: parseInt(limit) || 50
      });

      res.json({
        success: true,
        count: results.length,
        memories: results
      });
    } catch (e) {
      console.error('[Memory API] List error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 获取单条记忆 ==========
  router.get('/:agentId/memories/:memoryId', (req, res) => {
    try {
      const { agentId, memoryId } = req.params;
      const memory = getAgentMemory(agentId);
      const related = memory.getRelated(parseInt(memoryId));

      res.json({
        success: true,
        related
      });
    } catch (e) {
      console.error('[Memory API] Get error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 更新记忆 ==========
  router.put('/:agentId/memories/:memoryId', (req, res) => {
    try {
      const { agentId, memoryId } = req.params;
      const updates = req.body;

      const memory = getAgentMemory(agentId);
      const result = memory.update(parseInt(memoryId), updates);

      res.json(result);
    } catch (e) {
      console.error('[Memory API] Update error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 删除记忆 ==========
  router.delete('/:agentId/memories/:memoryId', (req, res) => {
    try {
      const { agentId, memoryId } = req.params;
      const memory = getAgentMemory(agentId);
      const result = memory.delete(parseInt(memoryId));

      res.json(result);
    } catch (e) {
      console.error('[Memory API] Delete error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 获取记忆统计 ==========
  router.get('/:agentId/stats', (req, res) => {
    try {
      const { agentId } = req.params;
      const memory = getAgentMemory(agentId);
      const stats = memory.getStats();

      res.json({ success: true, stats });
    } catch (e) {
      console.error('[Memory API] Stats error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 整合记忆 ==========
  router.post('/:agentId/consolidate', (req, res) => {
    try {
      const { agentId } = req.params;
      const memory = getAgentMemory(agentId);
      const result = memory.consolidate();

      res.json(result);
    } catch (e) {
      console.error('[Memory API] Consolidate error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 关联记忆 ==========
  router.post('/:agentId/memories/:memoryId/relate', (req, res) => {
    try {
      const { agentId, memoryId } = req.params;
      const { targetId, relationType, strength } = req.body;

      const memory = getAgentMemory(agentId);
      const result = memory.relate(
        parseInt(memoryId),
        parseInt(targetId),
        relationType || 'related',
        strength || 0.5
      );

      res.json(result);
    } catch (e) {
      console.error('[Memory API] Relate error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 全局搜索 ==========
  router.get('/search/global', (req, res) => {
    try {
      const { q, limit } = req.query;

      if (!q) {
        return res.status(400).json({ error: '搜索内容不能为空' });
      }

      const results = globalMemorySearch(q, {
        limit: parseInt(limit) || 50
      });

      res.json({
        success: true,
        count: results.length,
        memories: results
      });
    } catch (e) {
      console.error('[Memory API] Global search error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 所有Agent统计 ==========
  router.get('/stats/all', (req, res) => {
    try {
      const stats = getAllMemoryStats();
      res.json({ success: true, stats });
    } catch (e) {
      console.error('[Memory API] All stats error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== 整合所有记忆 ==========
  router.post('/consolidate/all', (req, res) => {
    try {
      const result = consolidateAllMemories();
      res.json(result);
    } catch (e) {
      console.error('[Memory API] Consolidate all error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 注册路由
  app.use('/api/memory', router);
  console.log('[Memory] API routes registered: /api/memory/*');
}

module.exports = memoryRoutes;
