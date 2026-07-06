/**
 * task-pull.js — Agent自动拉取任务机制 v2.0
 * 
 * 每个Agent在空闲时自动查询待办任务并主动领取执行。
 * 解决push模式下scheduler推任务失败的断裂问题。
 * 
 * 工作流：
 *   1. Agent完成当前任务后（或启动时），调用 pullPendingTask(agentId)
 *   2. 从 tasks.json 查询分配给该Agent的 pending/todo 任务
 *   3. 如果有，自动领取并执行，形成自驱动循环
 *   4. 如果无，Agent回到idle状态等待
 * 
 * v2.0 新增：
 *   - completeClaimedTask() — Agent执行完任务后手动触发完成回调
 *   - 自动调用 task-callback-hook.js 的 onTaskComplete 通知CEO
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const TASKS_FILE = path.join(BASE, 'tasks.json');
const STATUS_FILE = path.join(BASE, 'scheduler-status.json');

// 引入回调钩子
const callbackHook = require('./task-callback-hook.js');

/**
 * 查询某个Agent的待办任务列表
 * @param {string} agentId - Agent ID
 * @param {Object} [options] - 查询选项
 * @param {number} [options.limit=5] - 返回任务数上限
 * @param {string} [options.priority] - 按优先级筛选 (emergency/high/medium/low)
 * @returns {Array} 待办任务列表，按优先级+创建时间排序
 */
