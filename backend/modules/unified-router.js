/**
 * unified-router.js — eCompany 统一消息路由器 v2
 *
 * 所有外部消息的单一入口，增加：
 * 1. 指令系统（/status, /tasks, /broadcast 等快捷指令）
 * 2. 意图识别（AI 帮判断消息类型）
 * 3. 多渠道分发（CEO 产出自动推送到绑定渠道）
 */

const unifiedEngine = require('./unified-engine');
const channels = require('./channels');
const channelBindings = require('./channel-bindings');

// ========== 渠道注册表 ==========
const CHANNELS = {};

// ========== 指令处理器 ==========
const COMMANDS = {};

// 注册内置指令
function registerCommand(name, handler, description) {
  COMMANDS[name.toLowerCase()] = { handler, description };
  console.log('[路由] 注册指令: /' + name + ' - ' + (description || ''));
}

// 内置指令实现
registerCommand('help', async function(args, ctx) {
  var cmdList = Object.keys(COMMANDS).map(function(c) {
    return '  /' + c + ' — ' + (COMMANDS[c].description || '');
  }).join('\n');
  return '📋 **可用指令**\n\n' + cmdList + '\n\n💡 直接发消息我会自动处理';
}, '查看可用指令');

registerCommand('status', async function(args, ctx) {
  var uptime = process.uptime();
  var h = Math.floor(uptime / 3600);
  var m = Math.floor((uptime % 3600) / 60);
  var s = Math.floor(uptime % 60);
  return '🟢 **系统状态**\n\n运行时间: ' + h + 'h ' + m + 'm ' + s + 's\n渠道: ' + ctx.source + '\n内存: ' + (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) + 'MB';
}, '查看系统状态');

registerCommand('tasks', async function(args, ctx) {
  try {
    var fs = require('fs');
    var tasks = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'tasks.json'), 'utf-8') || '[]');
    var pending = tasks.filter(function(t) { return t.status === 'pending' || t.status === 'in_progress'; });
    if (pending.length === 0) return '📋 当前无待处理任务，一切正常 ✅';
    var list = pending.slice(0, 10).map(function(t, i) {
      return (i + 1) + '. [' + t.status + '] ' + (t.title || t.task || '') + ' — ' + (t.assigneeName || t.assigneeId || '未分配');
    }).join('\n');
    return '📋 **待处理任务** (' + pending.length + ')\n\n' + list;
  } catch(e) {
    return '📋 无法读取任务列表: ' + e.message;
  }
}, '查看待处理任务');

registerCommand('broadcast', async function(args, ctx) {
  // broadcast <渠道1,渠道2,...> <消息>
  // 需要 AI 处理后执行，这里只做格式提示
  return '📢 广播格式: `@AI 帮我广播到 钉钉,企微: 消息内容`\n或使用 CEO 自然语言指令。';
}, '广播消息到指定渠道（需 AI 辅助）');

// ========== 注册渠道（保持兼容）==========
function registerChannel(name, handler) {
  CHANNELS[name] = handler;
  console.log('[路由] 注册渠道: ' + name);
}

// ========== 检测是否为指令 ==========
function detectCommand(text) {
  if (!text || typeof text !== 'string') return null;
  var trimmed = text.trim();
  // /command 或 @系统 command 格式
  var m = trimmed.match(/^[/@](\w+)(?:\s+(.*))?$/s);
  if (m) {
    var cmd = m[1].toLowerCase();
    var args = (m[2] || '').trim();
    if (COMMANDS[cmd]) return { name: cmd, args: args, handler: COMMANDS[cmd].handler };
  }
  return null;
}

// ========== 处理消息（统一入口）==========
async function handle(rawMsg, channel) {
  var normalized = unifiedEngine.normalizeMessage(rawMsg, channel);
  var text = normalized.text;

  // 1️⃣ 检测指令（/command 格式）
  var cmd = detectCommand(text);
  if (cmd) {
    try {
      var reply = await cmd.handler(cmd.args, { source: channel, raw: rawMsg });
      return reply;
    } catch(e) {
      return '⚠️ 指令执行失败: ' + e.message;
    }
  }

  // 2️⃣ 普通消息 → AI 处理
  var reply = await unifiedEngine.process(normalized);

  // 3️⃣ 回复自动路由回原渠道
  // （调用方负责发送）
  return reply;
}

