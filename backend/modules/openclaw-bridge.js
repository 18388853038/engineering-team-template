/**
 * eCompany-Claw → OpenClaw Bridge
 * 
 * 将 eCompany 的所有能力对接 OpenClaw Gateway，
 * 让 eCompany 拥有ECompany AI助手的全部能力：
 * 工具系统、多代理、自动化、多渠道、沙箱
 */

const http = require('http');

const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;

// ========== 1. 工具系统 ==========
// OpenClaw 风格的 Agent 工具定义

const BRIDGE_TOOLS = [
  {
    name: 'ecompany_query_agents',
    description: '查询 AI 团队成员信息',
    handler: async (args) => {
      const res = await fetch(`http://127.0.0.1:8002/api/agents?${new URLSearchParams(args)}`);
      return await res.json();
    }
  },
  {
    name: 'ecompany_create_task',
    description: '创建并分配任务',
    handler: async (args) => {
      const res = await fetch('http://127.0.0.1:8002/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
  },
  {
    name: 'ecompany_chat',
    description: '与指定 AI 员工对话',
    handler: async (args) => {
      const res = await fetch('http://127.0.0.1:8002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
  },
  {
    name: 'ecompany_get_report',
    description: '生成员工工作报告',
    handler: async (args) => {
      const res = await fetch(`http://127.0.0.1:8002/api/report?agentId=${args.agentId}&period=${args.period || 'daily'}`);
      return await res.json();
    }
  },
  {
    name: 'ecompany_system_status',
    description: '获取系统运行状态概览',
    handler: async () => {
      const res = await fetch('http://127.0.0.1:8002/api/health');
      return await res.json();
    }
  }
];

// ========== 2. 渠道消息发送 ==========
// 利用 OpenClaw 的多渠道能力

async function sendToChannel(channel, recipient, message) {
  // 通过 OpenClaw message 工具发送
  // 这将路由到 Telegram / Discord / WeChat 等
  const payload = {
    channel: channel,
    target: recipient,
    message: message
  };

  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    // 回退到 eCompany 自身的渠道发送（带 config 参数，兼容 channels.sendViaChannel）
    const res = await fetch('http://127.0.0.1:8002/api/channel/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, config: {}, to: recipient, message })
    });
    return await res.json();
  }
}

// ========== 3. 自动化调度 ==========
// 定时向 eCompany 发送任务

function registerCron(cronExpr, action, params) {
  return fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/cron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schedule: cronExpr,
      action: action,
      params: params
    })
  });
}

// ========== 4. 子龙虾派遣 ==========
// 将任务派遣给ECompany AI助手的子龙虾分身

async function dispatchToSubAgent(agentId, task) {
  return fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/subagent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: agentId,
      task: task
    })
  });
}

module.exports = {
  BRIDGE_TOOLS,
  sendToChannel,
  registerCron,
  dispatchToSubAgent,
  GATEWAY_HOST,
  GATEWAY_PORT
};
