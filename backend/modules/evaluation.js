/**
 * eCompany Evaluation — 评估回流与 Keep Rate
 * 
 * Harness 核心模块：真实任务完成率、Keep Rate（留存率）、分数计算
 * 
 * Keep Rate 定义：Agent 生成的任务输出，一段时间后有多少还保留在系统中的比例。
 *   - keepRate = 未被修改/回滚的任务数 / 总完成任务数
 *   - 完成任务数：status === 'done' 的任务
 *   - 有效留存数：status === 'done' 且 completed_at 后 N 小时内未被修改的任务
 * 
 * 替代原来"假公式算员工分数"的方案。
 */

const fs = require('fs');
const path = require('path');

const EVAL_PATH = path.join(__dirname, '..', 'evaluation.json');
const TASKS_PATH = path.join(__dirname, '..', 'tasks.json');
const KEEP_WINDOW_HOURS = 24;     // Keep Rate 观察窗口
const SCORE_DECAY_DAYS = 7;       // 分数衰减周期

class EvaluationSystem {
  /**
   * @param {object} [opts]
   * @param {object} [opts.db] - database module (from database.js) for SQLite persistence
   */
  constructor(opts = {}) {
    this.scores = {};       // agentId -> { score, samples, history }
    this.records = [];      // 原始评估记录
    this._db = opts.db || null;
    this.load();
  }

  // ========== 持久化 ==========

  load() {
    if (this._db) {
      // Load from SQLite
      try {
        const scores = this._db.evaluationOps;
        const allScores = scores.getLeaderboard();
        allScores.forEach(s => {
          this.scores[s.agent_id] = {
            lastScore: s.score,
            lastUpdated: s.last_updated,
            totalTasks: s.task_count,
            history: JSON.parse(s.history || '[]')
          };
        });
        const allRecords = scores.getRecords(null, 5000);
        this.records = allRecords.map(r => ({
          ts: r.ts,
          taskId: r.task_id,
          agentId: r.agent_id,
          status: r.status,
          feedback: r.feedback,
          keepRate: r.keep_rate
        }));
      } catch (e) {
        console.error('[Eval] DB load error, falling back:', e.message);
        this._loadJSON();
      }
    } else {
      this._loadJSON();
    }
  }

  _loadJSON() {
    try {
      const raw = fs.readFileSync(EVAL_PATH, 'utf-8');
      const data = JSON.parse(raw);
      this.scores = data.scores || {};
      this.records = data.records || [];
    } catch (e) {
      this.scores = {};
      this.records = [];
    }
  }

  save() {
    if (this._db) {
      // Save via SQLite
      try {
        for (const [agentId, s] of Object.entries(this.scores)) {
          this._db.evaluationOps.saveScore(agentId, {
            score: s.lastScore || 50,
            keepRate: 0,
            completionRate: 0,
            taskCount: s.totalTasks || 0,
            failedCount: 0,
            taskBonus: 0
          });
        }
      } catch (e) { /* silently fail */ }
    } else {
      this._saveJSON();
    }
  }

