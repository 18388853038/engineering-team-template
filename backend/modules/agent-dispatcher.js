/**
 * agent-dispatcher.js — 新一代 AI 员工调度引擎
 * 
 * 替代 agent-worker-engine.js（轮询模式）
 * 
 * 工作模式：
 * 1. CEO 调用 assign_task → 本引擎立即创建任务 session
 * 2. 任务直接推送到 agent-executor 执行（不走 tasks.json 文件轮询）
 * 3. 执行完后实时回调 CEO 汇总
 * 4. 保留 tasks.json 仅作持久化记录，不驱动调度
 * 
 * 对比旧模式：
 * - 旧: tasks.json 写文件 → agent-worker-engine 每10秒轮询 → agent-executor 执行
 * - 新: taskQueue 内存入队 → 本引擎即时分派 → agent-executor 执行 → 即时回调
 * 
 * 实时性：从 CEO 发出任务到员工开始执行 < 50ms（vs 旧模式 0-10s）
 * 状态可见：通过 /api/agent/dispatch/status 端点和 SSE 实时流
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');

const BASE = path.resolve(__dirname, '..');
const TASKS_FILE = path.join(BASE, 'tasks.json');
const AGENTS_FILE = path.join(BASE, 'agents.json');

class AgentDispatcher extends EventEmitter {
  constructor(options) {
    super();
    this.taskQueue = [];        // 等待队列
    this.activeTasks = {};      // 运行中任务 {taskId: taskInfo}
    this.completedTasks = [];    // 已完成（保留最近50条）
    this.taskIdCounter = 0;
    this.maxConcurrent = options.maxConcurrent || 8; // 最大并发员工数
    this.useOldWorker = false;   // 是否同时运行旧轮询引擎（迁移过渡期用）
    
    // 加载员工数据
    this._loadAgents();
    
    // CEO 回调 URL（用于任务完成后通知 CEO）
    this.ceoCallbackUrl = options.ceoCallbackUrl || 'http://127.0.0.1:8002/api/chat';
    
    // Phase 3: 从 tasks.json 恢复未完成任务（服务重启后保持连续性）
    this._recoverFromFile();
    
    console.log('[AgentDispatcher] ✅ 已初始化, 最大并发: ' + this.maxConcurrent);
  }
  
  _loadAgents() {
    try {
      if (fs.existsSync(AGENTS_FILE)) {
        var raw = fs.readFileSync(AGENTS_FILE, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        this.agents = JSON.parse(raw);
        this.agentsMap = {};
        this.agents.forEach(function(a) { this.agentsMap[a.id] = a; }.bind(this));
        console.log('[AgentDispatcher] 加载 ' + this.agents.length + ' 名员工');
      }
    } catch(e) {
      console.error('[AgentDispatcher] 加载员工失败:', e.message);
      this.agents = [];
      this.agentsMap = {};
    }
  }
  
  // ===== 公开接口 =====
  
  /**
   * 分配任务给员工（由 execCEOTool assign_task handler 调用）
   * @param {string} agentId - 员工 ID
   * @param {object} task - 任务对象 {id, title, description, priority, ...}
   * @param {string} sessionId - CEO 对话 session（用于回调）
   * @returns {object} {success, task, queuePosition}
   */
  assignTask(agentId, task, sessionId) {
    var agent = this.agentsMap[agentId];
    if (!agent) {
      return { success: false, error: '员工 ' + agentId + ' 不存在' };
    }
    
    // 构建任务记录
    var taskInfo = {
      id: task.id,
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'medium',
      agentId: agentId,
      agentName: agent.name_cn || agent.name,
      sessionId: sessionId || '',
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };
    
    // 保留文件快照（持久化用途，不驱动调度）
    this._saveToFile(task, agent);
    
    // 检查是否达到并发上限
    var activeCount = Object.keys(this.activeTasks).length;
    if (activeCount >= this.maxConcurrent) {
      // 入队等待
      this.taskQueue.push(taskInfo);
      this._emitStatus(taskInfo, 'queued', '已入队，等待执行');
      return { success: true, task: taskInfo, queuePosition: this.taskQueue.length, status: 'queued' };
    }
    
    // 立即执行
    this._dispatchTask(taskInfo);
    return { success: true, task: taskInfo, status: 'dispatched' };
  }
  
  /**
   * 获取所有任务状态
   */
  getStatus() {
    return {
      queue: this.taskQueue.map(function(t) {
        return { id: t.id, title: t.title, agentId: t.agentId, agentName: t.agentName, priority: t.priority, status: t.status };
      }),
      active: Object.keys(this.activeTasks).map(function(id) {
        var t = this.activeTasks[id];
        return { id: id, title: t.title, agentId: t.agentId, agentName: t.agentName, status: t.status, elapsed: Date.now() - t.startedAt };
      }.bind(this)),
      completed: this.completedTasks.slice(-20).map(function(t) {
        return { id: t.id, title: t.title, agentId: t.agentId, result: t.result ? t.result.substring(0, 100) : null, status: t.status };
      }),
      stats: {
        queued: this.taskQueue.length,
        active: Object.keys(this.activeTasks).length,
        completed: this.completedTasks.length
      }
    };
  }
  
  // ===== 内部调度 =====
  
  _dispatchTask(taskInfo) {
    var agent = this.agentsMap[taskInfo.agentId];
    if (!agent) {
      this._onTaskError(taskInfo, '员工不存在');
      return;
    }
    
    taskInfo.status = 'running';
    taskInfo.startedAt = Date.now();
    this.activeTasks[taskInfo.id] = taskInfo;
    
    this._emitStatus(taskInfo, 'running', '正在执行...');
    console.log('[AgentDispatcher] 🚀 派发: ' + taskInfo.title + ' → ' + taskInfo.agentName);
    
    // 👇 核心：直接调用 agent-executor 执行（不经过 tasks.json 文件）
    this._executeTask(taskInfo, agent);
    
    // 触发队列中下一个任务
    this._drainQueue();
  }
  
  /**
   * 执行单个任务
   * 直接调 agent-executor，不走文件
   */
  _executeTask(taskInfo, agent) {
    var executor;
    try {
      executor = require('./agent-executor');
    } catch(e) {
      console.error('[AgentDispatcher] 加载 executor 失败:', e.message);
      this._onTaskError(taskInfo, 'Executor 加载失败: ' + e.message);
      return;
    }
    
    // 构建员工专属的系统提示
    var systemContext = this._buildAgentContext(agent, taskInfo);
    
    var maxRetries = 2;
    var attempt = 0;
    
    var runAttempt = function() {
      attempt++;
      executor.executeAgent(taskInfo.agentId, taskInfo.title, {
        taskId: taskInfo.id,
        taskTitle: taskInfo.title,
        taskDescription: taskInfo.description,
        systemContext: systemContext,
        timeout: 90000
      }).then(function(result) {
        var reply = (result && result.reply) || '';
        // 空结果重试
        if ((!reply || reply.trim().length === 0) && attempt <= maxRetries) {
          console.log('[AgentDispatcher] ⚠️ 空结果, 重试 (' + attempt + '/' + maxRetries + ') ' + taskInfo.title);
          setTimeout(runAttempt, 1000);
          return;
        }
        taskInfo.result = reply;
        taskInfo.status = 'completed';
        taskInfo.completedAt = Date.now();
        
        this._onTaskComplete(taskInfo, result);
      }.bind(this)).catch(function(err) {
        if (attempt <= maxRetries) {
          console.log('[AgentDispatcher] ⚠️ 异常: ' + err.message + ', 重试 (' + attempt + '/' + maxRetries + ')');
          setTimeout(runAttempt, 2000);
          return;
        }
        this._onTaskError(taskInfo, err.message);
      }.bind(this));
    }.bind(this);
    
    runAttempt();
  }
  
  /**
   * 构建员工系统提示词上下文
   */
  _buildAgentContext(agent, task) {
    var parts = [];
    parts.push('## 你的身份');
    parts.push('你是 ' + (agent.name_cn || agent.name) + '（' + (agent.title || '') + '）');
    parts.push('部门: ' + (agent.departmentName || agent.department || ''));
    if (agent.workflow) parts.push('\n工作流程: ' + agent.workflow);
    if (agent.personality) parts.push('\n性格: ' + agent.personality);
    if (agent.description) parts.push('\n简介: ' + agent.description);
    if (agent.skills && agent.skills.length) {
      parts.push('\n技能: ' + agent.skills.join(', '));
    }
    parts.push('\n## 当前任务');
    parts.push('标题: ' + task.title);
    if (task.description) parts.push('描述: ' + task.description);
    if (task.priority) parts.push('优先级: ' + task.priority);
    parts.push('\n请根据你的专业技能完成以上任务。完成后请输出详细的工作成果。');
    return parts.join('\n');
  }
  
  _onTaskComplete(taskInfo, result) {
    // 从 active 移到 completed
    delete this.activeTasks[taskInfo.id];
    this.completedTasks.push(taskInfo);
    if (this.completedTasks.length > 50) this.completedTasks.shift();
    
    this._emitStatus(taskInfo, 'completed', taskInfo.result ? taskInfo.result.substring(0, 200) : '完成');
    console.log('[AgentDispatcher] ✅ ' + taskInfo.agentName + ' 完成: ' + taskInfo.title);
    
    // 更新 tasks.json 持久化记录
    this._updateFileStatus(taskInfo.id, 'completed', { result: taskInfo.result, completedAt: new Date().toISOString() });
    
    // 回调 CEO（通知用户结果）
    this._callbackCEO(taskInfo);
    
    // 出队下一个
    this._drainQueue();
  }
  
  _onTaskError(taskInfo, errorMessage) {
    delete this.activeTasks[taskInfo.id];
    taskInfo.status = 'failed';
    taskInfo.error = errorMessage;
    this.completedTasks.push(taskInfo);
    
    this._emitStatus(taskInfo, 'failed', errorMessage);
    console.error('[AgentDispatcher] ❌ ' + taskInfo.agentName + ' 失败: ' + taskInfo.title + ' - ' + errorMessage);
    
    this._updateFileStatus(taskInfo.id, 'todo', { lastError: errorMessage });
    
    // 也通知 CEO
    this._callbackCEO(taskInfo);
    
    this._drainQueue();
  }
  
  _drainQueue() {
    while (this.taskQueue.length > 0 && Object.keys(this.activeTasks).length < this.maxConcurrent) {
      var next = this.taskQueue.shift();
      this._dispatchTask(next);
    }
  }
  
  // ===== CEO 回调 =====
  
  _callbackCEO(taskInfo) {
    var message = '';
    if (taskInfo.status === 'completed') {
      message = '员工 ' + taskInfo.agentName + ' 已完成任务「' + taskInfo.title + '」\n\n' +
        (taskInfo.result || '(无详细结果)') + '\n\n' +
        '耗时: ' + ((taskInfo.completedAt - taskInfo.startedAt) / 1000).toFixed(1) + '秒';
    } else {
      message = '员工 ' + taskInfo.agentName + ' 执行任务「' + taskInfo.title + '」失败\n' +
        '错误: ' + (taskInfo.error || '未知错误');
    }
    
    // 通过 HTTP 通知 CEO（与旧 task-callback-hook 一致）
    var postData = JSON.stringify({
      agentId: 'ai_ceo',
      message: message,
      source: 'agent_dispatcher'
    });
    
    try {
      var urlObj = new URL(this.ceoCallbackUrl);
      var options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 8002,
        path: urlObj.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      };
      var req = http.request(options, function(res) {
        // 不等待响应
      });
      req.on('error', function(e) { /* 忽略回调错误 */ });
      req.write(postData);
      req.end();
    } catch(e) {
      // 忽略
    }
  }
  
  // ===== 文件持久化 =====

  /**
   * Phase 3: 服务重启时从 tasks.json 恢复未完成任务
   * - 恢复 dispatcherMode 标记的 todo/queued/running 任务
   * - 较老（>1小时）的 running 任务降级为 queued（避免死锁）
   * - 恢复后的任务加入队列尾部，不自动执行
   */
  _recoverFromFile() {
    try {
      if (!fs.existsSync(TASKS_FILE)) {
        console.log('[AgentDispatcher] tasks.json 不存在, 跳过恢复');
        return;
      }
      var raw = fs.readFileSync(TASKS_FILE, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      var tasks = JSON.parse(raw);
      if (!Array.isArray(tasks) || tasks.length === 0) return;
      
      var now = Date.now();
      var ONE_HOUR = 3600000;
      var recovered = 0;
      var stale = 0;
      
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        
        // 只恢复调度器派发的、或标记为 todo 的员工任务
        var isDispatcherTask = t.dispatcherMode || (t.assigneeId && t.status === 'todo');
        if (!isDispatcherTask) continue;
        
        // 忽略已完成/失败的任务
        if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') {
          // 恢复到 completedTasks 列表（便于前端查看历史）
          if (this.completedTasks.length < 50) {
            this.completedTasks.push({
              id: t.id,
              title: t.title,
              description: t.description || '',
              agentId: t.assigneeId || '',
              agentName: t.assigneeName || '',
              status: t.status,
              createdAt: new Date(t.createdAt).getTime(),
              startedAt: null,
              completedAt: new Date(t.updatedAt || t.completedAt).getTime(),
              result: t.result || '（上次运行结果，重启后恢复）',
              error: t.lastError || null,
              recovered: true
            });
          }
          continue;
        }
        
        // 只有 todo / queued / running 需要恢复
        if (t.status !== 'todo' && t.status !== 'queued' && t.status !== 'running') continue;
        
        var age = now - new Date(t.createdAt).getTime();
        
        // 超过24小时的放弃恢复
        if (age > 86400000) {
          console.log('[AgentDispatcher] ⏭ 跳过过旧任务: ' + t.title + ' (' + (age/3600000).toFixed(1) + '小时前)');
          continue;
        }
        
        var taskInfo = {
          id: t.id,
          title: t.title,
          description: t.description || '',
          priority: t.priority || 'medium',
          agentId: t.assigneeId || '',
          agentName: t.assigneeName || t.assigneeId || '',
          sessionId: '',
          status: 'queued',           // 恢复后统一为 queued（等待调度）
          createdAt: new Date(t.createdAt).getTime(),
          startedAt: null,
          completedAt: null,
          result: null,
          error: null,
          recovered: true,            // 标记为恢复任务
          originalStatus: t.status     // 保留原始状态以供日志
        };
        
        // 如果 running 状态超过1小时，标记为 stale 但仍加入队列
        if (t.status === 'running') {
          if (age > ONE_HOUR) {
            stale++;
            console.log('[AgentDispatcher] ⏰ 陈旧 running 任务降级为 queued: ' + t.title);
          } else {
            console.log('[AgentDispatcher] 🔄 恢复 running 任务为 queued: ' + t.title);
          }
        }
        
        this.taskQueue.push(taskInfo);
        recovered++;
      }
      
      if (recovered > 0) {
        console.log('[AgentDispatcher] ♻️ 从 tasks.json 恢复 ' + recovered + ' 个未完成任务' +
          (stale > 0 ? ' (' + stale + ' 个陈旧任务降级)' : ''));
        this._emitStatus({ id: 'system', title: '系统恢复', agentId: '', agentName: '系统' },
          'recovered', '服务重启，恢复 ' + recovered + ' 个未完成任务');
      }
    } catch(e) {
      console.error('[AgentDispatcher] 恢复 task 失败:', e.message);
    }
  }
  
  _saveToFile(task, agent) {
    try {
      var tasks = [];
      if (fs.existsSync(TASKS_FILE)) {
        var raw = fs.readFileSync(TASKS_FILE, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        tasks = JSON.parse(raw) || [];
      }
      if (!Array.isArray(tasks)) tasks = [];
      tasks.push({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: 'todo',
        priority: task.priority || 'medium',
        assigneeId: agent.id,
        assigneeName: agent.name_cn || agent.name,
        assignedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creator: 'ai_ceo',
        dispatcherMode: true  // 标记为使用新调度器
      });
      var tmpFile = TASKS_FILE + '.tmp.' + process.pid;
      fs.writeFileSync(tmpFile, JSON.stringify(tasks, null, 2), 'utf-8');
      fs.renameSync(tmpFile, TASKS_FILE);
    } catch(e) { /* 忽略文件写入错误 */ }
  }
  
  _updateFileStatus(taskId, status, extra) {
    try {
      if (!fs.existsSync(TASKS_FILE)) return;
      var raw = fs.readFileSync(TASKS_FILE, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      var tasks = JSON.parse(raw) || [];
      if (!Array.isArray(tasks)) return;
      var found = false;
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
          tasks[i].status = status;
          tasks[i].updatedAt = new Date().toISOString();
          if (extra) { for (var k in extra) tasks[i][k] = extra[k]; }
          found = true;
          break;
        }
      }
      if (!found) return;
      var tmpFile = TASKS_FILE + '.tmp.' + process.pid;
      fs.writeFileSync(tmpFile, JSON.stringify(tasks, null, 2), 'utf-8');
      fs.renameSync(tmpFile, TASKS_FILE);
    } catch(e) { /* 忽略 */ }
  }
  
  // ===== 事件 & SSE =====
  
  _emitStatus(taskInfo, status, message) {
    this.emit('task_status', {
      taskId: taskInfo.id,
      title: taskInfo.title,
      agentId: taskInfo.agentId,
      agentName: taskInfo.agentName,
      status: status,
      message: message,
      timestamp: Date.now()
    });
  }
  
  /**
   * 获取 SSE 事件流
   */
  getSSEClient(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: ' + JSON.stringify({ type: 'connected', timestamp: Date.now() }) + '\n\n');
    
    var onStatus = function(data) {
      try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch(e) {}
    };
    this.on('task_status', onStatus);
    
    // 心跳
    var heartbeat = setInterval(function() {
      try { res.write(':heartbeat\n\n'); } catch(e) { clearInterval(heartbeat); }
    }, 15000);
    
    req.on('close', function() {
      clearInterval(heartbeat);
      this.removeListener('task_status', onStatus);
    }.bind(this));
  }
}

// ===== 单例 =====
var _instance = null;

function getInstance(options) {
  if (!_instance) {
    _instance = new AgentDispatcher(options || {});
  }
  return _instance;
}

module.exports = {
  AgentDispatcher: AgentDispatcher,
  getInstance: getInstance,
  assignTask: function(agentId, task, sessionId) { return getInstance().assignTask(agentId, task, sessionId); },
  getStatus: function() { return getInstance().getStatus(); },
  getSSEClient: function(req, res) { return getInstance().getSSEClient(req, res); }
};
