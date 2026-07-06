/**
 * eCompany Agent Self-Evolution Engine v2.0
 * 龙·知识进化系统 — Agent 自我学习、积累经验、智商成长
 *
 * 核心转变:
 *   旧: 发现问题 → 修改系统代码 → 消耗 Token 修复假问题
 *   新: 完成任务 → 提炼经验 → 写入知识库 → Agent 下次更聪明
 *
 * 进化闭环:
 *   REFLECT（复盘）→ DISTILL（提炼）→ STORE（入库）→ APPLY（应用）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ========== 知识进化生命周期 ==========

const EVOLUTION_STAGES = {
  TASK_COMPLETED: 'task_completed',    // 任务完成，触发复盘
  REFLECTING: 'reflecting',            // AI 正在反思得失
  DISTILLING: 'distilling',            // 提炼经验方法
  STORING: 'storing',                  // 写入知识库
  READY: 'ready',                      // 知识就绪，下次可用
  FAILED: 'failed'                     // 提炼失败
};

// ========== 知识进化引擎 ==========

class KnowledgeEvolution {
  constructor() {
    this.learningHistory = [];
    this._loadHistory();
  }

  _loadHistory() {
    try {
      const f = path.join(BASE, 'knowledge-evolution.json');
      if (fs.existsSync(f)) {
        this.learningHistory = JSON.parse(fs.readFileSync(f, 'utf-8'));
      }
    } catch(e) {
      this.learningHistory = [];
    }
  }

  _saveHistory() {
    fs.writeFileSync(
      path.join(BASE, 'knowledge-evolution.json'),
      JSON.stringify(this.learningHistory, null, 2)
    );
  }

  /**
   * 从任务完成记录中提炼知识
   * @param {Object} taskRecord - 已完成的任务记录
   * @param {string} taskRecord.taskId - 任务ID
   * @param {string} taskRecord.agentId - 执行 Agent
   * @param {string} taskRecord.description - 任务描述
   * @param {string} taskRecord.result - 执行结果
   * @param {boolean} taskRecord.success - 是否成功
   */
  async learnFromTask(taskRecord) {
    const session = {
      id: `learn_${Date.now()}`,
      taskId: taskRecord.taskId || 'unknown',
      agentId: taskRecord.agentId || 'ai_ceo',
      description: taskRecord.description || '',
      startedAt: new Date().toISOString(),
      stage: EVOLUTION_STAGES.TASK_COMPLETED,
      summary: '',
      insights: [],
      knowledgeAdded: [],
      metrics: { insightCount: 0, knowledgeCount: 0 }
    };

    try {
      // 阶段1: 复盘
      session.stage = EVOLUTION_STAGES.REFLECTING;
      session.summary = this._reflectOnTask(taskRecord);
      
      // 阶段2: 提炼经验
      session.stage = EVOLUTION_STAGES.DISTILLING;
      if (taskRecord.success) {
        session.insights.push({
          type: 'best_practice',
          content: `✅ 成功经验: ${taskRecord.description.substring(0, 100)}`,
          source: taskRecord.agentId,
          confidence: 'high'
        });
      } else {
        session.insights.push({
          type: 'lesson_learned',
          content: `❌ 失败教训: ${taskRecord.result ? taskRecord.result.substring(0, 100) : '未知错误'}`,
          source: taskRecord.agentId,
          confidence: 'high'
        });
      }

      // 阶段3: 写入知识库
      session.stage = EVOLUTION_STAGES.STORING;
      for (const insight of session.insights) {
        try {
          await this._storeInsight(insight);
          session.knowledgeAdded.push(insight.type);
        } catch(e) {
          console.log('[Evolve] 知识入库失败:', e.message);
        }
      }

      session.stage = EVOLUTION_STAGES.READY;
      session.completedAt = new Date().toISOString();
      session.metrics = {
        insightCount: session.insights.length,
        knowledgeCount: session.knowledgeAdded.length
      };

    } catch(e) {
      session.stage = EVOLUTION_STAGES.FAILED;
      session.error = e.message;
    }

    // 记录这次学习会话
    this.learningHistory.push(session);
    this._saveHistory();

    return session;
  }

  /**
   * 简单的任务复盘 — 分析任务结果
   */
  _reflectOnTask(task) {
    if (task.success) {
      return `Agent ${task.agentId} 成功完成任务「${(task.description || '').substring(0, 60)}」: ${(task.result || '').substring(0, 80)}`;
    }
    return `Agent ${task.agentId} 执行「${(task.description || '').substring(0, 60)}」失败: ${(task.result || '').substring(0, 80)}`;
  }

  /**
   * 将提炼的见解存入知识库文件
   */
  async _storeInsight(insight) {
    const knowledgeFile = path.join(BASE, 'knowledge-base.json');
    let kb = [];
    try {
      if (fs.existsSync(knowledgeFile)) {
        kb = JSON.parse(fs.readFileSync(knowledgeFile, 'utf-8'));
      }
    } catch(e) { /* 空知识库 */ }

    kb.push({
      id: `k_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      type: insight.type,
      content: insight.content,
      source: insight.source,
      confidence: insight.confidence || 'medium',
      createdAt: new Date().toISOString(),
      appliedCount: 0
    });

    // 限制知识库大小，保留最近 200 条
    if (kb.length > 200) {
      kb = kb.slice(-200);
    }

    fs.writeFileSync(knowledgeFile, JSON.stringify(kb, null, 2));
  }

  // ========== 数据查询 ==========

  getHistory(limit = 50) {
    return this.learningHistory.slice(-limit).reverse();
  }

  getStats() {
    const total = this.learningHistory.length;
    const successful = this.learningHistory.filter(s => s.stage === EVOLUTION_STAGES.READY).length;
    const failed = this.learningHistory.filter(s => s.stage === EVOLUTION_STAGES.FAILED).length;
    const totalInsights = this.learningHistory.reduce((s, h) => s + h.metrics.insightCount, 0);
    const totalKnowledge = this.learningHistory.reduce((s, h) => s + h.metrics.knowledgeCount, 0);

    // 读知识库大小
    let kbSize = 0;
    try {
      const kb = JSON.parse(fs.readFileSync(path.join(BASE, 'knowledge-base.json'), 'utf-8'));
      kbSize = kb.length;
    } catch(e) {}

    return {
      totalSessions: total,
      successfulSessions: successful,
      failedSessions: failed,
      totalInsights: totalInsights,
      totalKnowledgeAdded: totalKnowledge,
      knowledgeBaseSize: kbSize,
      lastRunAt: total > 0 ? this.learningHistory[this.learningHistory.length - 1].startedAt : null
    };
  }

  getKnowledgeBase() {
    try {
      return JSON.parse(fs.readFileSync(path.join(BASE, 'knowledge-base.json'), 'utf-8'));
    } catch(e) {
      return [];
    }
  }
}

// ========== 全局实例 ==========

const evolution = new KnowledgeEvolution();

// ========== HTTP 路由 ==========

function registerEvolveRoutes(registerRoute, parseBody, json) {
  // POST /api/evolve/learn — 从任务结果学习
  registerRoute(['POST'], /^\/api\/evolve\/learn$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const result = await evolution.learnFromTask({
        taskId: body.taskId,
        agentId: body.agentId || 'ai_ceo',
        description: body.description || '',
        result: body.result || '',
        success: body.success !== false
      });
      json(res, { ok: true, session: result });
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // POST /api/evolve/cycle — 兼容旧前端，改为批量学习入口
  registerRoute(['POST'], /^\/api\/evolve\/cycle$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      // 如果传了任务列表，逐个学习
      const tasks = body.tasks || [];
      const results = [];
      for (const task of tasks) {
        results.push(await evolution.learnFromTask(task));
      }
      json(res, {
        ok: true,
        summary: `学习了 ${results.length} 个任务，成功 ${results.filter(r => r.stage === EVOLUTION_STAGES.READY).length} 个`,
        sessions: results
      });
    } catch(e) {
      json(res, { ok: false, error: e.message }, 500);
    }
  });

  // GET /api/evolve/history — 学习历史
  registerRoute(['GET'], /^\/api\/evolve\/history$/, (req, res) => {
    json(res, { ok: true, history: evolution.getHistory() });
  });

  // GET /api/evolve/stats — 统计数据
  registerRoute(['GET'], /^\/api\/evolve\/stats$/, (req, res) => {
    json(res, { ok: true, ...evolution.getStats() });
  });

  // GET /api/evolve/knowledge — 知识库内容
  registerRoute(['GET'], /^\/api\/evolve\/knowledge$/, (req, res) => {
    json(res, { ok: true, knowledge: evolution.getKnowledgeBase() });
  });

  // GET /api/evolve/detect — 保留兼容，返回知识状态而非问题
  registerRoute(['GET'], /^\/api\/evolve\/detect$/, (req, res) => {
    const stats = evolution.getStats();
    json(res, {
      ok: true,
      issues: [],
      patterns: [],
      total: 0,
      evolution: stats
    });
  });

  // GET /api/evolve/cycles/:id — 兼容旧前端
  registerRoute(['GET'], /^\/api\/evolve\/cycles\/([^/]+)$/, (req, res, m) => {
    const session = evolution.learningHistory.find(s => s.id === m[1]);
    if (!session) {
      json(res, { error: '未找到' }, 404);
      return;
    }
    json(res, { ok: true, cycle: session });
  });
}

module.exports = {
  KnowledgeEvolution,
  evolution,
  registerEvolveRoutes
};
