/**
 * agent-worker-engine.js — 独立 Agent Worker 执行引擎 v1.0
 *
 * 职责：
 * - 独立轮询 tasks.json，扫描 todo/pending 任务
 * - 调用 executeAgent 实际驱动 Agent 干活
 * - 结果空自动重试（强约束）
 * - 完成后回调 CEO 通知
 * - 独立状态上报
 */

const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');

var _instance = null;
var _running = false;
var _cycleCount = 0;
var _stats = { dispatched: 0, completed: 0, failed: 0, retried: 0, blocked: 0 };
var _errors = [];
var _interval = null;

class AgentWorkerEngine {
  constructor(options) {
    this.tasksFile = options.tasksFile || path.join(BASE, 'tasks.json');
    this.pollInterval = options.pollInterval || 10000; // 10秒
    this.maxRetries = options.maxRetries || 2;
    this.agentExecutorPath = options.agentExecutorPath || './agent-executor';
  }

  start() {
    if (_running) return;
    _running = true;
    _cycleCount = 0;

    // 立即执行一轮
    this._cycle();
    // 启动轮询
    _interval = setInterval(() => this._cycle(), this.pollInterval);
    console.log('[WorkerEngine] 已启动, 轮询间隔 ' + (this.pollInterval / 1000) + 's');
  }

  stop() {
    _running = false;
    if (_interval) { clearInterval(_interval); _interval = null; }
    console.log('[WorkerEngine] 已停止');
  }

  getStatus() {
    return {
      running: _running,
      cycleCount: _cycleCount,
      stats: { ..._stats },
      recentErrors: _errors.slice(-10)
    };
  }

  // ========== 核心轮询 ==========

  _cycle() {
    if (!_running) return;
    _cycleCount++;
    try {
      this._processTasks();
    } catch (e) {
      console.error('[WorkerEngine] 轮询错误:', e.message);
    }
  }

  _processTasks() {
    if (!fs.existsSync(this.tasksFile)) return;
    var raw;
    try { raw = fs.readFileSync(this.tasksFile, 'utf8'); } catch(e) { return; }
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    var tasks;
    try { tasks = JSON.parse(raw); } catch(e) { return; }
    if (!tasks || !tasks.length) return;

    // 找待办任务：todo 或 in_progress
    var pending = tasks.filter(function(t) {
      return t.status === 'todo' || t.status === 'pending';
    });

    // 找超时的 in_progress（超过120秒没完成的）
    var now = Date.now();
    var stuck = tasks.filter(function(t) {
      if (t.status !== 'in_progress' || !t.updatedAt) return false;
      var age = now - new Date(t.updatedAt).getTime();
      return age > 120000; // 2分钟超时
    });

    var targets = pending.concat(stuck);

    for (var i = 0; i < targets.length; i++) {
      var task = targets[i];
      this._executeTask(task, tasks);
    }
  }

  // ========== 执行单个任务 ==========

