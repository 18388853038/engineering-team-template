/**
 * eCompany Harness 规则引擎 — Phase 2 核心模块
 *
 * 2026-06-10 重构: 按 10 条宪章原则重建内置规则
 *   - 新增 constitutional 规则类型（架构层约束）
 *   - 新增 enforceMode 字段: engine/rate_limit/permission/pipeline
 *   - 移除虚设的硬编码频率限制规则
 *
 * 功能：
 *   1. 规则定义/存储/版本管理
 *   2. 规则验证引擎（逐条匹配 condition → action）
 *   3. 多签确认流程（propose → confirm/reject → activate）
 *   4. 宪章规则查询（constitutional rules）
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const RULES_FILE = path.join(BASE, 'harness-rules.json');
const HISTORY_FILE = path.join(BASE, 'harness-rules-history.json');

// ====== 宪章规则（Constitutional Rules）— 10 条架构原则 ======
// 这些规则编码为机器可读的结构化数据，由 pipeline 工具（harness-constitution CLI）执行
const BUILTIN_RULES = require(RULES_FILE);
if (!Array.isArray(BUILTIN_RULES)) {
  // fallback — 不应发生，但防止空文件导致崩溃
  BUILTIN_RULES = [];
}

// ====== 规则引擎类 ======
class HarnessRuleEngine {
  constructor(options) {
    this.rules = [];
    this.history = [];
    this.coreMemory = null;
    this._load();
    this._ensureBuiltins();
  }

  // ── 持久化 ──

  _load() {
    try {
      if (fs.existsSync(RULES_FILE)) {
        const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
        // 确保是数组（兼容空对象场景）
        if (Array.isArray(raw)) {
          this.rules = raw;
        } else {
          this.rules = [];
        }
      }
    } catch (e) {
      // first run — 用 require 的默认规则
      this.rules = Array.isArray(BUILTIN_RULES) ? [...BUILTIN_RULES] : [];
    }

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        this.history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      }
    } catch (e) {}
  }

  _save() {
    try {
      fs.writeFileSync(RULES_FILE, JSON.stringify(this.rules, null, 2), 'utf-8');
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (e) {}
  }

  _ensureBuiltins() {
    // 确保所有内置规则存在（不覆盖用户修改）
    let changed = false;
    const defaultRules = Array.isArray(BUILTIN_RULES) ? BUILTIN_RULES : [];
    for (const builtin of defaultRules) {
      const exists = this.rules.find(r => r.id === builtin.id);
      if (!exists) {
        this.rules.push({ ...builtin, status: builtin.status || 'active' });
        changed = true;
      }
    }
    if (changed) this._save();
  }

  // ── 核心记忆库集成 ──

  _setCoreMemory(cm) {
    this.coreMemory = cm;
  }

  _logToCoreMemory(event) {
    if (!this.coreMemory) return;
    try {
      if (typeof this.coreMemory.writeMemory === 'function') {
        this.coreMemory.writeMemory({
          type: 'harness_rule',
          data: event,
          tags: ['harness', 'rule', event.action]
        });
      }
    } catch (e) {}
  }

  // ====== 宪章规则查询 ======

  /**
   * 获取所有 constitutional 类型的规则
   */
  getConstitutionalRules() {
    return this.rules.filter(r => r.type === 'constitutional');
  }

  /**
   * 按 enforceMode 分组获取规则
   */
  getRulesByEnforceMode() {
    const groups = { engine: [], rate_limit: [], permission: [], pipeline: [], manual: [] };
    for (const r of this.rules) {
      groups[r.enforceMode || 'manual'].push(r);
    }
    return groups;
  }

  // ── 规则 CRUD ──

  /**
   * 获取所有规则（可按状态/类型/severity 过滤）
   */
  getRules(filters) {
    filters = filters || {};
    let result = [...this.rules];

    if (filters.status) {
      result = result.filter(r => r.status === filters.status);
    }
    if (filters.type) {
      result = result.filter(r => r.type === filters.type);
    }
    if (filters.severity) {
      result = result.filter(r => r.severity === filters.severity);
    }
    if (filters.enforceMode) {
      result = result.filter(r => r.enforceMode === filters.enforceMode);
    }
    if (filters.active !== undefined) {
      result = result.filter(r => (r.status === 'active') === filters.active);
    }

    return {
      total: result.length,
      rules: result
    };
  }

  /**
   * 获取单条规则
   */
  getRule(ruleId) {
    return this.rules.find(r => r.id === ruleId) || null;
  }

  /**
   * 提议新规则（propose → 进入 pending 状态）
   */
  proposeRule(ruleData, proposedBy) {
    if (!ruleData.type || !ruleData.name) {
      return { success: false, error: '规则必须包含 type 和 name' };
    }

    const validTypes = ['rate_limit', 'permission', 'compliance', 'operation', 'constitutional'];
    if (!validTypes.includes(ruleData.type)) {
      return { success: false, error: '无效规则类型，允许: ' + validTypes.join(', ') };
    }

    // constitutional 规则仅来自宪章，不允许随意 propose
    if (ruleData.type === 'constitutional') {
      return { success: false, error: '宪章规则（constitutional）不可通过 propose 修改，请修改 harness-rules.json' };
    }

    // 新提议的规则不能直接 active
    if (ruleData.status === 'active') {
      return { success: false, error: '新建规则不能直接激活，需走 propose → confirm 流程' };
    }

    const validEnforceModes = ['engine', 'rate_limit', 'permission', 'pipeline', 'manual'];
    const rule = {
      id: 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      type: ruleData.type,
      name: ruleData.name || '未命名规则',
      scope: ruleData.scope || { agent: null, tool: null },
      condition: ruleData.condition || '',
      action: ruleData.action || 'block',
      reason: ruleData.reason || '',
      severity: ruleData.severity || 'medium',
      enforceMode: validEnforceModes.includes(ruleData.enforceMode) ? ruleData.enforceMode : 'engine',
      status: 'proposed',
      proposedBy: proposedBy || 'unknown',
      confirmedBy: null,
      rejectedBy: null,
      rejectReason: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.rules.push(rule);
    this._addHistory(rule.id, 'proposed', { proposedBy });
    this._save();
    this._logToCoreMemory({
      action: 'rule_proposed',
      ruleId: rule.id,
      ruleName: rule.name,
      proposedBy
    });

    return { success: true, rule };
  }

  /**
   * 确认规则（confirm → 激活）
   */
  confirmRule(ruleId, confirmedBy, note) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return { success: false, error: '规则不存在' };
    if (rule.status !== 'proposed') {
      return { success: false, error: '只有 proposed 状态的规则可以确认' };
    }

    rule.status = 'active';
    rule.confirmedBy = confirmedBy;
    rule.confirmNote = note || '';
    rule.updatedAt = new Date().toISOString();
    rule.version = (rule.version || 1) + 1;

    this._addHistory(ruleId, 'confirmed', { confirmedBy, note });
    this._save();

    return { success: true, rule };
  }

  /**
   * 驳回规则
   */
  rejectRule(ruleId, rejectedBy, reason) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return { success: false, error: '规则不存在' };
    if (rule.status !== 'proposed') {
      return { success: false, error: '只有 proposed 状态的规则可以驳回' };
    }

    rule.status = 'rejected';
    rule.rejectedBy = rejectedBy;
    rule.rejectReason = reason || '未提供理由';
    rule.updatedAt = new Date().toISOString();

    this._addHistory(ruleId, 'rejected', { rejectedBy, reason });
    this._save();

    return { success: true, rule };
  }

  /**
   * 停用规则（deprecate）
   */
  deprecateRule(ruleId, deprecateBy, reason) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return { success: false, error: '规则不存在' };
    if (rule.status !== 'active') {
      return { success: false, error: '只有 active 状态的规则可以停用' };
    }

    rule.status = 'deprecated';
    rule.deprecatedBy = deprecateBy;
    rule.deprecateReason = reason || '';
    rule.updatedAt = new Date().toISOString();

    this._addHistory(ruleId, 'deprecated', { deprecateBy, reason });
    this._save();

    return { success: true, rule };
  }

  // ── 历史记录 ──

  _addHistory(ruleId, action, details) {
    this.history.push({
      ruleId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }

  /**
   * 获取规则变更历史
   */
  getRuleHistory(ruleId) {
    let entries = this.history;
    if (ruleId) {
      entries = entries.filter(h => h.ruleId === ruleId);
    }
    return entries.slice(-100).reverse();
  }

  /**
   * 获取待确认规则
   */
  getPendingRules() {
    return this.rules.filter(r => r.status === 'proposed');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.rules.length,
      byStatus: {
        active: this.rules.filter(r => r.status === 'active').length,
        proposed: this.rules.filter(r => r.status === 'proposed').length,
        rejected: this.rules.filter(r => r.status === 'rejected').length,
        deprecated: this.rules.filter(r => r.status === 'deprecated').length
      },
      byType: {
        rate_limit: this.rules.filter(r => r.type === 'rate_limit').length,
        permission: this.rules.filter(r => r.type === 'permission').length,
        compliance: this.rules.filter(r => r.type === 'compliance').length,
        operation: this.rules.filter(r => r.type === 'operation').length,
        constitutional: this.rules.filter(r => r.type === 'constitutional').length
      },
      byEnforceMode: {
        engine: this.rules.filter(r => r.enforceMode === 'engine').length,
        rate_limit: this.rules.filter(r => r.enforceMode === 'rate_limit').length,
        permission: this.rules.filter(r => r.enforceMode === 'permission').length,
        pipeline: this.rules.filter(r => r.enforceMode === 'pipeline').length,
        manual: this.rules.filter(r => r.enforceMode === 'manual').length
      },
      historyCount: this.history.length
    };
  }

  // ====== 规则验证引擎 ======

  /**
   * 验证操作是否符合所有 active 规则
   *
   * @param {Object} ctx - 验证上下文
   *   ctx.agentId, ctx.agentRole, ctx.agentName
   *   ctx.toolName
   *   ctx.callsPerMinute, ctx.callsPerHour, ctx.callsPerDay
   *   ctx.activeTasks
   *   ctx.path, ctx.extra
   *   ctx.toolCallsPerMinute
   * @returns {Array} 验证结果数组
   */
  validate(ctx) {
    const activeRules = this.rules.filter(r =>
      r.status === 'active' &&
      (r.enforceMode === 'engine' || r.enforceMode === 'rate_limit' || r.enforceMode === 'permission')
    );
    const results = [];

    for (const rule of activeRules) {
      // 跳过 constitutional 规则 — 由外部 pipeline 工具执行
      if (rule.type === 'constitutional') continue;

      // 检查作用域匹配
      if (!this._matchScope(rule.scope, ctx)) continue;

      // 检查条件
      if (!rule.condition || !this._evaluateCondition(rule.condition, ctx)) continue;

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        type: rule.type,
        action: rule.action || 'block',
        reason: rule.reason,
        severity: rule.severity,
        enforceMode: rule.enforceMode || 'engine'
      });
    }

    return results;
  }

  /**
   * 一站式检查：返回 block 优先级最高，其次 warn
   */
  check(ctx) {
    const results = this.validate(ctx);
    const blocks = results.filter(r => r.action === 'block');
    const warns = results.filter(r => r.action === 'warn');

    if (blocks.length > 0) {
      return {
        allowed: false,
        action: 'block',
        reasons: blocks.map(r => r.reason),
        triggered: blocks
      };
    }

    if (warns.length > 0) {
      return {
        allowed: true,
        action: 'warn',
        reasons: warns.map(r => r.reason),
        triggered: warns
      };
    }

    return {
      allowed: true,
      action: 'allow',
      reasons: [],
      triggered: []
    };
  }

  /**
   * 判断作用域是否匹配
   */
  _matchScope(scope, ctx) {
    if (!scope) return true;

    if (scope.agent && scope.agent !== ctx.agentId) return false;

    if (scope.role) {
      if (Array.isArray(scope.role)) {
        if (!scope.role.includes(ctx.agentRole)) return false;
      } else if (scope.role !== ctx.agentRole) {
        return false;
      }
    }

    if (scope.tool) {
      if (Array.isArray(scope.tool)) {
        let matched = false;
        for (const t of scope.tool) {
          if (t.endsWith('*')) {
            const prefix = t.slice(0, -1);
            if (ctx.toolName && ctx.toolName.startsWith(prefix)) { matched = true; break; }
          } else if (t === ctx.toolName) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      } else if (scope.tool !== ctx.toolName) {
        return false;
      }
    }

    return true;
  }

  /**
   * 条件评估
   */
  _evaluateCondition(condition, ctx) {
    if (!condition) return true;

    const patterns = [
      /^tool\.callsPerMinute\s*(>=|<=|>|<|==|!=)\s*(\d+)$/,
      /^agent\.(callsPerMinute|callsPerHour|callsPerDay|activeTasks|failedCount)\s*(>=|<=|>|<|==|!=)\s*(\d+)$/,
      /^context\.path\s+matches\s+(.+)$/i,
      /^agent\.role\s+in\s+scope\.role$/i,
      /^tool\.name\s+in\s+\[(.+)\]$/,
      /^tool\.name\s+matches\s+(.+)$/i
    ];

    for (const pat of patterns) {
      const m = condition.match(pat);
      if (!m) continue;

      if (pat === patterns[0]) {
        const val = this._getCtxValue(ctx, 'toolCallsPerMinute');
        if (val === undefined) return false;
        return this._compare(val, m[1], parseInt(m[2]));
      }

      if (pat === patterns[1]) {
        const val = this._getCtxValue(ctx, m[1]);
        if (val === undefined) return false;
        return this._compare(val, m[2], parseInt(m[3]));
      }

      if (pat === patterns[2]) {
        const pattern = m[1].replace(/^["']|["']$/g, '');
        const path = ctx.path || '';
        try {
          return new RegExp(pattern, 'i').test(path);
        } catch (e) {
          return path.includes(pattern);
        }
      }

      if (pat === patterns[3]) {
        return true;
      }

      if (pat === patterns[4]) {
        const names = m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        const toolName = ctx.toolName || '';
        for (const name of names) {
          if (name.endsWith('*')) {
            if (toolName.startsWith(name.slice(0, -1))) return true;
          } else if (name === toolName) {
            return true;
          }
        }
        return false;
      }

      if (pat === patterns[5]) {
        const pattern = m[1].replace(/^["']|["']$/g, '');
        const toolName = ctx.toolName || '';
        try {
          return new RegExp(pattern, 'i').test(toolName);
        } catch (e) {
          return toolName.includes(pattern);
        }
      }
    }

    return false;
  }

  _getCtxValue(ctx, field) {
    const map = {
      'callsPerMinute': ctx.callsPerMinute,
      'callsPerHour': ctx.callsPerHour,
      'callsPerDay': ctx.callsPerDay,
      'activeTasks': ctx.activeTasks,
      'failedCount': ctx.failedCount,
      'toolCallsPerMinute': ctx.toolCallsPerMinute,
      'toolCallsPerHour': ctx.toolCallsPerHour
    };
    return map[field];
  }

  _compare(val, op, target) {
    switch (op) {
      case '>=': return val >= target;
      case '<=': return val <= target;
      case '>': return val > target;
      case '<': return val < target;
      case '==': return val === target;
      case '!=': return val !== target;
      default: return false;
    }
  }
}

// ====== 单例 ======
let instance = null;
function getInstance(options) {
  if (!instance) {
    instance = new HarnessRuleEngine(options || {});
  }
  return instance;
}

module.exports = {
  HarnessRuleEngine,
  getInstance,
  BUILTIN_RULES
};
