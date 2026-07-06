/**
 * harness-middleware.js — 三层架构自动拦截中间件
 *
 * 在 Agent 调用任何工具前自动执行：
 *   1. 创建 Proposal
 *   2. 规则引擎验证
 *   3. 通过 → 放行执行
 *   4. 阻断 → 返回理由 + 可申诉
 */

const proposal = require('./harness-proposal');
const rules = require('./harness-rules');

/**
 * 检查工具调用是否需要经过规则引擎
 * 高风险工具需要走完整提案流程
 */
function isHighRiskTool(toolName) {
  var highRisk = [
    'exec', 'write_file', 'delete_file', 'system_config_set',
    'harness_boundary_reset', 'harness_rules_propose',
    'compliance_audit_tasks', 'compliance_audit_product'
  ];
  return highRisk.indexOf(toolName) >= 0;
}

/**
 * 拦截并验证工具调用
 * @param {Object} ctx - 上下文
 *   ctx.agentId, ctx.agentName, ctx.agentRole
 *   ctx.toolName, ctx.toolArgs
 *   ctx.callsPerMinute, ctx.callsPerHour, ctx.callsPerDay (rate 统计)
 * @returns {Object} { allowed, action, reason, proposal? }
 */
function intercept(ctx) {
  // 1. 创建提案
  var propResult = proposal.getInstance().submitProposal({
    agentId: ctx.agentId,
    agentName: ctx.agentName || ctx.agentId,
    agentRole: ctx.agentRole || 'staff',
    type: 'tool_call',
    action: {
      tool: ctx.toolName,
      params: ctx.toolArgs || {},
      reasoning: ctx.reasoning || '执行工具',
      risk: isHighRiskTool(ctx.toolName) ? 'high' : 'low'
    },
    context: {
      callsPerMinute: ctx.callsPerMinute || 0,
      callsPerHour: ctx.callsPerHour || 0,
      callsPerDay: ctx.callsPerDay || 0,
      toolCallsPerMinute: ctx.toolCallsPerMinute || 0
    }
  });

  if (!propResult.success) {
    return { allowed: true, action: 'allow', reason: '提案创建失败，默认放行', proposal: null };
  }

  var prop = propResult.proposal;

  if (prop.status === 'blocked') {
    return {
      allowed: false,
      action: 'block',
      reason: prop.blockReason,
      proposalId: prop.id,
      canAppeal: prop.canAppeal,
      appeal: function(agentId, justification) {
        return proposal.getInstance().appealProposal(prop.id, agentId, justification, ctx.agentRole);
      }
    };
  }

  return {
    allowed: true,
    action: 'allow',
    reason: '',
    proposalId: prop.id,
    warnings: prop.warnings
  };
}

module.exports = { intercept, isHighRiskTool };