  _executeTask(task, allTasks) {
    var taskId = task.id;
    var agentId = task.assigneeId;
    var taskTitle = task.title || '(无标题)';

    console.log('[WorkerEngine] 🚀 开始执行: ' + taskTitle + ' (' + agentId + ')');

    // 标记为 in_progress
    this._updateTaskStatus(taskId, 'in_progress', allTasks);

    // 加载 agent-executor
    var executor;
    try {
      executor = require(this.agentExecutorPath);
    } catch(e) {
      console.error('[WorkerEngine] 加载agent-executor失败:', e.message);
      this._updateTaskStatus(taskId, 'todo', allTasks); // 恢复待办
      _stats.failed++;
      return;
    }

    var maxTry = 1 + this.maxRetries;
    var attempt = 0;

    function doTry(resolve, reject) {
      attempt++;
      executor.executeAgent(agentId, taskTitle, {
        taskId: taskId,
        taskTitle: taskTitle,
        timeout: 90000
      }).then(function(result) {
        var reply = (result && result.reply) || '';
        // 空内容重试
        if ((!reply || reply.trim().length === 0) && attempt < maxTry) {
          _stats.retried++;
          console.log('[WorkerEngine] ⚠️ 第' + attempt + '次空结果, 重试... (' + taskTitle + ')');
          setTimeout(function() { doTry(resolve, reject); }, 1000);
          return;
        }
        resolve({ reply: reply, memory: result.memory, toolCalls: result.toolCalls, iterations: result.iterations });
      }).catch(function(err) {
        if (attempt < maxTry) {
          _stats.retried++;
          console.log('[WorkerEngine] ⚠️ 第' + attempt + '次执行异常: ' + err.message + ', 重试...');
          setTimeout(function() { doTry(resolve, reject); }, 2000);
          return;
        }
        reject(err);
      });
    }

    var self = this;
    new Promise(function(resolve, reject) {
      doTry(resolve, reject);
    }).then(function(result) {
      var reply = result.reply || '[系统: 模型未返回有效内容]';
      _stats.completed++;

      // 检查 test-final* 类似的文件是否被写入
      var hasOutput = false;
      try {
        var outFile = path.join(BASE, 'AI团队', '工作成果', agentId + '_' + taskId.substring(0,8) + '.txt');
        if (fs.existsSync(outFile)) hasOutput = true;
      } catch(e) {}

      self._updateTaskStatus(taskId, 'completed', allTasks, {
        result: reply,
        completedAt: new Date().toISOString(),
        workerEngine: true,
        hasOutput: hasOutput
      });

      console.log('[WorkerEngine] ✅ 完成: ' + taskTitle + ' (' + agentId + ') ' + (hasOutput ? '📄有文件' : ''));
      _errors.push({ type: 'complete', taskId: taskId, agentId: agentId, taskTitle: taskTitle, time: new Date().toISOString() });
      if (_errors.length > 100) _errors.splice(0, 50);

    }).catch(function(err) {
      _stats.failed++;
      self._updateTaskStatus(taskId, 'todo', allTasks, { lastError: err.message });
      console.error('[WorkerEngine] ❌ 失败: ' + taskTitle + ' (' + agentId + ') - ' + err.message);
      _errors.push({ type: 'error', taskId: taskId, agentId: agentId, taskTitle: taskTitle, error: err.message, time: new Date().toISOString() });
      if (_errors.length > 100) _errors.splice(0, 50);
    });
  }

  // ========== 工具方法 ==========

  _updateTaskStatus(taskId, status, allTasks, extra) {
    try {
      var raw = fs.readFileSync(this.tasksFile, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      var tasks = JSON.parse(raw);
      var found = false;
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
          tasks[i].status = status;
          tasks[i].updatedAt = new Date().toISOString();
          if (extra) {
            for (var k in extra) tasks[i][k] = extra[k];
          }
          found = true;
          break;
        }
      }
      if (!found) {
        // 可能是新任务，从 allTasks 中找
        for (var j = 0; j < allTasks.length; j++) {
          if (allTasks[j].id === taskId) {
            tasks.push(allTasks[j]);
            tasks[tasks.length - 1].status = status;
            tasks[tasks.length - 1].updatedAt = new Date().toISOString();
            if (extra) {
              for (var kk in extra) tasks[tasks.length - 1][kk] = extra[kk];
            }
            break;
          }
        }
      }
      fs.writeFileSync(this.tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
    } catch(e) {
      console.error('[WorkerEngine] 更新任务状态失败:', e.message);
    }
  }
}

// ====== 单例 ======
function getInstance(options) {
  if (!_instance) {
    _instance = new AgentWorkerEngine(options || {});
  }
  return _instance;
}

module.exports = {
  AgentWorkerEngine: AgentWorkerEngine,
  getInstance: getInstance,
  start: function(options) { return getInstance(options).start(); },
  stop: function() { if (_instance) _instance.stop(); },
  getStatus: function() { return _instance ? _instance.getStatus() : { running: false, cycleCount: 0, stats: { dispatched: 0, completed: 0, failed: 0, retried: 0 } }; }
};
