/**
 * channel-sender.js — 统一渠道消息发送器
 *
 * 工作台消息 → POST /api/messages → 这里检测 channel 字段 → 发送到对应外部渠道
 *
 * 支持的渠道：dingtalk, wechat, feishu, wecom, qqbot
 * 发送方式：各渠道 REST API
 * 凭证源：channels-config.json
 */

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

// ========== 凭证缓存 ==========
var tokenCache = {};
var CHANNELS_CFG_PATH = path.join(__dirname, '..', 'channels-config.json');

function loadConfig() {
  try {
    if (!fs.existsSync(CHANNELS_CFG_PATH)) return {};
    var raw = fs.readFileSync(CHANNELS_CFG_PATH, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
    return JSON.parse(raw);
  } catch(e) { return {}; }
}

function getTokenCacheKey(channel) {
  return channel + '_token_cache';
}

function httpPost(host, port, pathname, body, ssl) {
  return new Promise(function(resolve) {
    var data = typeof body === 'string' ? body : JSON.stringify(body);
    var mod = ssl ? require('https') : require('http');
    var opts = {
      hostname: host, port: port, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000,
    };
    var req = mod.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); }
      });
    });
    req.on('error', function() { resolve({ error: 'request_failed' }); });
    req.on('timeout', function() { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

function httpGet(host, port, pathname, headers, ssl) {
  return new Promise(function(resolve) {
    var mod = ssl ? require('https') : require('http');
    var opts = { hostname: host, port: port, path: pathname, method: 'GET', headers: headers || {}, timeout: 10000 };
    var req = mod.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); }
      });
    });
    req.on('error', function() { resolve({ error: 'request_failed' }); });
    req.on('timeout', function() { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

// ========== 飞书发送 ==========
async function sendFeishu(content, target) {
  var cfg = loadConfig().feishu;
  if (!cfg || !cfg.appId || !cfg.appSecret || !cfg.enabled) return { ok: false, reason: 'not_configured' };

  // 获取 tenant_access_token
  try {
    var tkKey = getTokenCacheKey('feishu');
    if (!tokenCache[tkKey] || Date.now() > tokenCache[tkKey].expiresAt) {
      var tkRes = await httpPost('open.feishu.cn', 443, '/open-apis/auth/v3/tenant_access_token/internal',
        { app_id: cfg.appId, app_secret: cfg.appSecret }, true);
      if (tkRes.tenant_access_token) {
        tokenCache[tkKey] = { token: tkRes.tenant_access_token, expiresAt: Date.now() + (tkRes.expire || 7200) * 1000 - 60000 };
      } else {
        return { ok: false, reason: 'token_failed' };
      }
    }
    var token = tokenCache[tkKey].token;

    // 发送消息 - 使用消息卡片或文本
    var msgBody = {
      receive_id: target || '',  // open_id / user_id / email
      msg_type: 'text',
      content: JSON.stringify({ text: content })
    };
    // 如果是群聊，receive_id 是 chat_id，添加参数
    if (target && target.startsWith('oc_')) {
      msgBody.receive_id = target;
    }

    var sendRes = await httpPost('open.feishu.cn', 443, '/open-apis/im/v1/messages?receive_id_type=open_id',
      msgBody, true);
    if (sendRes.code === 0) return { ok: true };
    // 可能是 user_id 类型
    if (sendRes.code === 230001) {
      var sendRes2 = await httpPost('open.feishu.cn', 443, '/open-apis/im/v1/messages?receive_id_type=user_id',
        msgBody, true);
      return { ok: sendRes2.code === 0, error: sendRes2.msg };
    }
    return { ok: false, error: sendRes.msg || 'unknown' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ========== 钉钉发送（通过 OpenAPI） ==========
async function sendDingtalk(content, target) {
  var cfg = loadConfig().dingtalk;
  if (!cfg || !cfg.clientId || !cfg.clientSecret || !cfg.enabled) return { ok: false, reason: 'not_configured' };

  try {
    // 获取 app_access_token
    var tkKey = getTokenCacheKey('dingtalk');
    if (!tokenCache[tkKey] || Date.now() > tokenCache[tkKey].expiresAt) {
      var tkRes = await httpPost('api.dingtalk.com', 443, '/v1.0/oauth2/accessToken',
        { appKey: cfg.clientId, appSecret: cfg.clientSecret }, true);
      if (tkRes.accessToken) {
        tokenCache[tkKey] = { token: tkRes.accessToken, expiresAt: Date.now() + 7000 * 1000 };
      } else {
        return { ok: false, reason: 'token_failed', error: tkRes.message || JSON.stringify(tkRes) };
      }
    }
    var token = tokenCache[tkKey].token;

    if (!target) target = '';

    // 钉钉机器人单聊发送 API
    // 文档: POST /v1.0/robot/oTo/messages/batchSend
    // 请求头: x-acs-dingtalk-access-token: <access_token>
    // 参数: robotCode(agentId), userIds, msgKey, msgParam
    var robotCode = cfg.clientId;
    
    var sendBody = {
      robotCode: robotCode,
      userIds: target ? [target] : [],
      msgKey: 'sampleText',
      msgParam: JSON.stringify({ content: content })
    };

    // 使用自定义 httpPost 函数
    var sendRes = await httpPostWithAuth('api.dingtalk.com', 443,
      '/v1.0/robot/oToMessages/batchSend', token, sendBody);
    
    if (sendRes.processQueryKey) return { ok: true, processQueryKey: sendRes.processQueryKey };
    if (sendRes.code === 'Forbidden.AccessToken' || sendRes.code === 'InvalidAuthentication') {
      return { ok: false, reason: 'token_invalid', detail: sendRes.message || JSON.stringify(sendRes) };
    }
    return { ok: false, error: sendRes.message || JSON.stringify(sendRes), code: sendRes.code };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function httpPostWithAuth(host, port, pathname, token, body) {
  var data = JSON.stringify(body);
  return new Promise(function(resolve) {
    var opts = {
      hostname: host, port: port, path: pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 15000,
    };
    var mod = require('https');
    var req = mod.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); }
      });
    });
    req.on('error', function() { resolve({ error: 'request_failed' }); });
    req.on('timeout', function() { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ========== 企微发送 ==========
async function sendWecom(content, target) {
  var cfg = loadConfig().wecom;
  if (!cfg || !cfg.botId || !cfg.botSecret || !cfg.enabled) return { ok: false, reason: 'not_configured' };

  try {
    // 获取 access_token
    var tkKey = getTokenCacheKey('wecom');
    if (!tokenCache[tkKey] || Date.now() > tokenCache[tkKey].expiresAt) {
      var tkRes = await httpGet('qyapi.weixin.qq.com', 443,
        '/cgi-bin/gettoken?corpid=' + cfg.botId + '&corpsecret=' + cfg.botSecret,
        {}, true);
      if (tkRes.access_token) {
        tokenCache[tkKey] = { token: tkRes.access_token, expiresAt: Date.now() + 7000 * 1000 };
      } else {
        return { ok: false, reason: 'token_failed', error: tkRes.errmsg };
      }
    }
    var token = tokenCache[tkKey].token;

    // 发送文本消息
    var sendBody = {
      touser: target || '@all',
      msgtype: 'text',
      agentid: cfg.agentId || '',
      text: { content: content },
      safe: 0,
    };
    if (target && target.startsWith('chat')) {
      // 群聊
      sendBody = {
        chatid: target,
        msgtype: 'text',
        text: { content: content },
        safe: 0,
      };
      var sendRes = await httpPost('qyapi.weixin.qq.com', 443,
        '/cgi-bin/appchat/send?access_token=' + token, sendBody, true);
      return { ok: sendRes.errcode === 0, error: sendRes.errmsg };
    }

    var sendRes = await httpPost('qyapi.weixin.qq.com', 443,
      '/cgi-bin/message/send?access_token=' + token, sendBody, true);
    return { ok: sendRes.errcode === 0, error: sendRes.errmsg };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ========== 微信 iLink 发送 ==========
async function sendWechat(content, target) {
  // 微信 iLink 发送需要调用桥接进程的 health 端口 /send
  // 桥接进程在 healthPort 28001 上
  try {
    var sendRes = await httpPost('127.0.0.1', 28001, '/send', {
      to: target || '',
      content: content
    });
    return { ok: !sendRes.error, result: sendRes };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ========== QQ 机器人发送 ==========
async function sendQqbot(content, target) {
  // QQ 机器人使用 sandbox.api.sgroup.qq.com
  // 需要从桥接进程获取 token，直接调桥接 health 端口
  try {
    var sendRes = await httpPost('127.0.0.1', 28005, '/send', {
      to: target || '',
      content: content
    });
    return { ok: !sendRes.error, result: sendRes };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ========== 统一接口 ==========
async function sendToChannel(channel, content, target) {
  switch (channel) {
    case 'feishu': case 'lark': return await sendFeishu(content, target);
    case 'dingtalk': case 'ding': return await sendDingtalk(content, target);
    case 'weixin': case 'wechat': case 'wx': return await sendWechat(content, target);
    case 'wecom': case 'wework': case 'qiwei': return await sendWecom(content, target);
    case 'qqbot': case 'qq': case 'qqbot': return await sendQqbot(content, target);
    default: return { ok: false, reason: 'unknown_channel', channel: channel };
  }
}

// ========== 广播到所有已配置渠道 ==========
async function broadcast(content, options) {
  var results = {};
  var cfg = loadConfig();
  var channels = ['feishu', 'dingtalk', 'weixin', 'wecom', 'qqbot'];
  for (var c of channels) {
    var chCfg = cfg[c];
    if (chCfg && chCfg.enabled) {
      results[c] = await sendToChannel(c, content, (options && options[c]) || '');
    }
  }
  return results;
}

module.exports = { sendToChannel, broadcast };
