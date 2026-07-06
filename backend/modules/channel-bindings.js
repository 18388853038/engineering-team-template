/**
 * eCompany 用户级通讯绑定模块
 * 
 * 功能：用户绑定个人通讯渠道（微信/企业微信/飞书/钉钉/QQ）到 eCompany AI 系统
 * - 每个用户可以绑定多个渠道
 * - 消息通过绑定的渠道直接与 AI Agent 对话
 * - 支持绑定/解绑/查询/消息收发
 */

const database = require('./database');
const getDB = typeof database.getDB === 'function' ? database.getDB : (typeof database.db === 'function' ? database.db : null);
const { sendViaChannel } = require('./channels');

function generateId() {
  return 'bind_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== 绑定 CRUD ====================

/**
 * 创建绑定
 */
function createBinding(data) {
  const db = getDB();
  if (!db) return { ok: false, error: '数据库不可用' };

  const id = data.id || generateId();
  const now = new Date().toISOString();

  try {
    // 检查是否已存在同渠道同用户的绑定
    const existing = db.prepare(
      'SELECT id FROM channel_bindings WHERE user_id = ? AND channel_type = ? AND status = ?'
    ).get(data.userId || 'admin', data.channelType, 'active');

    if (existing) {
      return { ok: false, error: '该渠道已绑定，请先解绑再重新绑定' };
    }

    db.prepare(`
      INSERT INTO channel_bindings (id, user_id, channel_type, channel_user_id, channel_user_name, credentials, bound_agent_id, is_primary, status, last_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId || 'admin',
      data.channelType,
      data.channelUserId || '',
      data.channelUserName || '',
      JSON.stringify(data.credentials || {}),
      data.boundAgentId || 'ai_ceo',
      data.isPrimary ? 1 : 0,
      'active',
      now,
      now,
      now
    );

    return {
      ok: true,
      binding: getBinding(id)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 获取单个绑定
 */
function getBinding(id) {
  const db = getDB();
  if (!db) return null;

  try {
    const row = db.prepare('SELECT * FROM channel_bindings WHERE id = ?').get(id);
    if (row) {
      row.credentials = JSON.parse(row.credentials || '{}');
    }
    return row;
  } catch (e) {
    return null;
  }
}

/**
 * 获取用户所有绑定
 */
function getUserBindings(userId) {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = db.prepare(
      'SELECT * FROM channel_bindings WHERE user_id = ? AND status = ? ORDER BY is_primary DESC, created_at DESC'
    ).all(userId || 'admin', 'active');
    return rows.map(row => {
      row.credentials = JSON.parse(row.credentials || '{}');
      return row;
    });
  } catch (e) {
    return [];
  }
}

/**
 * 获取所有活跃绑定（管理员视图）
 */
function getAllBindings() {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = db.prepare(
      'SELECT * FROM channel_bindings WHERE status = ? ORDER BY user_id, channel_type'
    ).all('active');
    return rows.map(row => {
      row.credentials = JSON.parse(row.credentials || '{}');
      // 隐藏敏感信息
      row.credentials = Object.keys(row.credentials).reduce((acc, key) => {
        const val = row.credentials[key];
        if (typeof val === 'string' && val.length > 6) {
          acc[key] = val.substring(0, 3) + '****' + val.substring(val.length - 3);
        } else {
          acc[key] = val;
        }
        return acc;
      }, {});
      return row;
    });
  } catch (e) {
    return [];
  }
}

/**
 * 解绑
 */
function removeBinding(id, userId) {
  const db = getDB();
  if (!db) return { ok: false, error: '数据库不可用' };

  try {
    const binding = db.prepare('SELECT * FROM channel_bindings WHERE id = ?').get(id);
    if (!binding) return { ok: false, error: '绑定不存在' };
    if (binding.user_id !== userId) return { ok: false, error: '无权操作此绑定' };

    db.prepare(
      "UPDATE channel_bindings SET status = 'inactive', updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), id);

    return { ok: true, message: '已解绑' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 更新绑定
 */
function updateBinding(id, userId, updates) {
  const db = getDB();
  if (!db) return { ok: false, error: '数据库不可用' };

  try {
    const binding = db.prepare('SELECT * FROM channel_bindings WHERE id = ?').get(id);
    if (!binding) return { ok: false, error: '绑定不存在' };
    if (binding.user_id !== userId) return { ok: false, error: '无权操作此绑定' };

    if (updates.boundAgentId) {
      db.prepare("UPDATE channel_bindings SET bound_agent_id = ?, updated_at = ? WHERE id = ?")
        .run(updates.boundAgentId, new Date().toISOString(), id);
    }
    if (updates.isPrimary !== undefined) {
      db.prepare("UPDATE channel_bindings SET is_primary = ?, updated_at = ? WHERE id = ?")
        .run(updates.isPrimary ? 1 : 0, new Date().toISOString(), id);
    }
    if (updates.credentials) {
      db.prepare("UPDATE channel_bindings SET credentials = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(updates.credentials), new Date().toISOString(), id);
    }

    return { ok: true, binding: getBinding(id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 通过渠道信息查找绑定（用于消息路由）
 */
function findBindingByChannel(channelType, channelUserId) {
  const db = getDB();
  if (!db) return null;

  try {
    return db.prepare(
      'SELECT * FROM channel_bindings WHERE channel_type = ? AND channel_user_id = ? AND status = ? LIMIT 1'
    ).get(channelType, channelUserId, 'active');
  } catch (e) {
    return null;
  }
}

/**
 * 根据绑定的 agent 获取对话信息
 */
function getBindingAgent(binding) {
  return {
    agentId: binding.bound_agent_id || 'ai_ceo',
    userId: binding.user_id,
    channelType: binding.channel_type,
    channelUserId: binding.channel_user_id
  };
}

// ==================== 消息收发 ====================

/**
 * 接收外部消息并路由到 AI Agent
 * 调用方：OpenClaw gateway webhook / 消息回调
 */
async function receiveMessage(channelType, channelUserId, message, extra) {
  // 1. 查找绑定
  const binding = findBindingByChannel(channelType, channelUserId);
  if (!binding) {
    return { ok: false, error: '未找到绑定的用户，请先在 eCompany 绑定此渠道' };
  }

  // 2. 更新最后活跃时间
  const db = getDB();
  if (db) {
    try {
      db.prepare("UPDATE channel_bindings SET last_active = ?, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), new Date().toISOString(), binding.id);
    } catch (e) {}
  }

  // 3. 获取绑定的 Agent 信息
  const agentInfo = getBindingAgent(binding);

  // 4. 发送到 AI 对话系统（通过 server-modern.js 的对话 API）
  try {
    const http = require('http');
    const result = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        agentId: agentInfo.agentId,
        message: message,
        userId: agentInfo.userId,
        channelType: channelType,
        channelUserId: channelUserId,
        source: 'external_channel',
        extra: extra || {}
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: 8002,
        path: '/api/chat/external',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 60000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ ok: true, reply: data }); }
        });
      });

      req.on('error', (e) => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('AI 响应超时')); });
      req.write(postData);
      req.end();
    });

    return result;
  } catch (e) {
    return { ok: false, error: 'AI 处理失败: ' + e.message };
  }
}

/**
 * 通过绑定渠道发送消息
 */
async function sendToUser(bindingId, message) {
  const binding = getBinding(bindingId);
  if (!binding) return { ok: false, error: '绑定不存在' };

  const creds = typeof binding.credentials === 'string' 
    ? JSON.parse(binding.credentials) 
    : (binding.credentials || {});

  return await sendViaChannel(binding.channel_type, {
    ...creds,
    to: binding.channel_user_id
  }, message);
}

// ==================== 渠道定义 ====================

const CHANNEL_TYPES = {
  personal_wx: {
    id: 'personal_wx',
    name: '个人微信',
    icon: '💬',
    color: '#07C160',
    method: '扫码绑定',
    bindMode: 'qrcode',
    description: '通过个人微信与 AI 对话',
    pluginRequired: '@tencent-weixin/openclaw-weixin',
    pluginName: 'Weixin ClawBot',
    setupSteps: [
      '1. 确保已安装 Weixin ClawBot 插件（@tencent-weixin/openclaw-weixin）',
      '2. 点击下方「生成绑定二维码」',
      '3. 用微信扫描二维码',
      '4. 扫码成功后系统自动完成绑定'
    ],
    fields: []
  },
  wecom: {
    id: "wecom",
    name: "企业微信",
    icon: "🏢",
    color: "#2BAD13",
    method: "API 凭证",
    description: "通过企业微信与 AI 对话",
    setupSteps: [
      "=== 方式一：WebSocket 长连接（推荐，无需公网 IP）===",
      "1. 登录企微后台 -> 应用管理 -> 智能机器人",
      "2. 开启「API 模式」-> 选择「长连接」",
      "3. 复制 BotID 和 Secret",
      "",
      "=== 方式二：HTTP 回调（需公网 URL）===",
      "4. 创建自建应用，获取 CorpID / AgentId / Secret",
      "5. 填写凭证并保存"
    ],
    fields: [
      { key: "connectMode", label: "连接方式（留空=长连接，填 webhook=回调）", type: "text", placeholder: "留空使用长连接 botId 模式" },
      { key: "botId", label: "【长连接】BotID", type: "text", placeholder: "智能机器人页面获取" },
      { key: "botSecret", label: "【长连接】Secret", type: "password", placeholder: "智能机器人页面获取" },
      { key: "divider1", label: "─── 以下为回调模式（二选一）───", type: "text", placeholder: "" },
      { key: "corpId", label: "【回调】企业 CorpID", type: "text", placeholder: "管理后台「我的企业」获取" },
      { key: "agentId", label: "【回调】应用 AgentID", type: "text", placeholder: "应用详情页获取" },
      { key: "agentSecret", label: "【回调】应用 Secret", type: "password", placeholder: "应用详情页获取" },
      { key: "token", label: "【回调】Token", type: "text", placeholder: "回调配置中自定义" },
      { key: "encodingAESKey", label: "【回调】EncodingAESKey", type: "text", placeholder: "43位随机字符串" }
    ]
  },
  feishu: {
    id: 'feishu',
    name: '飞书',
    icon: '📘',
    color: '#3370FF',
    method: 'AppID + Secret',
    description: '通过飞书与 AI 对话',
    setupSteps: [
      '1. 打开飞书开放平台 open.feishu.cn',
      '2. 创建企业自建应用',
      '3. 开通机器人能力',
      '4. 获取 App ID 和 App Secret',
      '5. 配置事件订阅回调地址'
    ],
    fields: [
      { key: 'AppId', label: 'AppId', type: 'text', placeholder: '输入 AppId', required: true },
      { key: 'AppSecret', label: 'AppSecret', type: 'password', placeholder: '输入 AppSecret', required: true },
      { key: 'AgentId', label: 'AgentId', type: 'text', placeholder: '输入 AgentId', required: true }
    ]
  },
  dingtalk: {
    id: 'dingtalk',
    name: '钉钉',
    icon: '📱',
    color: '#0089FF',
    method: 'API 凭证',
    description: '通过钉钉与 AI 对话',
    setupSteps: [
      '1. 打开钉钉开放平台',
      '2. 创建企业内部机器人',
      '3. 获取 Client ID 和 Client Secret',
      '4. 配置消息接收地址'
    ],
    fields: [
      { key: 'AgentId', label: 'AgentId', type: 'text', placeholder: '输入 AgentId', required: true },
      { key: 'AppKey', label: 'AppKey', type: 'text', placeholder: '输入 AppKey', required: true },
      { key: 'AppSecret', label: 'AppSecret', type: 'password', placeholder: '输入 AppSecret', required: true }
    ]
  },
  qqbot: {
    id: 'qqbot',
    name: 'QQ 机器人',
    icon: '🐧',
    color: '#12B7F5',
    method: 'API 凭证',
    description: '通过 QQ 与 AI 对话',
    setupSteps: [
      '1. 打开 QQ 开放平台 q.qq.com',
      '2. 创建机器人',
      '3. 获取 AppID 和 AppSecret',
      '4. 配置消息回调'
    ],
    fields: [
      { key: 'AppId', label: 'AppId', type: 'text', placeholder: '输入 AppId', required: true },
      { key: 'AppSecret', label: 'AppSecret', type: 'password', placeholder: '输入 AppSecret', required: true },
      { key: 'QQ号', label: 'QQ号', type: 'text', placeholder: '输入 QQ 号', required: true }
    ]
  },
  tencent: {
    id: 'tencent',
    name: '腾讯云',
    icon: '☁️',
    color: '#006EFF',
    method: 'API 密钥',
    description: '开通腾讯云文档/会议/问卷等办公工具',
    setupSteps: [
      '1. 登录腾讯云控制台 console.cloud.tencent.com',
      '2. 进入访问管理 → API 密钥管理',
      '3. 获取 SecretId 和 SecretKey',
      '4. 填写密钥并保存'
    ],
    fields: [
      { key: 'SecretId', label: 'SecretId', type: 'text', placeholder: '输入 SecretId', required: true },
      { key: 'SecretKey', label: 'SecretKey', type: 'password', placeholder: '输入 SecretKey', required: true }
    ]
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    color: '#0088CC',
    method: 'Bot Token',
    description: '通过 Telegram 与 AI 对话，全球最流行的即时通讯之一',
    setupSteps: [
      '1. 在 Telegram 中搜索 @BotFather',
      '2. 发送 /newbot 创建新机器人',
      '3. 复制 BotFather 返回的 Token',
      '4. 将 Token 粘贴到下方并保存'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '输入 BotFather 获取的 Token', required: true }
    ]
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '💬',
    color: '#25D366',
    method: 'API 凭证',
    description: '通过 WhatsApp Cloud API 与 AI 对话，Meta 旗下全球 30 亿用户',
    setupSteps: [
      '1. 访问 Facebook Developer Portal (developers.facebook.com)',
      '2. 创建应用 → 选择「Business」类型',
      '3. 添加 WhatsApp 产品 → 配置 Webhook',
      '4. 获取 Phone Number ID 和 Access Token',
      '5. 配置 Webhook 验证 Token 和回调 URL'
    ],
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', placeholder: 'WhatsApp Business 中的电话号码 ID', required: true },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'WhatsApp Cloud API Access Token', required: true },
      { key: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'text', placeholder: '自定义 Webhook 验证 Token', required: true }
    ]
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    color: '#5865F2',
    method: 'Bot Token',
    description: '通过 Discord 与 AI 对话，游戏与社区首选平台',
    setupSteps: [
      '1. 访问 Discord Developer Portal (discord.com/developers)',
      '2. 创建 Application → 创建 Bot',
      '3. 复制 Bot Token',
      '4. 在 OAuth2 → URL Generator 中勾选 bot + Send Messages',
      '5. 用生成的链接将 Bot 邀请到你的服务器'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Developer Portal 获取的 Bot Token', required: true },
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Application 的 Client ID', required: true }
    ]
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: '🔷',
    color: '#4A154B',
    method: 'API 凭证',
    description: '通过 Slack 与 AI 对话，企业级协同办公首选',
    setupSteps: [
      '1. 访问 api.slack.com → Create New App',
      '2. 选择「From Manifest」或「From Scratch」',
      '3. 添加 Bot Token Scopes: chat:write, channels:history, im:history, app_mentions:read',
      '4. 安装应用到工作区 → 复制 Bot User OAuth Token',
      '5. 配置 Event Subscriptions 回调 URL（用于接收消息）'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Bot User OAuth Token (以 xoxb- 开头)', required: true },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', placeholder: 'Basic Information 中的 Signing Secret', required: true },
      { key: 'appToken', label: 'App Level Token', type: 'password', placeholder: 'App-Level Token (以 xapp- 开头，可选)', required: false }
    ]
  },

  // ===== 内建服务 =====
  mcp: {
    id: 'mcp',
    name: 'MCP 服务器',
    icon: '🔌',
    color: '#8B5CF6',
    method: '内建服务',
    description: '通过 MCP 协议暴露 eCompany 工具给外部客户端',
    setupSteps: [
      '1. MCP 服务器将 eCompany 的工具通过 MCP 协议暴露给外部',
      '2. 支持 WebSocket 传输',
      '3. 默认端口: 18010'
    ],
    fields: [
      { key: 'port', label: '服务端口', type: 'number', placeholder: '默认 18010', required: false }
    ]
  },
  webhook: {
    id: 'webhook',
    name: 'Webhook 服务',
    icon: '🔗',
    color: '#F59E0B',
    method: '内建服务',
    description: '接收外部系统的 Webhook 回调',
    setupSteps: [
      '1. 接收外部系统的 Webhook 回调（GitHub/GitLab/CI/CD/监控告警等）',
      '2. 统一验证、路由、处理',
      '3. 默认端口: 28010'
    ],
    fields: [
      { key: 'port', label: '服务端口', type: 'number', placeholder: '默认 28010', required: false }
    ]
  }
};



function getChannelTypes() {
  return Object.keys(CHANNEL_TYPES).map(function(key) {
    return CHANNEL_TYPES[key];
  });
}

function getChannelType(channelType) {
  return CHANNEL_TYPES[channelType] || null;
}

// ==================== 绑定统计 ====================

function getBindingStats() {
  const db = getDB();
  if (!db) return { total: 0, byChannel: {} };

  try {
    const rows = db.prepare(
      "SELECT channel_type, COUNT(*) as count FROM channel_bindings WHERE status = 'active' GROUP BY channel_type"
    ).all();
    
    const stats = { total: 0, byChannel: {} };
    rows.forEach(function(row) {
      stats.byChannel[row.channel_type] = row.count;
      stats.total += row.count;
    });
    return stats;
  } catch (e) {
    return { total: 0, byChannel: {} };
  }
}

function channelBindings(registerRoute, parseBody, json) {
  registerRoute(['GET'], /^\/api\/bindings\/overview$/, function(req, res) {
    try {
      var stats = getBindingStats();
      var all = getAllBindings();
      json(res, {
        ok: true,
        channels: stats || [],
        total: (all || []).length,
        bindings: all || []
      });
    } catch(e) {
      json(res, { ok: true, channels: [], total: 0, bindings: [] });
    }
  });
  
  registerRoute(['GET'], /^\/api\/bindings\/stats$/, function(req, res) {
    try {
      var stats = getBindingStats();
      json(res, { ok: true, stats: stats || [] });
    } catch(e) {
      json(res, { ok: true, stats: [] });
    }
  });
  
  registerRoute(['GET'], /^\/api\/bindings\/list$/, function(req, res) {
    try {
      var all = getAllBindings();
      json(res, { ok: true, bindings: all || [] });
    } catch(e) {
      json(res, { ok: true, bindings: [] });
    }
  });
}

module.exports = {
  createBinding,
  getBinding,
  getUserBindings,
  getAllBindings,
  removeBinding,
  updateBinding,
  findBindingByChannel,
  receiveMessage,
  sendToUser,
  getChannelTypes,
  getChannelType,
  getBindingStats,
  getBindingAgent,
  channelBindings
};
