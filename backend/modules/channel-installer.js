/**
 * eCompany 渠道插件自动安装模块 v2
 * 
 * 遵循各平台官方文档规范：
 *   微信   → https://docs.openclaw.ai/channels/wechat.md  (扫码绑定)
 *   飞书   → https://docs.openclaw.ai/channels/feishu.md  (扫码或 AppID+Secret)
 *   钉钉   → 钉钉开放平台 (ClientID+ClientSecret)
 *   企业微信 → 企微开放平台 (CorpID+AgentID+Secret)
 *   QQ 机器人 → https://docs.openclaw.ai/channels/qqbot.md (AppID+Secret)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');

var _openclawAvailable = null;
function isOpenClawAvailable() {
  if (_openclawAvailable !== null) return _openclawAvailable;
  try {
    execSync('openclaw --version', { stdio: 'pipe', timeout: 5000, windowsHide: true });
    _openclawAvailable = true;
  } catch (e) { _openclawAvailable = false; }
  return _openclawAvailable;
}

async function isGatewayRunning() {
  try {
    const res = await fetch('http://127.0.0.1:18789/', { signal: AbortSignal.timeout(2000) });
    return true;
  } catch (e) { return false; }
}

function readOpenClawConfig() {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG)) {
      return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function writeOpenClawConfig(config) {
  const dir = path.dirname(OPENCLAW_CONFIG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
}

function runCommand(cmd, cwd, timeoutMs) {
  timeoutMs = timeoutMs || 60000;
  try {
    const result = execSync(cmd, {
      cwd: cwd || __dirname,
      timeout: timeoutMs,
      stdio: 'pipe',
      encoding: 'utf-8',
      windowsHide: true
    });
    return { ok: true, output: (result || '').trim() };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message).trim() };
  }
}

// ========== 各渠道的安装与配置 ==========
// 严格遵循各平台官方文档

const CHANNEL_HANDLERS = {
  // ===== 1. 个人微信 (WeChat / Weixin) =====
  personal_wx: {
    id: 'personal_wx',
    name: '个人微信',
    icon: '💬',
    officialDocs: 'https://docs.openclaw.ai/channels/wechat.md',
    method: '扫码绑定',
    steps: [
      '1. 在电脑终端执行: npx -y @tencent-weixin/openclaw-weixin-cli@latest install',
      '2. 终端显示二维码后，打开手机微信「扫一扫」扫码',
      '3. 扫码成功后，ClawBot 自动与系统绑定',
      '4. 或者: openclaw channels login --channel openclaw-weixin'
    ],
    fields: [],
    async isReady() {
      try {
        const res = await fetch('http://127.0.0.1:19088/health', { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch (e) { return false; }
    },
    async install() {
      return runCommand('npx -y @tencent-weixin/openclaw-weixin-cli@latest install', null, 120000);
    },
    async configure() {
      return { ok: true, message: '个人微信使用扫码绑定，无需额外配置' };
    }
  },

  // ===== 2. 飞书 Feishu =====
  feishu: {
    id: 'feishu',
    name: '飞书',
    icon: '📘',
    officialDocs: 'https://docs.openclaw.ai/channels/feishu.md',
    method: '扫码自动创建 或 手动配置',
    steps: [
      '方式一（推荐）: openclaw channels login --channel feishu',
      '  终端显示二维码，用飞书 App 扫码，自动创建机器人',
      '',
      '方式二（手动）:',
      '  1. 打开 https://open.feishu.cn -> 创建企业自建应用',
      '  2. 开通机器人能力，发布应用',
      '  3. 获取 App ID 和 App Secret',
      '  4. 在下表填写凭证'
    ],
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: '从飞书开放平台获取' },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '从飞书开放平台获取' },
      { key: 'receiveId', label: '接收者 Open ID', type: 'text', placeholder: 'ou_xxx 可选' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.feishu?.appId || cfg.plugins?.entries?.['openclaw-feishu']?.enabled);
    },
    async install() {
      return runCommand('openclaw plugins install @openclaw/feishu');
    },
    async configure(params) {
      var aid = params.appId || params.AppId || '';
      var asec = params.appSecret || params.AppSecret || '';
      if (!aid || !asec) return { ok: false, error: '缺少 AppId 或 AppSecret' };
      // 写入 eCompany 自有配置 channels-config.json
      try {
        var ccPath = path.join(__dirname, '..', 'channels-config.json');
        var cc = {};
        try { cc = JSON.parse(fs.readFileSync(ccPath, 'utf-8')); } catch(e) {}
        cc.feishu = { enabled: true, appId: aid, appSecret: asec };
        if (params.receiveId) cc.feishu.userId = params.receiveId;
        if (params.userId || params.AgentId) cc.feishu.userId = params.userId || params.AgentId;
        cc.feishu.updatedAt = new Date().toISOString();
        fs.writeFileSync(ccPath, JSON.stringify(cc, null, 2), 'utf-8');
      } catch(e) { /* fallback to openclaw.json */ }
      // 同步到 openclaw.json（兼容旧桥接）
      try {
        const config = readOpenClawConfig();
        if (!config.channels) config.channels = {};
        config.channels.feishu = { enabled: true, appId: aid, appSecret: asec };
        if (params.receiveId) config.channels.feishu.receiveId = params.receiveId;
        writeOpenClawConfig(config);
      } catch(e) {}
      return { ok: true, message: '飞书配置已保存' };
    }
  },

  // ===== 3. 钉钉 DingTalk =====
  dingtalk: {
    id: 'dingtalk',
    name: '钉钉',
    icon: '📱',
    officialDocs: 'https://open.dingtalk.com/document/orgapp/overview',
    method: 'API 凭证',
    steps: [
      '1. 打开 https://open-dev.dingtalk.com -> 创建应用',
      '2. 在「凭证与基础信息」获取 Client ID 和 Client Secret',
      '3. 添加机器人能力并发布',
      '4. 在下表填写凭证',
      '',
      'Webhook 方式（群机器人）:',
      '  在钉钉群->群设置->机器人->添加机器人',
      '  获取 Webhook URL，如有加签密钥也一并填写'
    ],
    fields: [
      { key: 'clientId', label: 'Client ID (AppKey)', type: 'text', placeholder: '从钉钉开放平台获取' },
      { key: 'clientSecret', label: 'Client Secret (AppSecret)', type: 'password', placeholder: '从钉钉开放平台获取' },
      { key: 'userIds', label: '接收者 User ID（逗号分隔）', type: 'text', placeholder: '如: manager123,user456' },
      { key: 'webhookUrl', label: '或 Webhook URL', type: 'text', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' },
      { key: 'webhookSecret', label: 'Webhook 加签密钥', type: 'password', placeholder: '可选' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.dingtalk?.clientId || cfg.channels?.dingtalk?.webhookUrl);
    },
    async install() {
      return { ok: true, message: '钉钉使用平台 API 无需安装额外插件' };
    },
    async configure(params) {
      // 写入 eCompany 自有配置 channels-config.json
      try {
        var ccPath = path.join(__dirname, '..', 'channels-config.json');
        var cc = {};
        try { cc = JSON.parse(fs.readFileSync(ccPath, 'utf-8')); } catch(e) {}
        cc.dingtalk = { enabled: true };
        // 兼容前端传的 AppKey/AppSecret 和旧版 clientId/clientSecret
        var cid = params.clientId || params.AppKey || params.appKey || params.Appkey || '';
        var csec = params.clientSecret || params.AppSecret || params.appSecret || params.Appsecret || '';
        if (cid && csec) {
          cc.dingtalk.clientId = cid;
          cc.dingtalk.clientSecret = csec;
        }
        if (params.AgentId || params.agentId) cc.dingtalk.agentId = params.AgentId || params.agentId;
        if (params.webhookUrl) {
          cc.dingtalk.webhookUrl = params.webhookUrl;
          if (params.webhookSecret) cc.dingtalk.secret = params.webhookSecret;
        }
        cc.dingtalk.updatedAt = new Date().toISOString();
        fs.writeFileSync(ccPath, JSON.stringify(cc, null, 2), 'utf-8');
      } catch(e) {}
      // 同步到 openclaw.json（兼容旧桥接）
      try {
        const config = readOpenClawConfig();
        if (!config.channels) config.channels = {};
        config.channels.dingtalk = { enabled: true };
        var cid = params.clientId || params.AppKey || params.appKey || '';
        var csec = params.clientSecret || params.AppSecret || params.appSecret || '';
        if (cid && csec) {
          config.channels.dingtalk.clientId = cid;
          config.channels.dingtalk.clientSecret = csec;
          config.channels.dingtalk.userIds = (params.userIds || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        }
        if (params.AgentId || params.agentId) config.channels.dingtalk.agentId = params.AgentId || params.agentId;
        if (params.webhookUrl) {
          config.channels.dingtalk.webhookUrl = params.webhookUrl;
          if (params.webhookSecret) config.channels.dingtalk.secret = params.webhookSecret;
        }
        writeOpenClawConfig(config);
      } catch(e) {}
      return { ok: true, message: '钉钉配置已保存' };
    }
  },

  // ===== 4. 企业微信 WeCom =====
  wecom: {
    id: 'wecom',
    name: '企业微信',
    icon: '🏢',
    officialDocs: 'https://developer.work.weixin.qq.com/document/path/90511',
    method: 'API 凭证',
    steps: [
      '=== 方式一：WebSocket 长连接（推荐，无需公网 IP）===',
      '1. 登录企微后台 -> 应用管理 -> 智能机器人',
      '2. 开启「API 模式」-> 选择「长连接」',
      '3. 复制 BotID 和 Secret 填入下方',
      '',
      '=== 方式二：HTTP 回调（需公网 URL + Tunnel）===',
      '4. 创建自建应用，获取 CorpID / AgentId / Secret',
      '5. 在应用详情页启用「接收消息」并配置回调 URL',
      '6. 获取 Token 和 EncodingAESKey 填入下方'
    ],
    fields: [
      { key: 'connectMode', label: '连接方式', type: 'text', placeholder: '留空=长连接(推荐)，填 webhook=回调模式' },
      { key: 'botId', label: '【长连接】BotID', type: 'text', placeholder: '智能机器人页面获取' },
      { key: 'botSecret', label: '【长连接】Secret', type: 'password', placeholder: '智能机器人页面获取' },
      { key: 'divider1', label: '─── 以下为回调模式（二选一）───', type: 'text', placeholder: '' },
      { key: 'corpId', label: '【回调】企业 CorpID', type: 'text', placeholder: '管理后台「我的企业」获取' },
      { key: 'agentSecret', label: '【回调】应用 Secret', type: 'password', placeholder: '应用详情页获取' },
      { key: 'agentId', label: '【回调】AgentId', type: 'text', placeholder: '应用详情页获取' },
      { key: 'token', label: '【回调】Token', type: 'text', placeholder: '回调配置中自定义' },
      { key: 'encodingAESKey', label: '【回调】EncodingAESKey', type: 'text', placeholder: '43位随机字符串' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.wecom?.botId || cfg.channels?.wecom?.corpId || cfg.channels?.wecom?.webhookUrl);
    },
    async install() {
      return { ok: true, message: '企业微信使用平台 API 无需安装额外插件' };
    },
    async configure(params) {
      // 写入 eCompany 自有配置 channels-config.json
      try {
        var ccPath = path.join(__dirname, '..', 'channels-config.json');
        var cc = {};
        try { cc = JSON.parse(fs.readFileSync(ccPath, 'utf-8')); } catch(e) {}
        cc.wecom = { enabled: true };
        if (params.botId && params.botSecret) {
          cc.wecom.botId = params.botId;
          cc.wecom.botSecret = params.botSecret;
        }
        if (params.corpId && params.agentSecret && params.agentId) {
          cc.wecom.corpId = params.corpId;
          cc.wecom.agentSecret = params.agentSecret;
          cc.wecom.agentId = params.agentId;
          cc.wecom.token = params.token || '';
          cc.wecom.encodingAESKey = params.encodingAESKey || '';
        }
        if (params.webhookUrl) cc.wecom.webhookUrl = params.webhookUrl;
        cc.wecom.updatedAt = new Date().toISOString();
        fs.writeFileSync(ccPath, JSON.stringify(cc, null, 2), 'utf-8');
      } catch(e) {}
      // 同步到 openclaw.json（兼容旧桥接）
      try {
        const config = readOpenClawConfig();
        if (!config.channels) config.channels = {};
        config.channels.wecom = { enabled: true };
        if (params.botId && params.botSecret) {
          config.channels.wecom.botId = params.botId;
          config.channels.wecom.botSecret = params.botSecret;
          delete config.channels.wecom.corpId;
          delete config.channels.wecom.agentSecret;
          delete config.channels.wecom.agentId;
          delete config.channels.wecom.token;
          delete config.channels.wecom.encodingAESKey;
        }
        if (params.corpId && params.agentSecret && params.agentId) {
          config.channels.wecom.corpId = params.corpId;
          config.channels.wecom.agentSecret = params.agentSecret;
          config.channels.wecom.agentId = params.agentId;
          config.channels.wecom.token = params.token || '';
          config.channels.wecom.encodingAESKey = params.encodingAESKey || '';
          delete config.channels.wecom.botId;
          delete config.channels.wecom.botSecret;
        }
        if (params.webhookUrl) config.channels.wecom.webhookUrl = params.webhookUrl;
        writeOpenClawConfig(config);
      } catch(e) {}
      return { ok: true, message: '企业微信配置已保存' };
    }
  },

  // ===== 5. QQ 机器人 =====
  qqbot: {
    id: 'qqbot',
    name: 'QQ 机器人',
    icon: '🐧',
    officialDocs: 'https://docs.openclaw.ai/channels/qqbot.md',
    method: 'API 凭证',
    steps: [
      '？？ 扫码绑定: 打开 /qqbot-bind.html 查看二维码',
      '1. 打开 q.qq.com -> 用 QQ 扫码登录',
      '2. 点击「创建机器人」',
      '3. 在「开发配置」获取 AppID 和 Secret',
      '4. 在下表填写凭证'
    ],
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: 'QQ 开放平台获取' },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: 'QQ 开放平台获取' },
      { key: 'groupOpenId', label: '群 OpenID（可选）', type: 'text', placeholder: '发送消息的目标群 ID' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.qqbot?.appId);
    },
    async install() {
      return { ok: true, message: 'QQ 机器人使用独立桥接无需安装 OpenClaw 插件' };
    },
    async configure(params) {
      var aid = params.appId || params.AppId || '';
      var asec = params.appSecret || params.AppSecret || '';
      if (!aid || !asec) {
        return { ok: false, error: '缺少 AppId 或 AppSecret' };
      }
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.qqbot = { enabled: true, appId: aid, clientSecret: asec };
      if (params.groupOpenId) config.channels.qqbot.groupOpenId = params.groupOpenId;
      if (params['QQ号'] || params.qq) config.channels.qqbot.qq = params['QQ号'] || params.qq;
      writeOpenClawConfig(config);
      return { ok: true, message: 'QQ 机器人配置已保存到 openclaw.json' };
    }
  },

  // ===== 6. 腾讯云 Tencent Cloud =====
  tencent: {
    id: 'tencent',
    name: '腾讯云',
    icon: '☁️',
    officialDocs: 'https://cloud.tencent.com/document/product/213',
    method: 'API 凭证',
    steps: [
      '1. 打开 https://console.cloud.tencent.com/cam/capi',
      '2. 创建或使用已有 API 密钥',
      '3. 复制 SecretId 和 SecretKey 填入下方',
      '4. 即可启用腾讯文档/会议/问卷等办公工具'
    ],
    fields: [
      { key: 'secretId', label: 'SecretId', type: 'text', placeholder: '腾讯云 API 密钥 ID' },
      { key: 'secretKey', label: 'SecretKey', type: 'password', placeholder: '腾讯云 API 密钥 Key' }
    ],
    async isReady() {
      var cfg = readOpenClawConfig();
      return !!(cfg.channels?.tencent?.secretId);
    },
    async install() {
      return { ok: true, message: '腾讯云桥接已就绪' };
    },
    async configure(params) {
      var sid = params.secretId || params.SecretId || '';
      var skey = params.secretKey || params.SecretKey || '';
      if (!sid || !skey) {
        return { ok: false, error: '缺少 SecretId 或 SecretKey' };
      }
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.tencent = { enabled: true, secretId: sid, secretKey: skey };
      writeOpenClawConfig(config);
      return { ok: true, message: '腾讯云配置已保存到 openclaw.json' };
    }
  },

  // ===== 7. MCP 服务器模式 =====
  mcp: {
    id: 'mcp',
    name: 'MCP 服务器',
    icon: '🔌',
    officialDocs: 'https://modelcontextprotocol.io',
    method: '内建服务',
    steps: [
      'MCP 服务器模式将 eCompany 的工具通过 MCP 协议暴露给外部',
      '支持 WebSocket 传输，其他 MCP 客户端可连接',
      '默认端口: 18010',
    ],
    fields: [
      { key: 'port', label: '服务端口', type: 'number', placeholder: '默认 18010', required: false }
    ],
    async isReady() {
      try {
        var ms = require('./mcp-server.js');
        return ms.isRunning ? ms.isRunning() : false;
      } catch(e) { return false; }
    },
    async install() {
      return { ok: true, message: 'MCP 服务器已就绪' };
    },
    async configure(params) {
      var port = parseInt(params.port) || 18010;
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.mcp = { enabled: true, port: port };
      writeOpenClawConfig(config);
      return { ok: true, message: 'MCP 配置已保存，端口: ' + port };
    }
  },

  // ===== 8. Webhook 接收服务 =====
  webhook: {
    id: 'webhook',
    name: 'Webhook 服务',
    icon: '🔗',
    officialDocs: '',
    method: '内建服务',
    steps: [
      '接收外部系统的 Webhook 回调（GitHub/GitLab/CI/CD/监控告警等）',
      '统一验证、路由、处理',
      '默认端口: 28010',
    ],
    fields: [
      { key: 'port', label: '服务端口', type: 'number', placeholder: '默认 28010', required: false }
    ],
    async isReady() {
      try {
        var ws = require('./webhook-service.js');
        return ws.getStatus ? ws.getStatus().running : false;
      } catch(e) { return false; }
    },
    async install() {
      return { ok: true, message: 'Webhook 服务已就绪' };
    },
    async configure(params) {
      var port = parseInt(params.port) || 28010;
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.webhook = { enabled: true, port: port };
      writeOpenClawConfig(config);
      return { ok: true, message: 'Webhook 配置已保存，端口: ' + port };
    }
  },

  // ===== 9. Telegram =====
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    officialDocs: 'https://core.telegram.org/bots/api',
    method: 'Bot Token',
    steps: [
      '1. 在 Telegram 中搜索 @BotFather',
      '2. 发送 /newbot 创建新机器人',
      '3. 复制 BotFather 返回的 Token',
      '4. 将 Token 粘贴到下方并保存'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '输入 BotFather 获取的 Token' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.telegram?.botToken);
    },
    async install() {
      return { ok: true, message: 'Telegram 桥接已就绪' };
    },
    async configure(params) {
      var tk = params.botToken || params.token || '';
      if (!tk) return { ok: false, error: '缺少 Bot Token' };
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.telegram = { enabled: true, botToken: tk };
      writeOpenClawConfig(config);
      return { ok: true, message: 'Telegram 配置已保存' };
    }
  },

  // ===== 10. WhatsApp =====
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '💬',
    officialDocs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    method: 'API 凭证',
    steps: [
      '1. 访问 Facebook Developer Portal (developers.facebook.com)',
      '2. 创建应用 → 选择「Business」类型',
      '3. 添加 WhatsApp 产品 → 配置 Webhook',
      '4. 获取 Phone Number ID 和 Access Token',
      '5. 配置 Webhook 验证 Token 和回调 URL'
    ],
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', placeholder: 'WhatsApp Business 中的电话号码 ID' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'WhatsApp Cloud API Access Token' },
      { key: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'text', placeholder: '自定义 Webhook 验证 Token' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.whatsapp?.phoneNumberId);
    },
    async install() {
      return { ok: true, message: 'WhatsApp 桥接已就绪' };
    },
    async configure(params) {
      var pnid = params.phoneNumberId || '';
      var tk = params.accessToken || '';
      if (!pnid || !tk) return { ok: false, error: '缺少 Phone Number ID 或 Access Token' };
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.whatsapp = { enabled: true, phoneNumberId: pnid, accessToken: tk };
      if (params.webhookVerifyToken) config.channels.whatsapp.webhookVerifyToken = params.webhookVerifyToken;
      writeOpenClawConfig(config);
      return { ok: true, message: 'WhatsApp 配置已保存' };
    }
  },

  // ===== 11. Discord =====
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    officialDocs: 'https://discord.com/developers/docs',
    method: 'Bot Token',
    steps: [
      '1. 访问 Discord Developer Portal (discord.com/developers)',
      '2. 创建 Application → 创建 Bot',
      '3. 复制 Bot Token',
      '4. 在 OAuth2 → URL Generator 中勾选 bot + Send Messages',
      '5. 用生成的链接将 Bot 邀请到你的服务器'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Developer Portal 获取的 Bot Token' },
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Application 的 Client ID' }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.discord?.botToken);
    },
    async install() {
      return { ok: true, message: 'Discord 桥接已就绪' };
    },
    async configure(params) {
      var tk = params.botToken || '';
      if (!tk) return { ok: false, error: '缺少 Bot Token' };
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.discord = { enabled: true, botToken: tk };
      if (params.clientId) config.channels.discord.clientId = params.clientId;
      writeOpenClawConfig(config);
      return { ok: true, message: 'Discord 配置已保存' };
    }
  },

  // ===== 12. Slack =====
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: '🔷',
    officialDocs: 'https://api.slack.com/docs',
    method: 'API 凭证',
    steps: [
      '1. 访问 api.slack.com → Create New App',
      '2. 选择「From Manifest」或「From Scratch」',
      '3. 添加 Bot Token Scopes: chat:write, channels:history, im:history, app_mentions:read',
      '4. 安装应用到工作区 → 复制 Bot User OAuth Token',
      '5. 配置 Event Subscriptions 回调 URL（用于接收消息）'
    ],
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Bot User OAuth Token（以 xoxb- 开头）' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', placeholder: 'Basic Information 中的 Signing Secret' },
      { key: 'appToken', label: 'App Level Token', type: 'password', placeholder: 'App-Level Token（以 xapp- 开头，可选）', required: false }
    ],
    async isReady() {
      const cfg = readOpenClawConfig();
      return !!(cfg.channels?.slack?.botToken);
    },
    async install() {
      return { ok: true, message: 'Slack 桥接已就绪' };
    },
    async configure(params) {
      var tk = params.botToken || '';
      if (!tk) return { ok: false, error: '缺少 Bot Token' };
      var config = readOpenClawConfig();
      if (!config.channels) config.channels = {};
      config.channels.slack = { enabled: true, botToken: tk };
      if (params.signingSecret) config.channels.slack.signingSecret = params.signingSecret;
      if (params.appToken) config.channels.slack.appToken = params.appToken;
      writeOpenClawConfig(config);
      return { ok: true, message: 'Slack 配置已保存' };
    }
  }

};

