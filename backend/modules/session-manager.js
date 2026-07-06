/**
 * session-manager.js — 子Agent会话编排器
 *
 * 基于 OpenClaw sessions_spawn 实现真正的隔离子Agent会话。
 * 每个子Agent在独立session中运行，拥有独立context，互不干扰。
 * 每个子Agent拥有独立workspace目录（会话隔离）。
 *
 * API:
 *   spawnSubAgent(agentId, prompt, options) → { sessionKey, status, workspaceDir }
 *   getSubAgentStatus(sessionKey) → { status, messages, lastActivity, workspaceDir }
 *   killSubAgent(sessionKey) → boolean
 *   listSubAgents() → [{ sessionKey, agentId, status, createdAt, workspaceDir }]
 *   sendToSubAgent(sessionKey, message) → { ok }
 */

const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const SESSIONS_FILE = path.join(BASE, '..', 'sub-agent-sessions.json');
const WORKSPACE_ROOT = path.join(BASE, '..', 'workspaces');

// OpenClaw sessions API endpoint (same host, different port for gateway)
const GATEWAY_BASE = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';

class SubAgentSession {
  constructor(sessionKey, agentId, agentName, prompt, options = {}) {
    this.sessionKey = sessionKey;
    this.agentId = agentId;
    this.agentName = agentName;
    this.prompt = prompt;
    this.status = 'spawning'; // spawning | running | idle | completed | failed | killed
    this.createdAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.messageCount = 0;
    this.options = options;
    this.result = null;
    // 每个子Agent独立workspace目录
    this.workspaceDir = path.join(WORKSPACE_ROOT, sessionKey);
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionKey → SubAgentSession
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
        // Restore sessions (mark as disconnected since server restart)
        if (Array.isArray(data)) {
          data.forEach(s => {
            if (s.status === 'running' || s.status === 'spawning') {
              s.status = 'disconnected';
            }
            this.sessions.set(s.sessionKey, Object.assign(new SubAgentSession(s.sessionKey, s.agentId, s.agentName, s.prompt), s));
          });
        }
      }
    } catch(e) {}
  }

  save() {
    try {
      const data = Array.from(this.sessions.values()).map(s => ({
        sessionKey: s.sessionKey,
        agentId: s.agentId,
        agentName: s.agentName,
        status: s.status,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        messageCount: s.messageCount,
        result: s.result,
        workspaceDir: s.workspaceDir
      }));
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch(e) {}
  }

  /**
   * Spawn a sub-agent using OpenClaw sessions API
   */
  async spawnSubAgent(agentId, prompt, options = {}) {
    const sessionKey = `sub_${agentId}_${Date.now().toString(36)}`;
    const agentName = options.agentName || agentId;

    const session = new SubAgentSession(sessionKey, agentId, agentName, prompt, options);
    this.sessions.set(sessionKey, session);
    this.save();

    // 创建独立workspace目录
    if (!fs.existsSync(WORKSPACE_ROOT)) {
      fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
    }
    fs.mkdirSync(session.workspaceDir, { recursive: true });

    try {
      // Call OpenClaw sessions_spawn via HTTP to the gateway
      const gatewayToken = this._getGatewayToken();
      const response = await fetch(`${GATEWAY_BASE}/__openclaw__/api/sessions/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`
        },
        body: JSON.stringify({
          runtime: 'subagent',
          task: prompt,
          agentId: options.openclawAgentId || null,
          label: `eCompany:${agentId}:${agentName}`,
          mode: 'session',
          timeoutSeconds: options.timeoutSeconds || 300,
          workspace: session.workspaceDir
        })
      });

      if (response.ok) {
        const data = await response.json();
        session.sessionKey = data.sessionKey || sessionKey;
        this.sessions.set(session.sessionKey, session);
        session.status = 'running';
        // 同步workspaceDir到sessions.json
        this.save();
      } else {
        // Gateway 不可用 — 降级为进程内模拟：使用 agent-executor 真正执行任务
        session.status = 'running';
        session.result = { mode: 'simulation', note: 'Gateway unavailable (HTTP ' + response.status + '), running in-process' };
        // 自动触发一次完整的 executeAgent 执行任务（带30秒超时）
        try {
          var execAgent = require('./agent-executor');
          var subTask = '你现在是子Agent ' + agentName + '（sessionKey:' + sessionKey + '）。\n【重要提醒】你必须使用可用工具来执行任务（如 read_file/list_directory/exec_command），不能只靠语言模型知识作答。\n请先使用工具获取最新数据，然后汇报结果。\n\n你的任务是：' + (prompt || '').substring(0, 2000);
          Promise.race([
            execAgent.executeAgent(agentId, subTask, {
              agentName: agentName,
              sessionKey: sessionKey,
              _isSubAgent: true,
              _autoSummary: false
            }),
            new Promise(function(r) { setTimeout(function() { r({ reply: '⏰ 子Agent执行超时(30s)，任务未完成: ' + subTask.substring(0, 200) }); }, 30000); })
          ]).then(function(execResult) {
            session.status = 'completed';
            session.result = session.result || {};
            session.result.mode = 'executed';
            session.result.toolCallCount = execResult && execResult.toolCallCount ? execResult.toolCallCount : 0;
            var rawResult = '';
            if (execResult && execResult.reply) {
              rawResult = typeof execResult.reply === 'string' ? execResult.reply.substring(0, 5000) : JSON.stringify(execResult.reply).substring(0, 5000);
              session.result.rawResult = rawResult;
            }
            session.result.executedAt = new Date().toISOString();
            session.lastActivity = new Date().toISOString();
            try { require('fs').writeFileSync(SESSIONS_FILE, JSON.stringify(session, null, 2)); } catch(e) {}

          }).catch(function(e) {          }).catch(function(e) {
            session.status = 'failed';
            session.result.error = e.message;
            session.lastActivity = new Date().toISOString();
            try { require('fs').writeFileSync(SESSIONS_FILE, JSON.stringify(session, null, 2)); } catch(e) {}
          });
        } catch(eSim) {
          session.result.initError = eSim.message;
        }
      }
    } catch(e) {
      // Gateway not available — run in-process simulation
      session.status = 'running';
      session.result = { mode: 'simulation', note: 'Gateway unavailable, running in simulation mode' };
    }

    session.lastActivity = new Date().toISOString();
    this.save();
    return {
      sessionKey: session.sessionKey,
      status: session.status,
      agentId,
      agentName,
      workspaceDir: session.workspaceDir
    };
  }

  /**
   * Get sub-agent session status
   */
  getSubAgentStatus(sessionKey) {
    const session = this.sessions.get(sessionKey);
    if (!session) return null;
    return {
      sessionKey: session.sessionKey,
      agentId: session.agentId,
      agentName: session.agentName,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messageCount: session.messageCount,
      result: session.result,
      workspaceDir: session.workspaceDir
    };
  }

  /**
   * Kill a sub-agent session
   */
  killSubAgent(sessionKey) {
    const session = this.sessions.get(sessionKey);
    if (!session) return false;
    session.status = 'killed';
    session.lastActivity = new Date().toISOString();
    // 清理workspace目录
    if (fs.existsSync(session.workspaceDir)) {
      try { fs.rmSync(session.workspaceDir, { recursive: true, force: true }); } catch(e) {}
    }
    this.save();
    return true;
  }

  /**
   * Send a message to a sub-agent session
   */
  async sendToSubAgent(sessionKey, message) {
    const session = this.sessions.get(sessionKey);
    if (!session) return { ok: false, error: 'Session not found' };

    session.lastActivity = new Date().toISOString();
    session.messageCount++;

    try {
      const gatewayToken = this._getGatewayToken();
      const response = await fetch(`${GATEWAY_BASE}/__openclaw__/api/sessions/${sessionKey}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`
        },
        body: JSON.stringify({ message })
      });

      if (response.ok) {
        this.save();
        return { ok: true };
      }
      return { ok: false, error: `Gateway error: ${response.status}` };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * List all sub-agent sessions
   */
  listSubAgents(filter) {
    // 从 JSON 文件恢复最新状态（异步回调可能已更新文件但未更新内存）
    try {
      if (require('fs').existsSync(SESSIONS_FILE)) {
        var fileData = JSON.parse(require('fs').readFileSync(SESSIONS_FILE, 'utf8'));
        var sk = fileData.sessionKey;
        if (sk && this.sessions.has(sk)) {
          var mem = this.sessions.get(sk);
          var fileStatus = fileData.status;
          if (fileStatus !== mem.status) {
            mem.status = fileStatus;
            mem.lastActivity = fileData.lastActivity || mem.lastActivity;
            mem.result = fileData.result || mem.result;
          }
        }
      }
    } catch(e) { /* 文件恢复失败不阻塞 */ }

    let sessions = Array.from(this.sessions.values());
    if (filter) {
      if (filter.status) sessions = sessions.filter(s => s.status === filter.status);
      if (filter.agentId) sessions = sessions.filter(s => s.agentId === filter.agentId);
    }
    return sessions.map(s => ({
      sessionKey: s.sessionKey,
      agentId: s.agentId,
      agentName: s.agentName,
      status: s.status,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      messageCount: s.messageCount,
      workspaceDir: s.workspaceDir,
      result: s.result
    }));
  }

  /**
   * Aggregate results from multiple sub-agents
   */
  async aggregateResults(sessionKeys, prompt) {
    const results = [];
    for (const sk of sessionKeys) {
      const session = this.sessions.get(sk);
      if (session && session.result) {
        results.push({ sessionKey: sk, agentId: session.agentId, result: session.result });
      }
    }

    if (results.length === 0) return { summary: 'No results from sub-agents', results: [] };

    // Generate aggregate summary using CEO agent
    try {
      const { runCEOCEO } = require('./ai-engine');
      const resultText = results.map(r => `[${r.agentId}] ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`).join('\n');
      const summaryPrompt = `以下是多个子Agent的执行结果，请总结：\n${resultText}\n\n用户要求的汇总任务：${prompt}`;
      const summary = await runCEOCEO(summaryPrompt);
      return { summary, results };
    } catch(e) {
      return { summary: '汇总失败: ' + e.message, results };
    }
  }

  /**
   * Update session status (called by orchestrator workflow)
   */
  updateStatus(sessionKey, status, result) {
    const session = this.sessions.get(sessionKey);
    if (!session) return false;
    session.status = status;
    if (result) session.result = result;
    session.lastActivity = new Date().toISOString();
    this.save();
    return true;
  }

  _getGatewayToken() {
    // Try to get token from environment or config file
    const tokenFile = path.join(BASE, '..', '.gateway-token');
    try {
      if (fs.existsSync(tokenFile)) {
        return fs.readFileSync(tokenFile, 'utf-8').trim();
      }
    } catch(e) {}
    return process.env.OPENCLAW_GATEWAY_TOKEN || '';
  }
}

