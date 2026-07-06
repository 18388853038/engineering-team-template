/**
 * eCompany 行为边界系统
 * 功能：
 *   1. Agent 工具白名单（角色级 + 个人级）
 *   2. 工具调用频控（每��钟/小时/天）— 委托规则引擎
 *   3. 调用审计
 *   4. 边界违反告警
 *
 * v2 — Harness Phase 2：规则引擎替换硬编码限制
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const OVERRIDES_FILE = path.join(BASE, 'agent-overrides.json');
const STATS_FILE = path.join(BASE, 'agent-tool-stats.json');

// 引用规则引擎（代替硬编码 DEFAULTS）
const harnessRules = require('./harness-rules');

class AgentBoundary {
  constructor() {
    this.config = this._load();
    this.toolStats = this._loadStats();
    this._startHousekeeping();
  }

  _load() {
    try {
      if (fs.existsSync(OVERRIDES_FILE)) {
        const raw = fs.readFileSync(OVERRIDES_FILE, 'utf-8');
        var cfg = JSON.parse(raw);
        if (!cfg.agentOverrides) cfg.agentOverrides = {};
        return cfg;
      }
    } catch(e) {}
    return { agentOverrides: {} };
  }

  _save() {
    try {
      fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch(e) {}
  }

  _loadStats() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        var raw = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
        // 确保字段存在，兼容恢复出厂后的空对象
        if (!Array.isArray(raw.calls)) raw.calls = [];
        if (!Array.isArray(raw.violations)) raw.violations = [];
        return raw;
      }
    } catch(e) {}
    return { calls: [], violations: [] };
  }

  _saveStats() {
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(this.toolStats, null, 2), 'utf-8');
    } catch(e) {}
  }

  _startHousekeeping() {
    // Periodic cleanup of old stats (every 5 min)
    setInterval(() => {
      const cutoff = Date.now() - 86400000; // 24 hours
      this.toolStats.calls = this.toolStats.calls.filter(c => c.ts > cutoff);
      this.toolStats.violations = this.toolStats.violations.filter(v => v.ts > cutoff);
      if (this.toolStats.calls.length > 10000) this.toolStats.calls = this.toolStats.calls.slice(-5000);
      if (this.toolStats.violations.length > 5000) this.toolStats.violations = this.toolStats.violations.slice(-1000);
      this._saveStats();
    }, 300000).unref();
  }

  // ========== 规则引擎检查（v2 — 委托规则引擎）==========

  /**
   * 检查 Agent 是否可以使用某工具（个人级覆盖优先，其余委托规则引擎）
   */
  checkToolPermission(agentId, agentRole, toolName) {
    const agentOverride = this.config.agentOverrides[agentId];
    
    // 个人级覆盖（白名单）
    if (agentOverride && agentOverride.allowedTools) {
      return agentOverride.allowedTools.includes(toolName);
    }
    // 个人级覆盖（黑名单）
    if (agentOverride && agentOverride.blockedTools) {
      if (agentOverride.blockedTools.includes(toolName)) return false;
    }
    
    // 角色级白名单（通过 agent-engine 的 ROLE_TOOLS）
    return true;
  }

  /**
   * 通过规则引擎检查频率限制
   */
  checkRateLimit(agentId, toolName) {
    const agentRole = this._getAgentRole(agentId);
    const ctx = this._buildRuleContext(agentId, agentRole, toolName);
    var engine;
    try { engine = harnessRules.getInstance(); } catch(e) {}
    if (!engine) return { allowed: true, warn: '规则引擎暂未就绪' };
    const result = engine.check(ctx);
    
    if (result.action === 'block') {
      return { allowed: false, reason: result.reasons.join('; '), rules: result.triggered };
    }
    if (result.action === 'warn') {
      return { allowed: true, warn: true, reason: result.reasons.join('; '), rules: result.triggered };
    }
    return { allowed: true };
  }

  /**
   * 构建规则引擎上下文
   */
  _buildRuleContext(agentId, agentRole, toolName) {
    const now = Date.now();
    const minuteAgo = now - 60000;
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;

    const agentCalls = this.toolStats.calls.filter(c => c.agentId === agentId);
    const toolCalls = agentCalls.filter(c => c.toolName === toolName);

    return {
      agentId,
      agentRole,
      agentName: this._getAgentName(agentId),
      toolName,
      callsPerMinute: agentCalls.filter(c => c.ts > minuteAgo).length,
      callsPerHour: agentCalls.filter(c => c.ts > hourAgo).length,
      callsPerDay: agentCalls.filter(c => c.ts > dayAgo).length,
      toolCallsPerMinute: toolCalls.filter(c => c.ts > minuteAgo).length,
      toolCallsPerHour: toolCalls.filter(c => c.ts > hourAgo).length
    };
  }

  _getAgentRole(agentId) {
    try {
      var db = require('./database');
      var agent = db.agentOps.get(agentId);
      return agent ? agent.role : 'staff';
    } catch(e) { return 'staff'; }
  }

  _getAgentName(agentId) {
    try {
      var db = require('./database');
      var agent = db.agentOps.get(agentId);
      return agent ? agent.name : agentId;
    } catch(e) { return agentId; }
  }

  /**
   * 记录工具调用
   */
  recordCall(agentId, agentName, toolName, allowed) {
    this.toolStats.calls.push({
      agentId, agentName, toolName,
      allowed,
      ts: Date.now()
    });
    
    if (!allowed) {
      this.toolStats.violations.push({
        agentId, agentName, toolName,
        ts: Date.now(),
        reason: 'rate_limit'
      });
    }
    
    this._saveStats();
  }

  /**
   * 检查任务配额
   */
  checkTaskQuota(agentId) {
    const agentOverride = this.config.agentOverrides[agentId];
    if (!agentOverride) return { allowed: true };
    
    const maxTasks = agentOverride.maxTasks || 0;
    const dailyTasks = agentOverride.dailyTasks || 0;
    
    if (!maxTasks && !dailyTasks) return { allowed: true };
    
    const now = Date.now();
    const dayAgo = now - 86400000;
    
    // Count current running tasks for this agent
    const todayCalls = this.toolStats.calls.filter(c => c.agentId === agentId && c.ts > dayAgo).length;
    
    if (dailyTasks && todayCalls >= dailyTasks) {
      return { allowed: false, reason: '超过每日任务上限', limit: dailyTasks, type: 'daily_quota' };
    }
    
    // Max parallel - check active running (approximated by recent calls without subsequent completion)
    if (maxTasks) {
      const recentCalls = this.toolStats.calls.filter(c => c.agentId === agentId && c.ts > now - 60000).length;
      if (recentCalls >= maxTasks) {
        return { allowed: false, reason: '超过最大并行任务数', limit: maxTasks, type: 'parallel_quota' };
      }
    }
    
    return { allowed: true };
  }

  /**
   * 一站式检查 + 记录（v2 — 委托规则引擎）
   */
  checkAndRecord(agentId, agentName, agentRole, toolName) {
    // 0. 个人级覆盖优先级最高
    if (!this.checkToolPermission(agentId, agentRole, toolName)) {
      this.recordCall(agentId, agentName, toolName, false);
      return { allowed: false, reason: '个人级黑名单禁止', type: 'permission' };
    }
    
    // 1. 构建上下文并委托规则引擎
    const ctx = this._buildRuleContext(agentId, agentRole, toolName);
    ctx.agentName = agentName;
    var engine;
    try { engine = harnessRules.getInstance(); } catch(e) {}
    const engineResult = engine ? engine.check(ctx) : { action: 'allow', reasons: [], triggered: [] };
    
    // 2. 检查任务配额
    const quotaResult = this.checkTaskQuota(agentId);
    if (!quotaResult.allowed) {
      this.recordCall(agentId, agentName, toolName, false);
      return { allowed: false, reason: quotaResult.reason, type: quotaResult.type, detail: quotaResult };
    }
    
    // 3. 规则引擎裁决
    if (engineResult.action === 'block') {
      this.recordCall(agentId, agentName, toolName, false);
      return { allowed: false, reason: engineResult.reasons.join('; '), type: 'rule_engine', rules: engineResult.triggered };
    }
    
    // 4. 通过（含 warn）
    this.recordCall(agentId, agentName, toolName, true);
    return { allowed: true, warn: engineResult.action === 'warn' ? engineResult.reasons : undefined };
  }

  // ========== 配置管理（v2 — 规则引擎接管限频配置）==========

  /**
   * 获取完整配置（含规则引擎统计）
   */
  getConfig() {
    var engine;
    try { engine = harnessRules.getInstance(); } catch(e) {}
    return {
      agentOverrides: this.config.agentOverrides,
      ruleEngine: engine ? engine.getStats() : { total:0, byStatus:{}, byType:{}, topTools:[] },
      pendingRules: engine ? engine.getPendingRules() : [],
      rateLimits: this.config.rateLimits || { perMinute: 100, perHour: 1000, perDay: 5000 },
      toolRateLimits: this.config.toolRateLimits || {},
      stats: this.getStats()
    };
  }

  /**
   * 设置 Agent 覆盖
   */
  updateRateLimits(limits) {
    this.config.rateLimits = { ...(this.config.rateLimits || {}), ...limits };
    this._save();
  }

  updateToolRateLimit(toolName, limits) {
    if (!this.config.toolRateLimits) this.config.toolRateLimits = {};
    this.config.toolRateLimits[toolName] = { ...(this.config.toolRateLimits[toolName] || {}), ...limits };
    this._save();
  }

  setAgentOverride(agentId, override) {
    if (!override || (Object.keys(override).length === 0)) {
      delete this.config.agentOverrides[agentId];
    } else {
      this.config.agentOverrides[agentId] = {
        ...(this.config.agentOverrides[agentId] || {}),
        ...override
      };
    }
    this._save();
  }

  /**
   * 获取 Agent 覆盖
   */
  getAgentOverride(agentId) {
    return this.config.agentOverrides[agentId] || null;
  }

  // ========== 统计 ==========

  getStats() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;
    
    const totalCalls = this.toolStats.calls.length;
    const recentCalls = this.toolStats.calls.filter(c => c.ts > hourAgo).length;
    const todayCalls = this.toolStats.calls.filter(c => c.ts > dayAgo).length;
    const violations = this.toolStats.violations.length;
    const recentViolations = this.toolStats.violations.filter(v => v.ts > hourAgo).length;
    
    // 按 Agent 统计
    const byAgent = {};
    this.toolStats.calls.forEach(c => {
      if (!byAgent[c.agentId]) byAgent[c.agentId] = { agentName: c.agentName, total: 0, blocked: 0, tools: {} };
      byAgent[c.agentId].total++;
      if (!c.allowed) byAgent[c.agentId].blocked++;
      if (!byAgent[c.agentId].tools[c.toolName]) byAgent[c.agentId].tools[c.toolName] = 0;
      byAgent[c.agentId].tools[c.toolName]++;
    });
    
    // 按工具统计
    const byTool = {};
    this.toolStats.calls.forEach(c => {
      if (!byTool[c.toolName]) byTool[c.toolName] = { total: 0, blocked: 0 };
      byTool[c.toolName].total++;
      if (!c.allowed) byTool[c.toolName].blocked++;
    });
    
    return {
      totalCalls, recentCalls, todayCalls,
      violations, recentViolations,
      byAgent, byTool,
      topBlocked: Object.entries(byAgent)
        .sort((a, b) => b[1].blocked - a[1].blocked)
        .slice(0, 5)
        .map(([id, data]) => ({ agentId: id, agentName: data.agentName, blocked: data.blocked }))
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.toolStats = { calls: [], violations: [] };
    this._saveStats();
  }
}

let instance = null;
function getInstance() {
  if (!instance) instance = new AgentBoundary();
  return instance;
}

module.exports = { AgentBoundary, getInstance };
