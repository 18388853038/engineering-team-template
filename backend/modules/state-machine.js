/**
 * state-machine.js — eCompany 任务状态机与重试管理
 *
 * 状态转换图：
 *   pending ──→ in_progress ──→ completed
 *                     │
 *                     ├──→ error ──→ retry ──→ in_progress (最多3次)
 *                     │              │
 *                     │              └──→ failed (重试耗尽)
 *                     │
 *                     └──→ timeout ──→ retry ──→ in_progress
 *                                    │
 *                                    └──→ failed
 *
 * 重试策略：
 *   - 最多 3 次重试
 *   - 重试间隔 10 秒（由调用方通过 setTimeout 驱动）
 *   - 达到最大重试次数后进入 failed
 *   - 人工干预可将 failed 重新置为 pending 或 in_progress
 */

const VALID_STATES = ['pending', 'in_progress', 'completed', 'error', 'timeout', 'retry', 'failed'];

//              from         →  to
const ALLOWED_TRANSITIONS = {
  'pending':     ['in_progress'],
  'in_progress': ['completed', 'error', 'timeout'],
  'error':       ['retry', 'failed'],
  'timeout':     ['retry', 'failed'],
  'retry':       ['in_progress', 'failed'],
  'completed':   [],        // 终态，无后续转换
  'failed':      ['pending'] // 仅人工干预可重置
};

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 10000; // 10秒

// 内存存储（进程内，持久化由外部负责）
const _tasks = new Map();

/**
 * 生成短 ID
 */
function _nextId() {
  return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

// ========== 导出函数 ==========

/**
 * 创建新任务
 * @param {string} goal   - 任务目标描述
 * @param {string} module - 执行模块名称
 * @returns {{ taskId: string, state: string }}
 */
function createTask(goal, module) {
  var id = _nextId();
  var task = {
    taskId: id,
    goal: goal || '',
    module: module || '',
    state: 'pending',
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    retryInterval: RETRY_INTERVAL_MS,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    transitions: [
      { from: null, to: 'pending', at: Date.now() }
    ]
  };
  _tasks.set(id, task);
  return { taskId: id, state: 'pending' };
}

/**
 * 状态转换
 * @param {string} taskId
 * @param {string} newState
 * @returns {{ ok: boolean, state?: string, error?: string }}
 */
function transitionTask(taskId, newState) {
  var task = _tasks.get(taskId);
  if (!task) return { ok: false, error: '任务不存在: ' + taskId };

  var current = task.state;

  // 允许人工干预：从 failed 到 pending 或 in_progress
  if (newState === 'pending' || newState === 'in_progress') {
    if (current === 'failed' || current === 'error' || current === 'timeout') {
      task.state = newState;
      task.updatedAt = Date.now();
      task.transitions.push({ from: current, to: newState, at: Date.now(), note: 'manual_intervention' });
      return { ok: true, state: newState };
    }
  }

  var allowed = ALLOWED_TRANSITIONS[current] || [];
  if (allowed.indexOf(newState) < 0) {
    return { ok: false, error: '不允许的转换: ' + current + ' → ' + newState };
  }

  // 特殊规则：error/timeout → retry 时检查重试次数
  if ((current === 'error' || current === 'timeout') && newState === 'retry') {
    if (task.retryCount >= task.maxRetries) {
      // 自动转为 failed
      task.state = 'failed';
      task.updatedAt = Date.now();
      task.transitions.push({ from: current, to: 'failed', at: Date.now(), note: 'max_retries_exceeded' });
      return { ok: true, state: 'failed', note: '已超过最大重试次数 (' + task.maxRetries + ')' };
    }
    task.retryCount++;
  }

  // retry → in_progress 不增加 retryCount（计数已在 error→retry 时增加）
  if (current === 'retry' && newState === 'in_progress') {
    // 只是恢复执行，不增加计数
  }

  task.state = newState;
  task.updatedAt = Date.now();
  task.transitions.push({ from: current, to: newState, at: Date.now() });
  return { ok: true, state: newState };
}

/**
 * 获取任务完整信息
 * @param {string} taskId
 * @returns {object|null}
 */
function getTask(taskId) {
  var task = _tasks.get(taskId);
  if (!task) return null;
  return {
    taskId: task.taskId,
    goal: task.goal,
    module: task.module,
    state: task.state,
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    transitions: task.transitions
  };
}

/**
 * 获取重试次数
 * @param {string} taskId
 * @returns {number} - 已重试次数，任务不存在返回 -1
 */
function getRetryCount(taskId) {
  var task = _tasks.get(taskId);
  if (!task) return -1;
  return task.retryCount;
}

/**
 * 获取统计信息
 */
function getStats() {
  var byState = {};
  var totalRetries = 0;
  var total = 0;

  for (var entry of _tasks.values()) {
    total++;
    byState[entry.state] = (byState[entry.state] || 0) + 1;
    totalRetries += entry.retryCount;
  }

  return {
    totalTasks: total,
    totalRetries: totalRetries,
    byState: byState,
    maxRetries: MAX_RETRIES,
    retryIntervalMs: RETRY_INTERVAL_MS
  };
}

/**
 * 清理指定天数前的已完成/失败任务（节省内存）
 * @param {number} olderThanDays
 */
function cleanup(olderThanDays) {
  var cutoff = Date.now() - (olderThanDays || 7) * 24 * 60 * 60 * 1000;
  var terminalStates = ['completed', 'failed'];
  for (var [id, task] of _tasks) {
    if (terminalStates.indexOf(task.state) >= 0 && task.updatedAt < cutoff) {
      _tasks.delete(id);
    }
  }
}

module.exports = {
  createTask,
  transitionTask,
  getTask,
  getRetryCount,
  getStats,
  cleanup,
  // 常量导出（供外部参考）
  MAX_RETRIES,
  RETRY_INTERVAL_MS,
  VALID_STATES
};