async function installAndConfigure(channelId, params) {
  var handler = CHANNEL_HANDLERS[channelId];
  if (!handler) return { ok: false, error: '未知渠道: ' + channelId };
  // 只要有参数传进来，跳过 isReady 和 install，直接走 configure
  var hasNewParams = params && Object.keys(params).length > 0;
  if (!hasNewParams) {
    var ready = await handler.isReady();
    if (ready) {
      return { ok: true, message: handler.name + ' 已经是就绪状态' };
    }
    var installResult = await handler.install();
    if (!installResult.ok) return { ok: false, error: '安装失败: ' + installResult.error, step: 'install' };
  }
  var configureResult = await handler.configure(params || {});
  if (!configureResult.ok) return { ok: false, error: '配置失败: ' + configureResult.error, step: 'configure' };
  return { ok: true, message: configureResult.message };
}

function getChannelList() {
  return Object.keys(CHANNEL_HANDLERS).map(function(id) {
    var h = CHANNEL_HANDLERS[id];
    return { id: id, name: h.name, icon: h.icon, method: h.method, steps: h.steps,
      officialDocs: h.officialDocs, fields: h.fields || [],
      needsConfig: !!(h.fields && h.fields.length > 0), openclawAvailable: isOpenClawAvailable() };
  });
}

module.exports = { installAndConfigure: installAndConfigure, getChannelList: getChannelList,
  isOpenClawAvailable: isOpenClawAvailable, isGatewayRunning: isGatewayRunning, CHANNEL_HANDLERS: CHANNEL_HANDLERS
};