// ========== SubAgent Orchestrator (基于现有 orchestrator.js 扩展) ==========

class SubAgentOrchestrator {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.workflows = [];
    this.stages = ['plan', 'execute', 'review', 'merge'];
  }

  /**
   * 创建子Agent工作流
   * config.subTasks = [{ name, agentId, prompt, depends }]
   */
  createWorkflow(config) {
    var wf = {
      id: 'wf_' + Date.now().toString(36),
      name: config.name || 'unnamed',
      description: config.description || '',
      status: 'created',
      stage: 'plan',
      subTasks: (config.subTasks || []).map((st, i) => ({
        id: 'st_' + Date.now().toString(36) + '_' + i,
        name: st.name || st,
        agentId: st.agentId || 'ai_ceo',
        agentName: st.agentName || st.agentId || 'AI助手',
        prompt: st.prompt || st.description || st.name,
        depends: st.depends || null,
        status: 'pending',
        sessionKey: null,
        result: null,
        workspaceDir: null,
        assignedAt: null,
        completedAt: null
      })),
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      aggregateResult: null
    };

    this.workflows.push(wf);
    if (this.workflows.length > 100) this.workflows = this.workflows.slice(-100);
    return wf;
  }

  /**
   * 并行执行所有就绪的子任务（依赖已完成的任务）
   */
  async executeWorkflow(workflowId) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;

    wf.status = 'running';
    wf.startedAt = new Date().toISOString();

    // 并行启动所有就绪子任务
    const readyTasks = wf.subTasks.filter(t => {
      if (t.status !== 'pending') return false;
      if (!t.depends) return true;
      const dep = wf.subTasks.find(s => s.name === t.depends);
      return dep && dep.status === 'completed';
    });

    const spawnPromises = readyTasks.map(t => this._spawnSubTask(wf, t));
    await Promise.allSettled(spawnPromises);

    // 检查是否全部完成
    const allDone = wf.subTasks.every(t => t.status === 'completed' || t.status === 'failed');
    if (allDone) {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
      wf.result = 'All sub-tasks completed';
      // 聚合结果
      wf.aggregateResult = await this.sessionManager.aggregateResults(
        wf.sessionKeys.filter(sk => sk),
        wf.name
      );
    } else {
      this._advanceStage(wf);
    }

    wf.updatedAt = new Date().toISOString();
    this.saveWorkflows();
    return wf;
  }

  async _spawnSubTask(wf, task) {
    task.status = 'spawning';
    task.assignedAt = new Date().toISOString();
    wf.updatedAt = new Date().toISOString();

    try {
      const spawnResult = await this.sessionManager.spawnSubAgent(task.agentId, task.prompt, {
        agentName: task.agentName,
        timeoutSeconds: 300
      });

      task.sessionKey = spawnResult.sessionKey;
      task.workspaceDir = spawnResult.workspaceDir;
      task.status = 'running';
      wf.sessionKeys.push(spawnResult.sessionKey);
    } catch(e) {
      task.status = 'failed';
      task.result = { error: e.message };
    }

    wf.updatedAt = new Date().toISOString();
    this.saveWorkflows();
  }

  /**
   * 更新子任务状态（由外部轮询调用）
   */
  updateTaskStatus(workflowId, subTaskId, status, result) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;

    var task = wf.subTasks.find(t => t.id === subTaskId);
    if (!task) return null;

    task.status = status;
    if (result) task.result = result;
    if (status === 'completed') task.completedAt = new Date().toISOString();

    // 检查是否全部完成
    const allDone = wf.subTasks.every(t => t.status === 'completed' || t.status === 'failed');
    if (allDone) {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
      wf.result = 'All sub-tasks completed';
      this.sessionManager.aggregateResults(wf.sessionKeys.filter(sk => sk), wf.name)
        .then(r => { wf.aggregateResult = r; this.saveWorkflows(); });
    } else {
      this._advanceStage(wf);
    }

    wf.updatedAt = new Date().toISOString();
    this.saveWorkflows();
    return task;
  }

  _advanceStage(wf) {
    var stages = this.stages;
    var currentIdx = stages.indexOf(wf.stage);
    if (currentIdx < stages.length - 1) {
      wf.stage = stages[currentIdx + 1];
    } else {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
    }
    wf.updatedAt = new Date().toISOString();
  }

  getWorkflow(workflowId) {
    return this._findWorkflow(workflowId);
  }

  _findWorkflow(id) {
    return this.workflows.find(w => w.id === id) || null;
  }

  listWorkflows(limit) {
    limit = limit || 20;
    return this.workflows.slice(-limit).reverse();
  }

  cancelWorkflow(workflowId) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;
    wf.status = 'cancelled';
    wf.updatedAt = new Date().toISOString();
    // Kill all sub-agents
    wf.subTasks.forEach(t => {
      if (t.sessionKey) this.sessionManager.killSubAgent(t.sessionKey);
    });
    this.saveWorkflows();
    return wf;
  }

  getStats() {
    return {
      totalWorkflows: this.workflows.length,
      activeWorkflows: this.workflows.filter(w => w.status === 'running').length,
      completedWorkflows: this.workflows.filter(w => w.status === 'completed').length,
      totalSubAgents: this.sessionManager.sessions.size,
      activeSubAgents: this.sessionManager.listSubAgents({ status: 'running' }).length
    };
  }

  saveWorkflows() {
    try {
      const wfFile = path.join(BASE, '..', 'workflows.json');
      fs.writeFileSync(wfFile, JSON.stringify(this.workflows, null, 2));
    } catch(e) {}
  }
}

// ========== Singleton ==========

const sessionManager = new SessionManager();
const orchestrator = new SubAgentOrchestrator(sessionManager);

module.exports = { sessionManager, orchestrator, SubAgentSession };