function getPendingTasks(agentId, options) {
  try {
    var tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    options = options || {};
    var limit = options.limit || 5;

    // 筛选条件：
    // 1. 状态为 pending 或 todo 或 approved
    // 2. assigneeId 匹配该Agent（优先精确匹配）
    // 3. 或未分配任何人（assigneeId 为 null/undefined）
    var pending = tasks.filter(function(t) {
      if (t.status !== 'pending' && t.status !== 'todo' && t.status !== 'approved') return false;
      // 分配给该Agent的任务优先
      if (t.assigneeId === agentId) return true;
      // 未分配的任务也可以被认领
      if (!t.assigneeId || t.assigneeId === 'null' || t.assigneeId === 'undefined') return true;
      return false;
    });

    // 按优先级排序: emergency > high > medium > low
    var priorityOrder = { emergency: 0, high: 1, medium: 2, low: 3 };
    pending.sort(function(a, b) {
      var pa = priorityOrder[a.priority] || 99;
      var pb = priorityOrder[b.priority] || 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // 按选项过滤优先级
    if (options.priority) {
      pending = pending.filter(function(t) { return t.priority === options.priority; });
    }

    return pending.slice(0, limit);
  } catch(e) {
    console.error('[TaskPull] 读取待办任务失败:', e.message);
    return [];
  }
}

/**
 * Agent主动领取一个待办任务
 * @param {string} agentId - Agent ID
 * @param {Object} [preferredTask] - 优先领取的特定任务（可选）
 * @returns {Object|null} 领取的任务对象，如果没有待办任务则返回null
 */
function claimTask(agentId, preferredTask) {
  try {
    var tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    var targetTask = null;

    if (preferredTask) {
      // 领取指定的任务
      var idx = tasks.findIndex(function(t) { return t.id === preferredTask.id; });
      if (idx >= 0 && (tasks[idx].status === 'pending' || tasks[idx].status === 'todo')) {
        targetTask = tasks[idx];
      }
    }

    if (!targetTask) {
      // 没有指定任务，自动查找第一个可用任务
      var pending = getPendingTasks(agentId, { limit: 1 });
      if (pending.length > 0) {
        var idx2 = tasks.findIndex(function(t) { return t.id === pending[0].id; });
        if (idx2 >= 0) targetTask = tasks[idx2];
      }
    }

    if (!targetTask) return null;

    // 记录领取时间，用于计算执行耗时
    var claimedAt = new Date().toISOString();

    // 领取任务：更新状态和分配人
    targetTask.status = 'in_progress';
    targetTask.assigneeId = agentId;
    targetTask.assignedAt = claimedAt;
    targetTask.pulledByAgent = true; // 标记为Agent主动拉取

    // 写回tasks.json
    var tIdx = tasks.findIndex(function(t) { return t.id === targetTask.id; });
    if (tIdx >= 0) {
      tasks[tIdx] = targetTask;
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    }

    // 更新scheduler状态
    updateAgentStatus(agentId, 'busy', targetTask.id);

    console.log('[TaskPull] ' + agentId + ' 主动领取任务: ' + targetTask.title);
    return targetTask;
  } catch(e) {
    console.error('[TaskPull] 领取任务失败:', e.message);
    return null;
  }
}

/**
 * Agent完成任务后调用 —— 触发回调全链路
 * 
 * 这是v2.0新增的核心函数：
 * ✅ 更新tasks.json状态为completed
 * ✅ 调用 task-callback-hook.js 的 onTaskComplete 写日志+推通知队列+记CEO记忆
 * ✅ 标记Agent为idle
 * ✅ 触发拉取下一个任务
 * 
 * @param {string} agentId - Agent ID
 * @param {string} taskId - 任务ID
 * @param {string} agentName - Agent名称（用于通知）
 * @param {string} result - 执行结果摘要
 * @param {boolean} [success=true] - 是否成功
 * @returns {Object} 回调结果
 */
function completeClaimedTask(agentId, taskId, agentName, result, success) {
  try {
    if (!taskId) {
      console.error('[TaskPull] completeClaimedTask 缺少taskId');
      return { ok: false, error: '缺少taskId' };
    }

    // 1. 更新 tasks.json 中的任务状态为 completed
    var tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    var taskIdx = tasks.findIndex(function(t) { return t.id === taskId; });
    
    if (taskIdx < 0) {
      console.error('[TaskPull] 任务不存在: ' + taskId);
      return { ok: false, error: '任务不存在' };
    }

    var task = tasks[taskIdx];
    var claimedAt = task.assignedAt || task.updatedAt || task.createdAt;
    var durationMs = new Date().getTime() - new Date(claimedAt).getTime();

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.completedByAgent = true;
    task.resultSummary = (result || '').substring(0, 500);
    tasks[taskIdx] = task;
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');

    // 2. 调用 task-callback-hook.js 的回调全链路
    var context = {
      taskId: taskId,
      agentId: agentId,
      agentName: agentName || agentId,
      taskTitle: task.title || 'Untitled',
      result: result || '任务完成',
      success: success !== false,
      durationMs: durationMs
    };

    var callbackResult = callbackHook.onTaskComplete(context);

    // 3. 标记Agent为idle
    markIdle(agentId);

    console.log('[TaskPull] ' + agentId + ' 完成任务: ' + task.title + '（耗时' + (durationMs / 1000).toFixed(1) + 's）');
    
    return {
      ok: true,
      taskId: taskId,
      title: task.title,
      durationMs: durationMs,
      callback: callbackResult
    };
  } catch(e) {
    console.error('[TaskPull] completeClaimedTask 失败:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * 标记Agent为空闲状态
 * @param {string} agentId - Agent ID
 */
function markIdle(agentId) {
  updateAgentStatus(agentId, 'idle', null);
}

/**
 * 更新调度器中Agent的状态
 */
function updateAgentStatus(agentId, status, taskId) {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      var data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      if (!data.agentStatus) data.agentStatus = {};
      data.agentStatus[agentId] = {
        status: status,
        taskId: taskId,
        startedAt: status === 'busy' ? new Date().toISOString() : null,
        lastHeartbeat: new Date().toISOString()
      };
      fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch(e) {
    // 静默
  }
}

/**
 * 统计每个Agent的待办任务数
 * @returns {Object} { agentId: pendingCount }
 */
function getPendingCountByAgent() {
  try {
    var tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    var counts = {};

    tasks.forEach(function(t) {
      if (t.status === 'pending' || t.status === 'todo' || t.status === 'approved') {
        var assignee = t.assigneeId || 'unassigned';
        counts[assignee] = (counts[assignee] || 0) + 1;
      }
    });

    return counts;
  } catch(e) {
    return {};
  }
}

/**
 * 获取所有待办任务概览
 * @returns {Object} 待办任务统计
 */
function getQueueOverview() {
  try {
    var tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    var pending = tasks.filter(function(t) {
      return t.status === 'pending' || t.status === 'todo' || t.status === 'approved';
    });
    var byPriority = { emergency: 0, high: 0, medium: 0, low: 0 };
    var byAssignee = {};

    pending.forEach(function(t) {
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      var a = t.assigneeId || 'unassigned';
      byAssignee[a] = (byAssignee[a] || 0) + 1;
    });

    return {
      total: pending.length,
      byPriority: byPriority,
      byAssignee: byAssignee,
      tasks: pending.map(function(t) {
        return {
          id: t.id,
          title: t.title,
          priority: t.priority,
          assignee: t.assigneeId || 'unassigned',
          createdAt: t.createdAt
        };
      })
    };
  } catch(e) {
    return { total: 0, byPriority: {}, byAssignee: {}, tasks: [] };
  }
}

module.exports = {
  getPendingTasks: getPendingTasks,
  claimTask: claimTask,
  completeClaimedTask: completeClaimedTask,  // v2.0 新增
  markIdle: markIdle,
  getPendingCountByAgent: getPendingCountByAgent,
  getQueueOverview: getQueueOverview
};