// ========== 主动推送（CEO 产出 → 渠道分发）==========
async function broadcast(message, options) {
  // options: { channels: ['dingtalk','wecom',...], toUsers: {...}, excludeChannels: [...] }
  if (!message) return { ok: false, error: '消息为空' };

  var targetChannels = options && options.channels;
  var exclude = options && options.excludeChannels || [];

  if (targetChannels && targetChannels.length > 0) {
    // 指定渠道推送
    var results = [];
    for (var i = 0; i < targetChannels.length; i++) {
      var ch = targetChannels[i];
      if (exclude.indexOf(ch) >= 0) continue;
      var r = await sendToChannel(ch, message, options);
      results.push({ channel: ch, ok: r.ok });
    }
    return { ok: true, results: results };
  }

  // 未指定渠道 → 全渠道推送（配置了凭证的）
  var activeChannels = getActiveChannels();
  var results = [];
  for (var j = 0; j < activeChannels.length; j++) {
    if (exclude.indexOf(activeChannels[j].id) >= 0) continue;
    var r2 = await sendToChannel(activeChannels[j].id, message, options);
    results.push({ channel: activeChannels[j].id, ok: r2.ok });
  }
  return { ok: true, results: results };
}

// ========== 发送消息到指定渠道 ==========
async function sendToChannel(channelId, message, options) {
  var configs = getChannelConfigs(channelId);
  if (!configs || configs.length === 0) {
    // fallback: 尝试默认配置
    return await channels.sendViaChannel(channelId, {}, message);
  }

  var results = [];
  for (var i = 0; i < configs.length; i++) {
    try {
      var r = await channels.sendViaChannel(channelId, configs[i], message);
      results.push(r);
    } catch(e) {
      results.push({ ok: false, error: e.message });
    }
  }
  return results.length === 1 ? results[0] : { ok: results.some(function(r) { return r.ok; }), results: results };
}

// ========== 获取已激活渠道 ==========
function getActiveChannels() {
  // 从环境变量 + 绑定数据判断哪些渠道配置了凭证
  var active = [];

  if (process.env.DINGTALK_CLIENT_ID || process.env.DINGTALK_CLIENT_SECRET) {
    active.push({ id: 'dingtalk', name: '钉钉' });
  }
  if (process.env.WECOM_WEBHOOK_KEY || process.env.ECOMPANY_WECOM_KEY || process.env.WECOM_CORP_ID) {
    active.push({ id: 'wecom', name: '企业微信' });
  }
  if (process.env.ECOMPANY_WX_ACCESS_TOKEN || process.env.ECOMPANY_WX_OPENID) {
    active.push({ id: 'personal_wx', name: '个人微信' });
  }
  if (process.env.QQBOT_APP_ID || process.env.QQBOT_APP_SECRET) {
    active.push({ id: 'qqbot', name: 'QQ机器人' });
  }
  if (process.env.FEISHU_APP_ID || process.env.FEISHU_APP_SECRET) {
    active.push({ id: 'feishu', name: '飞书' });
  }

  return active;
}

// ========== 获取渠道配置 ==========
function getChannelConfigs(channelId) {
  try {
    var bindings = channelBindings.getActiveBindings ? channelBindings.getActiveBindings(channelId) : channelBindings.getUserBindings ? channelBindings.getUserBindings(null) : [];
    if (bindings && bindings.length > 0) {
      return bindings.map(function(b) {
        return b.credentials || {};
      });
    }
  } catch(e) {}
  return [];
}

// ========== 导出 ==========
module.exports = {
  CHANNELS: CHANNELS,
  COMMANDS: COMMANDS,
  registerChannel: registerChannel,
  registerCommand: registerCommand,
  handle: handle,
  broadcast: broadcast,
  sendToChannel: sendToChannel,
  getActiveChannels: getActiveChannels,
  detectCommand: detectCommand
};
