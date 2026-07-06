/**
 * eCompany 多渠道消息引擎 v2
 *
 * 打通 5 个渠道：
 *   personal_wx - 个人微信 (ClawBot / 微信插件)
 *   feishu      - 飞书 (WebSocket 或 Webhook)
 *   dingtalk    - 钉钉 (钉钉开放平台 API)
 *   wecom       - 企业微信 (企微开放平台 API)
 *   qqbot       - QQ 机器人 (QQ 开放平台 API)
 *
 * 所有发送函数返回 { ok: boolean, message: string }
 * 凭证缺失时尝试从环境变量读取。
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(channel, event, data) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), channel, event, ...data });
  fs.appendFileSync(path.join(LOG_DIR, 'channels.jsonl'), entry + '\n', 'utf-8');
}

// ==================== 1. 个人微信 (ClawBot) ====================
// 发送: POST http(s)://wx-server/api/wx/send


async function sendPersonalWx(to, message) {
  const accessToken = process.env.ECOMPANY_WX_ACCESS_TOKEN || '';
  const openid = to || process.env.ECOMPANY_WX_OPENID || '';
  if (!accessToken || !openid) return { ok: false, error: '微信accessToken/openid未配置' };
  try {
    const res = await fetch('https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=' + accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, msgtype: 'text', text: { content: message } })
    });
    const data = await res.json();
    return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg };
  } catch(e) { return { ok: false, error: e.message }; }
}
async function getFeishuToken(appId, appSecret) {
  if (feishuTokenCache && Date.now() < feishuTokenExpiry) return feishuTokenCache;

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(5000)
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('飞书 token 获取失败: ' + data.msg);

  feishuTokenCache = data.tenant_access_token;
  feishuTokenExpiry = Date.now() + (data.expire || 7200) * 1000 - 60000;
  return feishuTokenCache;
}


async function sendFeishuAPI(appId, appSecret, receiveId, message, receiveIdType) {
  appId = appId || process.env.FEISHU_APP_ID || '';
  appSecret = appSecret || process.env.FEISHU_APP_SECRET || '';
  if (!appId || !appSecret) return { ok: false, error: '飞书AppID/AppSecret未配置' };
  try {
    // Get tenant token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.tenant_access_token || '';
    if (!token) return { ok: false, error: '获取飞书token失败: ' + (tokenData.msg || '') };
    // Send message
    const content = JSON.stringify({ text: message });
    const body = { receive_id: receiveId || '', msg_type: 'text', content: content };
    const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + (receiveIdType || 'open_id'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { ok: data.code === 0, code: data.code, msg: data.msg };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendFeishuWebhook(webhookUrl, message) {
  if (!webhookUrl) return { ok: false, error: '飞书Webhook URL未配置' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: message } })
    });
    const data = await res.json();
    return { ok: data.code === 0, msg: data.msg };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendDingtalkAPI(clientId, clientSecret, userIds, message) {
  clientId = clientId || process.env.DINGTALK_CLIENT_ID || '';
  clientSecret = clientSecret || process.env.DINGTALK_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return { ok: false, error: '钉钉ClientID/ClientSecret未配置' };
  try {
    // Get access token
    const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: clientId, appSecret: clientSecret })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.accessToken || '';
    if (!token) return { ok: false, error: '获取钉钉token失败' };
    // Send message
    const userIdList = (userIds || '').split(',').filter(Boolean);
    const res = await fetch('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ robotCode: clientId, userIds: userIdList, msgKey: 'sampleText', msgParam: JSON.stringify({ content: message }) })
    });
    const data = await res.json();
    return { ok: data.processQueryKey ? true : false, message: '已发送' };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendDingtalkWebhook(webhookUrl, webhookSecret, message) {
  if (!webhookUrl) return { ok: false, error: '钉钉Webhook URL未配置' };
  try {
    const timestamp = Date.now();
    let signUrl = webhookUrl;
    if (webhookSecret) {
      const crypto = require('crypto');
      const sign = crypto.createHmac('sha256', webhookSecret).update(timestamp + '\n' + webhookSecret).digest('base64');
      signUrl = webhookUrl + '&timestamp=' + timestamp + '&sign=' + encodeURIComponent(sign);
    }
    const res = await fetch(signUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: message } })
    });
    const data = await res.json();
    return { ok: data.errcode === 0, errmsg: data.errmsg };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendWeCom(corpId, agentSecret, agentId, message) {
  // 简化版：直接使用webhook方式
  const key = process.env.WECOM_WEBHOOK_KEY || process.env.ECOMPANY_WECOM_KEY || '';
  if (!key) return { ok: false, error: '企微Webhook Key未配置' };
  try {
    const res = await fetch('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: message } })
    });
    const data = await res.json();
    return { ok: data.errcode === 0, errmsg: data.errmsg };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendWeComWebhook(webhookUrl, message) {
  if (!webhookUrl) return { ok: false, error: '企微Webhook URL未配置' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: message } })
    });
    const data = await res.json();
    return { ok: data.errcode === 0, errmsg: data.errmsg };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function sendQQBot(appId, appSecret, groupOpenId, message) {
  appId = appId || process.env.QQBOT_APP_ID || '';
  appSecret = appSecret || process.env.QQBOT_APP_SECRET || '';
  if (!appId || !appSecret) return { ok: false, error: 'QQ机器人AppID/AppSecret未配置' };
  try {
    // Get access token
    const tokenRes = await fetch('https://bots.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: appId, clientSecret: appSecret })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token || '';
    if (!token) return { ok: false, error: '获取QQ token失败' };
    // Send message
    const res = await fetch('https://api.sgroup.qq.com/v2/groups/' + (groupOpenId || '') + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'QQBot ' + token },
      body: JSON.stringify({ content: message, msg_type: 0 })
    });
    const data = await res.json();
    return { ok: !data.code, message: data.message || '已发送' };
  } catch(e) { return { ok: false, error: e.message }; }
}
async function sendViaChannel(channelId, config, message) {
  switch (channelId) {
    case 'personal_wx':
      return await sendPersonalWx(config.to || 'me', message);

    case 'feishu':
      if (config.appId && config.appSecret && config.receiveId) {
        return await sendFeishuAPI(config.appId, config.appSecret, config.receiveId, message, config.receiveIdType);
      }
      if (config.webhookUrl) {
        return await sendFeishuWebhook(config.webhookUrl, message);
      }
      // 尝试仅用环境变量
      return await sendFeishuAPI('', '', '', message);

    case 'dingtalk':
      if (config.clientId && config.clientSecret) {
        return await sendDingtalkAPI(config.clientId, config.clientSecret, config.userIds || ['manager'], message);
      }
      if (config.webhookUrl) {
        return await sendDingtalkWebhook(config.webhookUrl, config.secret, message);
      }
      return await sendDingtalkAPI('', '', [], message);

    case 'wecom':
      if (config.corpId && config.agentSecret && config.agentId) {
        return await sendWeCom(config.corpId, config.agentSecret, config.agentId, message, config.toUser);
      }
      if (config.webhookUrl) {
        return await sendWeComWebhook(config.webhookUrl, message);
      }
      return await sendWeCom('', '', '', message);

    case 'qqbot':
      if (config.appId && config.appSecret) {
        return await sendQQBot(config.appId, config.appSecret, config.groupOpenId, message);
      }
      return await sendQQBot('', '', '', message);

    default:
      return { ok: false, message: '不支持的渠道: ' + channelId };
  }
}

// ==================== 模板消息 ====================

function formatTaskNotification(task, agent) {
  return '## 📋 新任务通知\n\n' +
    '**任务**: ' + task.title + '\n' +
    '**描述**: ' + (task.description || '无') + '\n' +
    '**优先级**: ' + (task.priority || '普通') + '\n' +
    '**负责人**: ' + (agent || '待分配') + '\n' +
    '**ID**: `' + task.id + '`';
}

function formatTeamSummary(agents) {
  const online = agents.filter(function(a) { return a.status === 'online'; }).length;
  var byCategory = {};
  agents.forEach(function(a) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  });
  var catStr = Object.entries(byCategory)
    .map(function(entry) { return entry[0] + ': ' + entry[1] + '人'; })
    .join(' | ');
  return '## 📊 团队概览\n\n' +
    '**总人数**: ' + agents.length + '\n' +
    '**在线**: ' + online + '\n' +
    '**分类**: ' + catStr;
}

module.exports = {
  sendViaChannel,
  sendPersonalWx,
  sendFeishuAPI,
  sendFeishuWebhook,
  sendDingtalkAPI,
  sendDingtalkWebhook,
  sendWeCom,
  sendWeComWebhook,
  sendQQBot,
  formatTaskNotification,
  formatTeamSummary
};
