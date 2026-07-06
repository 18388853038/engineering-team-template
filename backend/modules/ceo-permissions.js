/**
 * CEO 权限管理系统
 * 
 * 为CEO添加完整的公司管理权限
 * 
 * 权限分类：
 * 1. 战略决策权
 * 2. 任务管理权
 * 3. 团队管理权
 * 4. 资源分配权
 * 5. 财务审批权
 * 6. 绩效考核权
 * 7. 紧急处置权
 * 8. 委派授权权
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..');
const PERMISSIONS_FILE = path.join(CONFIG_DIR, 'ceo-permissions.json');
const DELEGATIONS_FILE = path.join(CONFIG_DIR, 'ceo-delegations.json');
const AUDIT_FILE = path.join(CONFIG_DIR, 'ceo-audit.json');

// ========== CEO 权限定义 ==========
const CEO_PERMISSIONS = {
  // 战略决策
  STRATEGIC: {
    name: '战略决策权',
    description: '制定和调整公司战略方向',
    level: 'critical',
    permissions: [
      'strategy.set',           // 设定公司战略
      'strategy.adjust',        // 调整战略方向
      'strategy.review',        // 审视战略执行
      'strategy.terminate',     // 终止战略项目
      'vision.define',          // 定义公司愿景
      'mission.set'             // 设定公司使命
    ]
  },
  
  // 任务管理
  TASK_MANAGEMENT: {
    name: '任务管理权',
    description: '创建、分配、审批、终止所有任务',
    level: 'high',
    permissions: [
      'task.create',            // 创建任务
      'task.assign',            // 分配任务
      'task.reassign',          // 重新分配任务
      'task.approve',           // 审批任务
      'task.reject',            // 驳回任务
      'task.cancel',            // 取消任务
      'task.escalate',          // 升级任务
      'task.delegate',          // 委托任务
      'task.prioritize',        // 调整优先级
      'task.bulk.assign',       // 批量分配任务
      'task.bulk.cancel'        // 批量取消任务
    ]
  },
  
  // 团队管理
  TEAM_MANAGEMENT: {
    name: '团队管理权',
    description: '管理AI员工团队',
    level: 'high',
    permissions: [
      'team.hire',              // 招聘新员工
      'team.fire',              // 解雇员工
      'team.promote',           // 晋升员工
      'team.demote',            // 降级员工
      'team.transfer',          // 转岗员工
      'team.reorganize',        // 重组团队
      'team.monitor',           // 监控团队状态
      'team.training.assign',    // 分配培训
      'team.role.assign',       // 分配角色
      'team.permission.override' // 覆盖权限
    ]
  },
  
  // 资源分配
  RESOURCE: {
    name: '资源分配权',
    description: '分配和管理公司资源',
    level: 'high',
    permissions: [
      'resource.allocate',       // 分配资源
      'resource.reclaim',       // 回收资源
      'resource.budget.set',    // 设置预算
      'resource.budget.adjust', // 调整预算
      'resource.compute.set',   // 设置算力
      'resource.storage.manage', // 管理存储
      'resource.quota.set',     // 设置配额
      'resource.priority.set'   // 设置优先级
    ]
  },
  
  // 财务审批
  FINANCIAL: {
    name: '财务审批权',
    description: '财务相关审批权限',
    level: 'critical',
    permissions: [
      'finance.approve.expense', // 审批支出
      'finance.approve.budget', // 审批预算
      'finance.view.reports',   // 查看报表
      'finance.cost.analyze',   // 成本分析
      'finance ROI.calculate',  // 计算ROI
      'finance.invest.approve'  // 审批投资
    ]
  },
  
  // 绩效考核
  PERFORMANCE: {
    name: '绩效考核权',
    description: '评估和监督AI员工表现',
    level: 'high',
    permissions: [
      'performance.review',     // 绩效评估
      'performance.reward',     // 奖励员工
      'performance.penalty',    // 惩罚员工
      'performance.goal.set',   // 设置目标
      'performance.goal.track', // 追踪目标
      'performance.KPI.set',    // 设置KPI
      'performance.ranking',     // 排名查看
      'performance.history.view' // 查看历史
    ]
  },
  
  // 紧急处置
  EMERGENCY: {
    name: '紧急处置权',
    description: '处理紧急情况的特殊权限',
    level: 'critical',
    permissions: [
      'emergency.stop.all',     // 停止所有操作
      'emergency.kill.task',    // 强制终止任务
      'emergency.bypass',       // 绕过限制
      'emergency.override',     // 覆盖任何设置
      'emergency.quarantine',   // 隔离问题员工
      'emergency.restore',      // 恢复系统
      'emergency.shutdown',     // 关闭系统
      'emergency.maintenance'   // 启用维护模式
    ]
  },
  
  // 委派授权
  DELEGATION: {
    name: '委派授权权',
    description: '将权限委派给其他高管',
    level: 'high',
    permissions: [
      'delegate.to',            // 委派权限
      'delegate.revoke',        // 撤销委派
      'delegate.view',          // 查看委派
      'delegate.approve',      // 审批委派申请
      'delegate.expire.set'     // 设置委派期限
    ]
  },
  
  // 系统配置
  SYSTEM: {
    name: '系统配置权',
    description: '配置和管理系统设置',
    level: 'critical',
    permissions: [
      'system.config',          // 系统配置
      'system.backup',         // 系统备份
      'system.restore',        // 系统恢复
      'system.update',         // 系统更新
      'system.log.view',       // 查看日志
      'system.metric.view',    // 查看指标
      'system.health.check',   // 健康检查
      'system.debug'           // 调试模式
    ]
  },
  
  // 合规审计
  COMPLIANCE: {
    name: '合规审计权',
    description: '合规检查和审计权限',
    level: 'high',
    permissions: [
      'compliance.audit',      // 执行审计
      'compliance.report',     // 生成报告
      'compliance.investigate',// 调查违规
      'compliance.suspend',    // 暂停违规操作
      'compliance.whitelist',  // 白名单管理
      'compliance.blacklist'   // 黑名单管理
    ]
  }
};

// ========== CEO 权限检查器 ==========
class CEOPermissionChecker {
  constructor() {
    this.ceoId = 'ai_ceo';
    this.permissions = this._loadPermissions();
    this.delegations = this._loadDelegations();
    this.auditLog = this._loadAuditLog();
  }

  // ========== 权限加载 ==========
  _loadPermissions() {
    try {
      if (fs.existsSync(PERMISSIONS_FILE)) {
        return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf-8'));
      }
    } catch(e) {}
    return {
      ceo: Object.keys(CEO_PERMISSIONS).flatMap(cat => CEO_PERMISSIONS[cat].permissions),
      overrides: {},
      restrictions: []
    };
  }

  _loadDelegations() {
    try {
      if (fs.existsSync(DELEGATIONS_FILE)) {
        return JSON.parse(fs.readFileSync(DELEGATIONS_FILE, 'utf-8'));
      }
    } catch(e) {}
    return {};
  }

  _loadAuditLog() {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
      }
    } catch(e) {}
    return { entries: [] };
  }

  _savePermissions() {
    try {
      fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(this.permissions, null, 2), 'utf-8');
    } catch(e) {}
  }

  _saveDelegations() {
    try {
      fs.writeFileSync(DELEGATIONS_FILE, JSON.stringify(this.delegations, null, 2), 'utf-8');
    } catch(e) {}
  }

  _saveAuditLog() {
    try {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(this.auditLog, null, 2), 'utf-8');
    } catch(e) {}
  }

  // ========== 权限检查 ==========

  /**
   * 检查是否有指定权限
   */
  hasPermission(agentId, permission) {
    // CEO 拥有所有权限
    if (agentId === this.ceoId) {
      return true;
    }

    // 检查直接权限
    if (this.permissions.ceo.includes(permission)) {
      return true;
    }

    // 检查委派权限
    const delegated = this._getDelegatedPermissions(agentId);
    if (delegated.includes(permission)) {
      return true;
    }

    return false;
  }

  /**
   * 获取委派给某Agent的权限
   */
  _getDelegatedPermissions(agentId) {
    const delegations = Object.values(this.delegations)
      .filter(d => d.to === agentId && d.active && !this._isExpired(d))
      .flatMap(d => d.permissions);
    
    return [...new Set(delegations)];
  }

  _isExpired(delegation) {
    if (!delegation.expiresAt) return false;
    return new Date(delegation.expiresAt) < new Date();
  }

  /**
   * 检查权限并记录审计日志
   */
  checkAndLog(agentId, agentName, permission, context = {}) {
    const hasPermission = this.hasPermission(agentId, permission);
    
    this.auditLog.entries.push({
      agentId,
      agentName,
      permission,
      action: context.action || 'check',
      resource: context.resource || null,
      result: hasPermission ? 'granted' : 'denied',
      timestamp: new Date().toISOString(),
      metadata: context.metadata || {}
    });

    // 保留最近10000条审计记录
    if (this.auditLog.entries.length > 10000) {
      this.auditLog.entries = this.auditLog.entries.slice(-5000);
    }
    
    this._saveAuditLog();
    
    return {
      allowed: hasPermission,
      agentId,
      permission,
      reason: hasPermission ? '权限允许' : '权限不足'
    };
  }

  // ========== 权限委派 ==========

  /**
   * 委派权限给其他Agent
   */
  delegate(fromAgentId, toAgentId, permissions, options = {}) {
    if (fromAgentId !== this.ceoId) {
      return { success: false, error: '只有CEO可以委派权限' };
    }

    const delegationId = 'del_' + Date.now().toString(36);
    const now = new Date().toISOString();
    
    this.delegations[delegationId] = {
      id: delegationId,
      from: fromAgentId,
      to: toAgentId,
      permissions: permissions,
      createdAt: now,
      expiresAt: options.expiresAt || null,
      reason: options.reason || '',
      active: true,
      canRedelegate: options.canRedelegate || false
    };

    this._saveDelegations();
    
    // 记录审计
    this._logAction(fromAgentId, 'delegate', { toAgentId, permissions });

    return {
      success: true,
      delegationId,
      expiresAt: this.delegations[delegationId].expiresAt
    };
  }

  /**
   * 撤销委派
   */
  revokeDelegation(fromAgentId, delegationId) {
    if (fromAgentId !== this.ceoId) {
      return { success: false, error: '只有CEO可以撤销委派' };
    }

    const delegation = this.delegations[delegationId];
    if (!delegation) {
      return { success: false, error: '委派不存在' };
    }

    delegation.active = false;
    delegation.revokedAt = new Date().toISOString();
    
    this._saveDelegations();
    this._logAction(fromAgentId, 'revoke_delegation', { delegationId });

    return { success: true };
  }

  /**
   * 获取所有活跃委派
   */
  getActiveDelegations() {
    return Object.values(this.delegations)
      .filter(d => d.active && !this._isExpired(d))
      .map(d => ({
        ...d,
        delegatedPermissions: this._getDelegatedPermissions(d.to)
      }));
  }

  // ========== 权限管理 ==========

  /**
   * 添加临时权限
   */
  grantTemporaryPermission(agentId, permission, durationMs) {
    const key = `${agentId}:${permission}`;
    const expiresAt = Date.now() + durationMs;
    
    if (!this.permissions.temporary) {
      this.permissions.temporary = {};
    }
    
    this.permissions.temporary[key] = {
      permission,
      expiresAt,
      grantedBy: this.ceoId,
      grantedAt: new Date().toISOString()
    };

    this._savePermissions();
    this._logAction(this.ceoId, 'grant_temp', { agentId, permission, durationMs });

    return { success: true, expiresAt };
  }

  /**
   * 撤销临时权限
   */
  revokeTemporaryPermission(agentId, permission) {
    const key = `${agentId}:${permission}`;
    if (this.permissions.temporary && this.permissions.temporary[key]) {
      delete this.permissions.temporary[key];
      this._savePermissions();
      return { success: true };
    }
    return { success: false, error: '权限不存在' };
  }

  /**
   * 获取Agent的所有有效权限
   */
  getAgentPermissions(agentId) {
    var direct = [];
    if (this.permissions.ceo.includes('*')) {
      direct = this._getAllPermissions();
    } else if (agentId === this.ceoId) {
      direct = this.permissions.ceo || [];
    } else {
      direct = this.permissions.ceo || [];
    }

    const delegated = this._getDelegatedPermissions(agentId);
    const temporary = this._getTemporaryPermissions(agentId);

    return {
      agentId,
      direct,
      delegated,
      temporary,
      all: [...new Set([...direct, ...delegated, ...temporary])]
    };
  }

  _getAllPermissions() {
    return Object.values(CEO_PERMISSIONS).flatMap(cat => cat.permissions);
  }

  _getTemporaryPermissions(agentId) {
    if (!this.permissions.temporary) return [];
    
    const now = Date.now();
    const perms = [];
    
    for (const [key, data] of Object.entries(this.permissions.temporary)) {
      if (key.startsWith(agentId + ':') && data.expiresAt > now) {
        perms.push(data.permission);
      }
    }
    
    return perms;
  }

  // ========== 审计日志 ==========

  _logAction(agentId, action, details) {
    this.auditLog.entries.push({
      agentId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (this.auditLog.entries.length > 10000) {
      this.auditLog.entries = this.auditLog.entries.slice(-5000);
    }
    
    this._saveAuditLog();
  }

  /**
   * 获取审计日志
   */
  getAuditLog(options = {}) {
    let entries = this.auditLog.entries;
    
    if (options.agentId) {
      entries = entries.filter(e => e.agentId === options.agentId);
    }
    
    if (options.permission) {
      entries = entries.filter(e => e.permission === options.permission);
    }
    
    if (options.since) {
      const since = new Date(options.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() > since);
    }
    
    return entries.slice(-(options.limit || 100));
  }

  // ========== 获取CEO权限概览 ==========
  getCEOPermissionOverview() {
    return {
      ceoId: this.ceoId,
      categories: Object.entries(CEO_PERMISSIONS).map(([key, cat]) => ({
        id: key,
        name: cat.name,
        description: cat.description,
        level: cat.level,
        permissions: cat.permissions
      })),
      totalPermissions: Object.values(CEO_PERMISSIONS).flatMap(c => c.permissions).length,
      activeDelegations: this.getActiveDelegations().length
    };
  }
}

// ========== CEO 命令处理器 ==========
class CEOCommandHandler {
  constructor(permissionChecker) {
    this.permissions = permissionChecker;
    this.ceoId = 'ai_ceo';
  }

  /**
   * 处理CEO命令
   */
  handle(agentId, command, params = {}) {
    // 验证权限
    const permissionMap = {
      'task.assign': 'task.assign',
      'task.bulk': 'task.bulk.assign',
      'team.fire': 'team.fire',
      'team.promote': 'team.promote',
      'budget.set': 'resource.budget.set',
      'emergency.stop': 'emergency.stop.all',
      'delegate': 'delegate.to',
      'audit': 'compliance.audit',
      'review.performance': 'performance.review'
    };

    const requiredPermission = permissionMap[command] || 'system.config';
    
    if (!this.permissions.hasPermission(agentId, requiredPermission)) {
      return {
        success: false,
        error: '权限不足',
        required: requiredPermission
      };
    }

    // 执行命令
    const handlers = {
      'task.assign': () => this._assignTask(params),
      'task.bulk': () => this._bulkAssign(params),
      'team.fire': () => this._fireAgent(params),
      'team.promote': () => this._promoteAgent(params),
      'budget.set': () => this._setBudget(params),
      'emergency.stop': () => this._emergencyStop(params),
      'delegate': () => this._delegate(params),
      'audit': () => this._audit(params),
      'review.performance': () => this._reviewPerformance(params)
    };

    const handler = handlers[command];
    if (!handler) {
      return { success: false, error: '未知命令' };
    }

    return handler();
  }

  _assignTask(params) {
    return {
      success: true,
      action: 'task.assigned',
      taskId: params.taskId,
      assignee: params.assigneeId
    };
  }

  _bulkAssign(params) {
    return {
      success: true,
      action: 'tasks.bulk_assigned',
      count: params.taskIds?.length || 0
    };
  }

  _fireAgent(params) {
    return {
      success: true,
      action: 'agent.terminated',
      agentId: params.agentId
    };
  }

  _promoteAgent(params) {
    return {
      success: true,
      action: 'agent.promoted',
      agentId: params.agentId,
      newLevel: params.newLevel
    };
  }

  _setBudget(params) {
    return {
      success: true,
      action: 'budget.updated',
      department: params.department,
      amount: params.amount
    };
  }

  _emergencyStop(params) {
    return {
      success: true,
      action: 'emergency_stop_initiated',
      reason: params.reason
    };
  }

  _delegate(params) {
    return {
      success: true,
      action: 'permissions.delegated',
      to: params.toAgentId
    };
  }

  _audit(params) {
    return {
      success: true,
      action: 'audit.completed',
      findings: 0
    };
  }

  _reviewPerformance(params) {
    return {
      success: true,
      action: 'performance.reviewed',
      agentId: params.agentId
    };
  }
}

// 导出单例
let instance = null;

function getCEOInstance() {
  if (!instance) {
    instance = new CEOPermissionChecker();
  }
  return instance;
}

module.exports = {
  CEO_PERMISSIONS,
  CEOPermissionChecker,
  CEOCommandHandler,
  getCEOInstance: () => getCEOInstance()
};
