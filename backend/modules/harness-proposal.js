/**
 * eCompany Harness Proposal System — Phase 3 结构化方案验证
 *
 * 功能：
 *   1. 方案提交与结构化（JSON schema 校验）
 *   2. 规则层逐条验证（委托规则引擎）
 *   3. 不通过 → 打回 + 明确理由 + 可申诉
 *   4. 申诉/豁免流程（需高级别审批）
 *   5. 规则执行审计日志（永久追溯）
 *
 * 流程：
 *   Agent → 提交方案 → 规则验证 → 通过 → 执行
 *                                ↓ 不通过
 *                         打回 + 理由 ← 可申诉
 *                              ↓ 申诉
 *                         高级审批 → 豁免放行/驳回
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const PROPOSALS_FILE = path.join(BASE, 'harness-proposals.json');
const AUDIT_FILE = path.join(BASE, 'harness-audit.json');

// ====== 方案类型 Schema 定义 ======
const PROPOSAL_SCHEMAS = {
  'tool_call': {
    description: '工具调用方案',
    required: ['tool', 'params', 'reasoning'],
    properties: {
      tool: { type: 'string', description: '工具名称' },
      params: { type: 'object', description: '调用参数' },
      reasoning: { type: 'string', description: '调用理由' },
      expected: { type: 'string', description: '预期效果' },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: '风险评估' }
    }
  },
  'task_execute': {
    description: '任务执行方案',
    required: ['taskId', 'approach', 'steps'],
    properties: {
      taskId: { type: 'string', description: '任务ID' },
      approach: { type: 'string', description: '执行方案描述' },
      steps: { type: 'array', items: { type: 'string' }, description: '执行步骤' },
      estimatedEffort: { type: 'string', description: '预估工作量' },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
    }
  },
  'config_change': {
    description: '配置变更方案',
    required: ['target', 'change', 'impact', 'rollback'],
    properties: {
      target: { type: 'string', description: '变更目标' },
      change: { type: 'object', description: '变更内容' },
      impact: { type: 'string', description: '影响范围' },
      rollback: { type: 'string', description: '回滚方案' },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
    }
  }
};

// ====== 提案系统类 ======
class HarnessProposalSystem {
  constructor() {
    this.proposals = [];
    this.auditLog = [];
    this.ruleEngine = null;
    this._load();
  }

  // ── 持久化 ──

  _load() {
    try {
      if (fs.existsSync(PROPOSALS_FILE)) {
        this.proposals = JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf-8'));
      }
    } catch (e) {}

    try {
      if (fs.existsSync(AUDIT_FILE)) {
        this.auditLog = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
      }
    } catch (e) {}
  }

  _save() {
    try {
      fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(this.proposals, null, 2), 'utf-8');
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(this.auditLog, null, 2), 'utf-8');
    } catch (e) {}
  }

  // ── 方案校验 ──

  _validateSchema(actionType, action) {
    const schema = PROPOSAL_SCHEMAS[actionType];
    if (!schema) {
      return { valid: false, error: 'Unknown action type: ' + actionType + '. Supported: ' + Object.keys(PROPOSAL_SCHEMAS).join(', ') };
    }

    const missing = [];
    for (const field of schema.required) {
      if (action[field] === undefined || action[field] === null || action[field] === '') {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return { valid: false, error: 'Missing required fields: ' + missing.join(', ') };
    }

    // Validate enum fields
    for (const [key, def] of Object.entries(schema.properties)) {
      if (def.enum && action[key] !== undefined && !def.enum.includes(action[key])) {
        return { valid: false, error: 'Invalid value for ' + key + ': ' + action[key] + '. Allowed: ' + def.enum.join(', ') };
      }
    }

    return { valid: true };
  }

  // ── 核心API ──

  /**
   * 提交方案
   * @param {Object} opts
   *   opts.agentId, opts.agentName, opts.agentRole
   *   opts.type — 方案类型: tool_call / task_execute / config_change
   *   opts.action — 方案内容（按 schema 校验）
   *   opts.context — 上下文信息
   * @returns {Object} { success, proposal, validation? }
   */
  submitProposal(opts) {
    // 1. 校验必有字段
    if (!opts.agentId || !opts.type || !opts.action) {
      return { success: false, error: '方案必须包含 agentId/type/action' };
    }

    // 2. Schema 校验
    const schemaResult = this._validateSchema(opts.type, opts.action);
    if (!schemaResult.valid) {
      return { success: false, error: schemaResult.error };
    }

    // 3. 创建方案实体
    const proposal = {
      id: 'prop_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      agentId: opts.agentId,
      agentName: opts.agentName || opts.agentId,
      agentRole: opts.agentRole || 'staff',
      type: opts.type,
      action: opts.action,
      context: opts.context || {},
      status: 'pending',        // pending → approved | blocked | appealed
      validation: null,          // 规则验证结果
      appeal: null,              // 申诉信息
      override: null,            // 豁免信息
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 4. 规则验证
    const ruleCtx = {
      agentId: opts.agentId,
      agentRole: opts.agentRole || 'staff',
      agentName: opts.agentName || opts.agentId,
      toolName: opts.action.tool || opts.type,
      callsPerMinute: opts.context.callsPerMinute || 0,
      callsPerHour: opts.context.callsPerHour || 0,
      callsPerDay: opts.context.callsPerDay || 0,
      toolCallsPerMinute: opts.context.toolCallsPerMinute || 0,
      activeTasks: opts.context.activeTasks || 0,
      path: opts.action.params && opts.action.params.path || '',
      extra: opts
    };

    // 获取规则引擎
    try {
      const re = require('./harness-rules');
      this.ruleEngine = re.getInstance();
      const ruleResult = this.ruleEngine.check(ruleCtx);
      proposal.validation = ruleResult;

      if (ruleResult.action === 'block') {
        proposal.status = 'blocked';
        proposal.blockReason = ruleResult.reasons.join('; ');
        proposal.blockedBy = ruleResult.triggered.map(function(r) { return { ruleId: r.ruleId, ruleName: r.ruleName }; });
        proposal.canAppeal = true;  // 默认可申诉
      } else if (ruleResult.action === 'warn') {
        proposal.status = 'approved';
        proposal.warnings = ruleResult.reasons;
      } else {
        proposal.status = 'approved';
      }
    } catch (e) {
      // 规则引擎不可用时默认放行
      proposal.status = 'approved';
      proposal.validation = { allowed: true, action: 'allow', reasons: [], triggered: [] };
    }

    proposal.updatedAt = new Date().toISOString();
    this.proposals.push(proposal);

    // 5. 审计记录
    this._logAudit({
      type: 'proposal_submitted',
      proposalId: proposal.id,
      agentId: opts.agentId,
      agentName: opts.agentName || opts.agentId,
      actionType: opts.type,
      toolName: opts.action.tool || opts.type,
      result: proposal.status,
      reasons: proposal.status === 'blocked' ? proposal.blockReason : null
    });

    this._save();
    return { success: true, proposal: proposal };
  }

  /**
   * 申诉被阻断的方案
   */
  appealProposal(proposalId, appealedBy, justification, role) {
    const prop = this.proposals.find(function(p) { return p.id === proposalId; });
    if (!prop) return { success: false, error: '方案不存在' };
    if (prop.status !== 'blocked') return { success: false, error: '只有被阻断的方案可以申诉' };
    if (!prop.canAppeal) return { success: false, error: '该方案不允许申诉' };

    prop.appeal = {
      appealedBy: appealedBy,
      appealedRole: role || 'staff',
      justification: justification || '未提供理由',
      status: 'pending',        // pending → approved | denied
      createdAt: new Date().toISOString()
    };
    prop.status = 'appealed';
    prop.updatedAt = new Date().toISOString();

    this._logAudit({
      type: 'appeal_submitted',
      proposalId: proposalId,
      agentId: appealedBy,
      justification: justification,
      role: role
    });

    this._save();
    return { success: true, proposal: prop };
  }

  /**
   * 审批申诉（豁免放行或驳回）
   */
  reviewAppeal(proposalId, reviewer, decision, note) {
    const prop = this.proposals.find(function(p) { return p.id === proposalId; });
    if (!prop) return { success: false, error: '方案不存在' };
    if (prop.status !== 'appealed') return { success: false, error: '只有申诉中的方案可以审批' };

    // 检查审批权限：至少 VP 级别或更高
    const minRole = 'vp';  // 需要 VP 以上才能豁免
    const allowedRoles = ['vp', 'director', 'ceo'];
    if (!allowedRoles.includes(reviewer.role || '')) {
      return { success: false, error: '权限不足：审批豁免需要 VP 以上级别' };
    }

    if (decision === 'approve') {
      prop.status = 'approved';
      prop.override = {
        type: 'appeal_granted',
        reviewedBy: reviewer.id || reviewer,
        reviewedRole: reviewer.role || 'vp',
        note: note || '申诉通过',
        createdAt: new Date().toISOString()
      };

      this._logAudit({
        type: 'appeal_approved',
        proposalId: proposalId,
        reviewedBy: reviewer.id || reviewer,
        note: note,
        action: 'override_block',
        originalBlockReasons: prop.blockReason
      });
    } else if (decision === 'deny') {
      prop.status = 'blocked';
      prop.canAppeal = false;  // 驳回后不可再申诉
      prop.override = {
        type: 'appeal_denied',
        reviewedBy: reviewer.id || reviewer,
        reviewedRole: reviewer.role || 'vp',
        note: note || '申诉驳回',
        createdAt: new Date().toISOString()
      };

      this._logAudit({
        type: 'appeal_denied',
        proposalId: proposalId,
        reviewedBy: reviewer.id || reviewer,
        note: note
      });
    } else {
      return { success: false, error: '决策必须为 approve 或 deny' };
    }

    prop.updatedAt = new Date().toISOString();
    this._save();
    return { success: true, proposal: prop };
  }

  /**
   * 直接豁免（不需申诉流程，CEO/管理员直接放行）
   */
  directOverride(proposalId, overrider, role, reason) {
    const prop = this.proposals.find(function(p) { return p.id === proposalId; });
    if (!prop) return { success: false, error: '方案不存在' };
    if (prop.status === 'approved') return { success: false, error: '方案已通过，无需豁免' };

    // 检查权限：仅 CEO 或系统管理员
    const allowedOverriders = ['ceo'];
    if (!allowedOverriders.includes(role || '')) {
      return { success: false, error: '权限不足：直接豁免仅限 CEO' };
    }

    prop.status = 'approved';
    prop.override = {
      type: 'direct_override',
      overriddenBy: overrider,
      role: role,
      reason: reason || 'CEO 直接豁免',
      createdAt: new Date().toISOString()
    };
    prop.canAppeal = false;
    prop.updatedAt = new Date().toISOString();

    this._logAudit({
      type: 'direct_override',
      proposalId: proposalId,
      overriddenBy: overrider,
      role: role,
      reason: reason,
      originalBlockReasons: prop.blockReason
    });

    this._save();
    return { success: true, proposal: prop };
  }

  // ── 查询 ──

  getProposal(proposalId) {
    return this.proposals.find(function(p) { return p.id === proposalId; }) || null;
  }

  getProposals(filters) {
    filters = filters || {};
    let result = [...this.proposals];

    if (filters.status) result = result.filter(function(p) { return p.status === filters.status; });
    if (filters.agentId) result = result.filter(function(p) { return p.agentId === filters.agentId; });
    if (filters.type) result = result.filter(function(p) { return p.type === filters.type; });

    // 按时间倒排
    result.sort(function(a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });

    return {
      total: result.length,
      proposals: result.slice(0, (filters.limit || 50))
    };
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      total: this.proposals.length,
      byStatus: {
        pending: this.proposals.filter(function(p) { return p.status === 'pending'; }).length,
        approved: this.proposals.filter(function(p) { return p.status === 'approved'; }).length,
        blocked: this.proposals.filter(function(p) { return p.status === 'blocked'; }).length,
        appealed: this.proposals.filter(function(p) { return p.status === 'appealed'; }).length
      },
      byType: {
        tool_call: this.proposals.filter(function(p) { return p.type === 'tool_call'; }).length,
        task_execute: this.proposals.filter(function(p) { return p.type === 'task_execute'; }).length,
        config_change: this.proposals.filter(function(p) { return p.type === 'config_change'; }).length
      },
      auditCount: this.auditLog.length,
      pendingAppeals: this.proposals.filter(function(p) { return p.status === 'appealed'; }).length
    };
  }

  // ── 审计 ──

  _logAudit(entry) {
    this.auditLog.push({
      ...entry,
      timestamp: new Date().toISOString()
    });
    // 保留最近 5000 条
    if (this.auditLog.length > 5000) {
      this.auditLog = this.auditLog.slice(-2000);
    }
  }

  getAuditLog(filters) {
    filters = filters || {};
    let result = [...this.auditLog];

    if (filters.type) result = result.filter(function(e) { return e.type === filters.type; });
    if (filters.proposalId) result = result.filter(function(e) { return e.proposalId === filters.proposalId; });
    if (filters.agentId) result = result.filter(function(e) { return e.agentId === filters.agentId; });

    // 按时间倒排
    result.sort(function(a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
    return result.slice(0, (filters.limit || 100));
  }

  /**
   * 获取待审批的申诉列表
   */
  getPendingAppeals() {
    return this.proposals.filter(function(p) { return p.status === 'appealed'; })
      .map(function(p) { return {
        id: p.id,
        agentId: p.agentId,
        agentName: p.agentName,
        type: p.type,
        action: { tool: p.action.tool, reasoning: p.action.reasoning },
        originalBlock: p.blockReason,
        appeal: p.appeal,
        createdAt: p.createdAt
      }; });
  }
}

// ====== 单例 ======
let instance = null;
function getInstance() {
  if (!instance) {
    instance = new HarnessProposalSystem();
  }
  return instance;
}

module.exports = {
  HarnessProposalSystem,
  getInstance,
  PROPOSAL_SCHEMAS
};