  _saveJSON() {
    try {
      if (this.records.length > 5000) {
        this.records = this.records.slice(-5000);
      }
      fs.writeFileSync(EVAL_PATH, JSON.stringify({
        scores: this.scores,
        records: this.records,
        lastUpdated: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch (e) { /* silently fail */ }
  }

  // ========== Keep Rate 计算 ==========

  /**
   * 读取当前任务列表
   */
  _loadTasks() {
    if (this._db) {
      try {
        return this._db.taskOps.all().map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assigneeId: t.assignee_id,
          completed_at: t.completed_at,
          updatedAt: t.updated_at,
          createdAt: t.created_at
        }));
      } catch (e) { /* fallback to JSON */ }
    }
    try {
      return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'));
    } catch (e) {
      return [];
    }
  }

  /**
   * 计算某个 agent 的 Keep Rate
   * @param {string} agentId
   * @returns {{ rate, done, kept, total }}
   */
  calculateKeepRate(agentId) {
    const tasks = this._loadTasks();
    const cutoff = Date.now() - KEEP_WINDOW_HOURS * 60 * 60 * 1000;

    // 该 agent 完成的任务
    const agentTasks = tasks.filter(t => t.assigneeId === agentId);
    const done = agentTasks.filter(t => t.status === 'done' || t.status === 'completed');

    // 在观察窗口内且未被回滚/修改的任务
    const kept = done.filter(t => {
      const completedAt = new Date(t.completed_at || t.updatedAt || t.createdAt).getTime();
      return completedAt > cutoff;
    });

    const total = done.length;
    const rate = total > 0 ? (kept.length / total) : 0;

    return { rate: parseFloat(rate.toFixed(4)), done: kept.length, kept: kept.length, total };
  }

  /**
   * 计算任务完成率
   */
  calculateCompletionRate(agentId) {
    const tasks = this._loadTasks();
    const agentTasks = tasks.filter(t => t.assigneeId === agentId);
    const total = agentTasks.length;
    const done = agentTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const failed = agentTasks.filter(t => t.status === 'failed' || t.status === 'cancelled').length;

    return {
      total,
      done,
      failed,
      rate: total > 0 ? parseFloat((done / total).toFixed(4)) : 0,
      failRate: total > 0 ? parseFloat((failed / total).toFixed(4)) : 0
    };
  }

  // ========== 分数计算 ==========

  /**
   * 计算员工综合分数
   * 算法：keepRate × 60 + completionRate × 30 - failRate × 10 + 任务复杂度加权
   */
  calculateScore(agentId) {
    const keep = this.calculateKeepRate(agentId);
    const complete = this.calculateCompletionRate(agentId);

    // 基础分
    let score = (keep.rate * 60) + (complete.rate * 30) - (complete.failRate * 10);

    // 任务量加分（做得多且做得好该加分）
    const taskBonus = Math.min(complete.total, 50) * 0.2;
    score += taskBonus;

    // 保底分（避免新员工分数过低）
    if (score < 0) score = 0;
    if (complete.total === 0) score = 50; // 暂无任务时默认中等分数

    // 历史分数衰减
    const history = this.scores[agentId];
    if (history && history.lastScore !== undefined) {
      const age = Date.now() - (history.lastUpdated || 0);
      const decayDays = age / (24 * 60 * 60 * 1000);
      if (decayDays > SCORE_DECAY_DAYS) {
        // 超过衰减周期，向默认分靠拢
        score = score * 0.7 + 50 * 0.3;
      }
    }

    return {
      score: parseFloat(score.toFixed(1)),
      keepRate: keep.rate,
      completionRate: complete.rate,
      taskCount: complete.total,
      failedCount: complete.failed,
      taskBonus: parseFloat(taskBonus.toFixed(1))
    };
  }

  // ========== 记录评估 ==========

  /**
   * 对一次任务完成进行评分
   */
  recordTaskEvaluation({ taskId, agentId, status, feedback, keepRate }) {
    const record = {
      ts: Date.now(),
      taskId,
      agentId: agentId || 'unknown',
      status: status || 'unknown',
      feedback: feedback || '',
      keepRate: keepRate !== undefined ? keepRate : null
    };
    this.records.push(record);

    // Also save to DB if available
    if (this._db) {
      try {
        this._db.evaluationOps.saveRecord(record);
      } catch (e) { /* ignore */ }
    }

    // 更新该 agent 的分数
    const scoreData = this.calculateScore(agentId);
    this.scores[agentId] = {
      lastScore: scoreData.score,
      lastUpdated: Date.now(),
      totalTasks: scoreData.taskCount,
      history: (this.scores[agentId]?.history || []).concat([{
        score: scoreData.score,
        ts: Date.now(),
        keepRate: scoreData.keepRate
      }]).slice(-50)
    };

    this.save();
    return scoreData;
  }

  // ========== 查询接口 ==========

  /**
   * 获取员工评估报告
   */
  getAgentReport(agentId) {
    const score = this.calculateScore(agentId);
    const history = this.scores[agentId]?.history || [];

    return {
      agentId,
      score: score.score,
      keepRate: score.keepRate,
      completionRate: score.completionRate,
      taskCount: score.taskCount,
      failedCount: score.failedCount,
      scoreTrend: history.slice(-10).map(h => ({ score: h.score, keepRate: h.keepRate, ts: h.ts })),
      recentRecords: this.records
        .filter(r => r.agentId === agentId)
        .slice(-20)
        .reverse()
    };
  }

  /**
   * 获取所有员工的评分排名
   */
  getLeaderboard(agents) {
    const results = (agents || []).map(a => {
      const score = this.calculateScore(a.id);
      return {
        id: a.id,
        name: a.name_cn || a.name,
        title: a.title,
        score: score.score,
        keepRate: score.keepRate,
        completionRate: score.completionRate,
        taskCount: score.taskCount
      };
    });

    // 按分数降序
    results.sort((a, b) => b.score - a.score);

    return {
      rankings: results,
      topScore: results.length > 0 ? results[0].score : 0,
      bottomScore: results.length > 0 ? results[results.length - 1].score : 0,
      averageScore: results.length > 0
        ? parseFloat((results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(1))
        : 0
    };
  }

  /**
   * 获取系统整体健康度
   */
  getSystemHealth() {
    const tasks = this._loadTasks();
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    return {
      totalTasks: total,
      completedTasks: done,
      pendingTasks: pending,
      failedTasks: failed,
      completionRate: total > 0 ? parseFloat((done / total).toFixed(4)) : 0,
      failRate: total > 0 ? parseFloat((failed / total).toFixed(4)) : 0,
      evalRecords: this.records.length,
      scoredAgents: Object.keys(this.scores).length
    };
  }
}

module.exports = EvaluationSystem;
