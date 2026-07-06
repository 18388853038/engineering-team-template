/**
 * task-queue.js — 内存任务队列 + WAL 持久化
 *
 * 解决 tasks.json 文件竞争 + 调度器 30s 轮询延迟 + LLM 唤醒不可靠三个问题。
 *
 * 架构：
 *   assign_task → enqueue() → 内存队列 (O(1)) → WAL 追加 (append-only) → notify poll waiter
 *   Agent → poll() → long polling，有任务立即返回，无任务挂起等待
 *   Agent → complete() → 标记完成 → WAL 追加
 *
 * 启动时回放 WAL 重建队列，崩溃不丢失数据。
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const WAL_FILE = path.join(BASE, 'tasks-wal.json');
const MAX_COMPLETED_LOG = 100;
const DEFAULT_POLL_TIMEOUT = 30000;

class TaskQueue {
  constructor() {
    // pendingQueue: Map<agentId, Task[]>
    this.pendingQueue = new Map();
    // activeTasks: Map<taskId, { task, agentId, startedAt }>
    this.activeTasks = new Map();
    // completedLog: Task[] (最近 MAX_COMPLETED_LOG 条)
    this.completedLog = [];
    // failedLog: Task[] (最近 50 条失败)
    this.failedLog = [];
    // pollWaiters: Map<agentId, { resolve, reject, timer }[]>
    this.pollWaiters = new Map();
    // 统计
    this.stats = { totalEnqueued: 0, totalCompleted: 0, totalFailed: 0 };
    // 是否已初始化
    this.initialized = false;
    // 所有任务的完整列表（用于兼容旧 API）
    this._allTasks = [];
  }

  // ==================== 初始化 & WAL 恢复 ====================

  /**
   * 从 WAL 回放重建队列。启动时调用一次。
   */
  initialize() {
    if (this.initialized) return;
    try {
      if (fs.existsSync(WAL_FILE)) {
        var raw = fs.readFileSync(WAL_FILE, 'utf-8').trim();
        if (raw) {
          var lines = raw.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            try {
              var record = JSON.parse(line);
              this._replay(record);
            } catch(e) {
              console.error('[TaskQueue] WAL 回放失败 L' + (i+1) + ':', e.message);
            }
          }
          console.log('[TaskQueue] WAL 回放完成: ' + lines.length + ' 条记录, 待办=' + this._pendingCount() + ' 执行中=' + this.activeTasks.size);
          // 将 WAL 中的待办任务同步到 tasks.json，确保调度器能读到
          try {
            var tasksFile = path.join(path.resolve(__dirname, '..'), 'tasks.json');
            if (fs.existsSync(tasksFile)) {
              var allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8') || '[]');
              var existingIds = {};
              var existingTitleAgent = {};
              allTasks.forEach(function(t) { 
                existingIds[t.id] = true;
                // 记录 title+assignee 组合，用于内容去重
                if (t.title && t.assigneeId) {
                  existingTitleAgent[t.title + '|' + t.assigneeId] = true;
                }
              });
              var changed = false;
              for (var _ai = 0; _ai < this._allTasks.length; _ai++) {
                var _t = this._allTasks[_ai];
                if ((_t.status === 'todo' || _t.status === 'pending') && !existingIds[_t.id]) {
                  // ⭐ 内容去重：跳过标题+assignee 相同的任务
                  var _contentKey = (_t.title || '') + '|' + (_t.assigneeId || _t._queueAgent || '');
                  if (existingTitleAgent[_contentKey]) continue;
                  allTasks.push(_t);
                  existingIds[_t.id] = true;
                  existingTitleAgent[_contentKey] = true;
                  changed = true;
                }
              }
              if (changed) {
                fs.writeFileSync(tasksFile, JSON.stringify(allTasks, null, 2), 'utf8');
                console.log('[TaskQueue] 同步 ' + this._allTasks.filter(function(t){return t.status==='todo'||t.status==='pending';}).length + ' 个待办任务到 tasks.json');
              }
            }
          } catch(_se) { console.error('[TaskQueue] 同步 tasks.json 失败:', _se.message); }
        }
      }
    } catch(e) {
      console.error('[TaskQueue] WAL 加载失败（首次启动无文件属正常）:', e.message);
    }
    this.initialized = true;
  }

  /** 回放一条 WAL 记录 */
  _replay(record) {
    switch (record.op) {
      case 'enqueue':
        var task = record.data.task;
        var agentId = record.data.agentId;
        // ⭐ 跳过已在 tasks.json 中完成的旧任务（防止死循环assign已完成的旧任务）
        if (task && task.id) {
          try {
            var _tasksFile = require('path').join(require('path').resolve(__dirname, '..'), 'tasks.json');
            if (require('fs').existsSync(_tasksFile)) {
              var _existing = JSON.parse(require('fs').readFileSync(_tasksFile, 'utf8') || '[]');
              var _found = _existing.find(function(t) { return t.id === task.id; });
              if (_found && (_found.status === 'completed' || _found.status === 'failed')) {
                console.log('[TaskQueue] 跳过已完成的 WAL 任务:', task.id);
                break;
              }
            }
          } catch(_) {}
        }
        this._doEnqueue(agentId, task);
        this._allTasks.push(task);
        break;
      case 'assign':
        // WAL回放：将任务标记为活跃（不做实际出队，WAL只是用于记录）
        var _taskInAll = this._allTasks.find(function(t) { return t.id === record.data.taskId; });
        if (_taskInAll) {
          _taskInAll.status = 'in_progress';
          this.activeTasks.set(record.data.taskId, {
            task: _taskInAll,
            agentId: record.data.agentId,
            startedAt: Date.now()
          });
        }
        break;
      case 'complete':
        this._doComplete(record.data.taskId, record.data.result, record.data.success);
        break;
      case 'fail':
        this._doFail(record.data.taskId, record.data.error);
        break;
    }
  }

  /** 当前待办总数 */
  _pendingCount() {
    var count = 0;
    for (var entry of this.pendingQueue) { count += entry[1].length; }
    return count;
  }

  // ==================== 核心操作 ====================

  /**
   * 将任务加入指定 Agent 的待办队列。
   * @param {string} agentId
   * @param {object} task — 必须有 id, title, status='todo'
   */
  enqueue(agentId, task) {
    if (!task.id) task.id = this._uuid();
    task.status = 'todo';
    task.queueEntryAt = new Date().toISOString();
    task._queueAgent = agentId;

    this._doEnqueue(agentId, task);
    this._allTasks.push(task);
    this.stats.totalEnqueued++;

    // WAL 持久化
    this._appendWAL({ op: 'enqueue', data: { agentId, task }, ts: task.queueEntryAt });

    // 通知等待中的 poll
    this._notifyWaiter(agentId, task);
  }

  _doEnqueue(agentId, task) {
    if (!this.pendingQueue.has(agentId)) {
      this.pendingQueue.set(agentId, []);
    }
    this.pendingQueue.get(agentId).push(task);
  }

  /**
   * Agent 拉取任务。支持 long polling。
   * @param {string} agentId
   * @param {number} timeoutMs 等待超时（默认 30s）
   * @returns {Promise<object|null>} 任务对象，无任务返回 null
   */
  /**
   * 同步出队（不等待，适合非 async 上下文）
   */
  dequeueSync(agentId) {
    return this._dequeue(agentId);
  }

  poll(agentId, timeoutMs) {
    timeoutMs = timeoutMs || DEFAULT_POLL_TIMEOUT;

    // 先看看队列里有没有
    var task = this._dequeue(agentId);
    if (task) return Promise.resolve(task);

    // 没有任务，做 long polling
    var self = this;
    return new Promise(function(resolve, reject) {
      var waiters = self.pollWaiters.get(agentId);
      if (!waiters) {
        waiters = [];
        self.pollWaiters.set(agentId, waiters);
      }

      var timer = setTimeout(function() {
        // 超时，移除 waiter
        var idx = waiters.indexOf(entry);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve(null); // 超时返回 null
      }, timeoutMs);

      var entry = {
        resolve: function(task) {
          clearTimeout(timer);
          resolve(task);
        },
        reject: reject,
        timer: timer,
        createdAt: Date.now()
      };

      waiters.push(entry);
    });
  }

  /** 内部出队 */
  _dequeue(agentId) {
    var queue = this.pendingQueue.get(agentId);
    if (!queue || queue.length === 0) return null;
    var task = queue.shift();
    if (queue.length === 0) this.pendingQueue.delete(agentId);

    // 标记为执行中
    task.status = 'in_progress';
    task.assignedAt = new Date().toISOString();
    task.schedulerAssigned = true;
    this.activeTasks.set(task.id, { task, agentId, startedAt: Date.now() });

    // WAL：assign
    this._appendWAL({ op: 'assign', data: { taskId: task.id, agentId }, ts: task.assignedAt });

    return task;
  }

  /**
   * Agent 完成任务回调。
   * @param {string} taskId
   * @param {string} result 执行结果
   * @param {boolean} success
   */
  complete(taskId, result, success) {
    var entry = this._doComplete(taskId, result, success !== false);
    if (entry) {
      this._appendWAL({ op: 'complete', data: { taskId, result, success: success !== false }, ts: new Date().toISOString() });
    }
    return entry;
  }

  _doComplete(taskId, result, success) {
    var entry = this.activeTasks.get(taskId);
    if (!entry) return null;

    var task = entry.task;
    task.status = success ? 'completed' : 'failed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    this.activeTasks.delete(taskId);

    if (success) {
      this.completedLog.push(task);
      if (this.completedLog.length > MAX_COMPLETED_LOG) this.completedLog.shift();
      this.stats.totalCompleted++;
      // 任务完成回调：通知CEO + 保存产出物
      try { this._triggerTaskCompleted(entry); } catch(_ce) {}
    } else {
      this.failedLog.push(task);
      if (this.failedLog.length > 50) this.failedLog.shift();
      this.stats.totalFailed++;
    }

    return task;
  }

  /**
   * 任务失败（带重试：自动回队）
   * @param {string} taskId
   * @param {string} error
   * @param {boolean} retry 是否重试（默认 true）
   */
  fail(taskId, error, retry) {
    retry = retry !== false;
    var entry = this._doFail(taskId, error);
    if (!entry) return;

    this._appendWAL({ op: 'fail', data: { taskId, error, retry }, ts: new Date().toISOString() });

    var task = entry.task;
    var agentId = entry.agentId;

    if (retry && (task.retryCount || 0) < 3) {
      task.retryCount = (task.retryCount || 0) + 1;
      task.status = 'todo';
      task.lastError = error;
      // 回队（退避延迟：重试次数 × 10s）
      var self = this;
      setTimeout(function() {
        self._doEnqueue(agentId, task);
        self._notifyWaiter(agentId, task);
      }, task.retryCount * 10000);
    }
  }

  _doFail(taskId, error) {
    var entry = this.activeTasks.get(taskId);
    if (!entry) return null;

    var task = entry.task;
    task.status = 'failed';
    task.failedAt = new Date().toISOString();
    task.lastError = error;

    this.activeTasks.delete(taskId);
    this.failedLog.push(task);
    if (this.failedLog.length > 50) this.failedLog.shift();
    this.stats.totalFailed++;

    return entry;
  }

  // ==================== 查询接口 ====================

  /**
   * 查看某 Agent 的待办任务
   */
  getPendingTasks(agentId) {
    return this.pendingQueue.get(agentId) || [];
  }

  /**
   * 全量任务（兼容旧 API — 合并 pending + active + completed）
   */
  getAllTasks() {
    var all = [];
    // pending
    for (var entry of this.pendingQueue) {
      all = all.concat(entry[1]);
    }
    // active
    for (var entry of this.activeTasks) {
      all.push(entry[1].task);
    }
    // completed
    all = all.concat(this.completedLog);
    // failed
    all = all.concat(this.failedLog);
    return all;
  }

  /**
   * 统计
   */
  getStats() {
    return {
      pending: this._pendingCount(),
      active: this.activeTasks.size,
      completed: this.completedLog.length,
      failed: this.failedLog.length,
      total: this.stats
    };
  }

  /**
   * 待办按 Agent 分布
   */
  getPendingCountByAgent() {
    var counts = {};
    for (var entry of this.pendingQueue) {
      counts[entry[0]] = entry[1].length;
    }
    return counts;
  }

  // ==================== 内部工具 ====================

  /** 追加 WAL（append-only，不覆盖） */
  _appendWAL(record) {
    try {
      var line = JSON.stringify(record) + '\n';
      fs.appendFileSync(WAL_FILE, line, 'utf-8');
    } catch(e) {
      console.error('[TaskQueue] WAL 写入失败:', e.message);
    }
  }

  /** 通知等待 poll 的 Agent */
  _notifyWaiter(agentId, task) {
    var waiters = this.pollWaiters.get(agentId);
    if (!waiters || waiters.length === 0) return;
    var waiter = waiters.shift();
    if (waiter && waiter.resolve) {
      waiter.resolve(task);
    }
  }


  /** 任务完成回调：通知CEO + 保存产出物 */
  _triggerTaskCompleted(entry) {
    var task = entry.task;
    var agentId = entry.agentId;
    var agentName = task._queueAgent || agentId;
    var result = task.result || '';
    var BASE = require('path').resolve(__dirname, '..');
    
    // 1. 推送到CEO通知队列
    var notifyFile = require('path').join(BASE, 'logs', 'ceo-notify-queue.json');
    try {
      var queue = [];
      if (require('fs').existsSync(notifyFile)) {
        queue = JSON.parse(require('fs').readFileSync(notifyFile, 'utf-8') || '[]');
      }
      queue.push({
        type: 'task_completed',
        message: '【' + agentName + '】完成任务「' + (task.title || task.id) + '」',
        taskId: task.id,
        agentId: agentId,
        agentName: agentName,
        completedAt: task.completedAt,
        resultPreview: (result || '').substring(0, 200),
        status: 'unread'
      });
      require('fs').writeFileSync(notifyFile, JSON.stringify(queue, null, 2), 'utf-8');
    } catch(_ne) {}
    
    // 2. 保存产出物到工作成果目录
    if (result && result.length > 50) {
      try {
        var reportDir = require('path').join(BASE, '..', 'AI团队', '工作成果');
        if (!require('fs').existsSync(reportDir)) require('fs').mkdirSync(reportDir, { recursive: true });
        var safeName = (task.title || 'task').replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
        var reportFile = require('path').join(reportDir, agentName + '-' + safeName + '-' + task.id.substring(0, 8) + '.md');
        var header = '# ' + (task.title || '任务报告') + '\n\n**执行人：' + agentName + '** | **完成时间：' + task.completedAt + '**\n\n---\n\n';
        require('fs').writeFileSync(reportFile, header + result, 'utf-8');
      } catch(_re) {}
    }
  }

  _uuid() {
    return 'tq_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
  }
}

// ==================== 单例 ====================
var instance = new TaskQueue();

module.exports = {
  TaskQueue: TaskQueue,
  taskQueue: instance
};
