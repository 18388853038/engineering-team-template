/**
 * qqbot-bridge.js — QQ 机器人桥接（调试版 v3）
 * 临时加日志看消息结构
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CONFIG = {
  healthPort: 28005,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  healthFile: path.join(__dirname, '..', 'logs', 'qqbot-bridge.status.json'),
};

function log(level, msg) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] [' + level + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'qqbot-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

function loadAccount() {
  try {
    var raw = fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
    var cfg = JSON.parse(raw);
    var qq = cfg && cfg.channels && cfg.channels.qqbot;
    if (qq && qq.appId && qq.clientSecret) return { appId: qq.appId, secret: qq.clientSecret };
  } catch(e) {}
  return null;
}

var gAccount = null;
var bridgeStatus = {
  status: 'starting', startedAt: null, lastPollAt: null, lastEventAt: null,
  lastMessageAt: null, errorCount: 0, messageCount: 0, account: '', lastError: '',
};
var stopped = false;
var ACCESS_TOKEN_CACHE = null;

async function getAccessToken(appId, secret) {
  if (ACCESS_TOKEN_CACHE && ACCESS_TOKEN_CACHE.expiresAt > Date.now()) return ACCESS_TOKEN_CACHE.token;
  log('INFO', '获取 access_token...');
  var resp = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret: secret }),
  });
  var data = await resp.json();
  if (data.access_token) {
    var expiresIn = parseInt(data.expires_in || '3600');
    ACCESS_TOKEN_CACHE = { token: data.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
    log('INFO', 'access_token 获取成功，有效期 ' + expiresIn + 's');
    return data.access_token;
  }
  throw new Error('获取 access_token 失败: ' + JSON.stringify(data));
}

async function getGatewayUrl(accessToken) {
  var resp = await fetch('https://api.sgroup.qq.com/gateway', {
    headers: { 'Authorization': 'QQBot ' + accessToken },
  });
  var data = await resp.json();
  if (data.url) return data.url;
  throw new Error('获取 gateway URL 失败: ' + JSON.stringify(data));
}

function startHealthServer() {
  var server = http.createServer(function(req, res) {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus));
    } else { res.writeHead(404); res.end('not found'); }
  });
  server.listen(CONFIG.healthPort, '127.0.0.1', function() {
    log('INFO', '健康检查: http://127.0.0.1:' + CONFIG.healthPort + '/health');
  });
  server.on('error', function(e) { log('WARN', '健康端口被占: ' + e.message); });
}

function writeHealth() {
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
}

var forwardToECompany = (message, fromUser) => new Promise(function(resolve) {
  var data = JSON.stringify({ message, from: fromUser, channel: 'qqbot' });
  var req = http.request({
    hostname: CONFIG.eCompanyHost, port: CONFIG.eCompanyPort,
    path: '/api/v4/channel/incoming', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 65000,
  }, function(res) {
    var d = ''; res.on('data', function(c) { d += c; });
    res.on('end', function() {
      try { var j = JSON.parse(d); resolve(j.reply || ''); }
      catch(e) { log('ERROR', 'CEO解析失败: ' + d.substring(0,200)); resolve(''); }
    });
  });
  req.on('error', function(e) { log('ERROR', 'CEO请求失败: ' + e.message); resolve(''); });
  req.on('timeout', function() { req.destroy(); resolve(''); });
  req.write(data); req.end();
});

async function sendChannelMessage(token, channelId, msgId, content) {
  try {
    var resp = await fetch('https://api.sgroup.qq.com/channels/' + encodeURIComponent(channelId) + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'QQBot ' + token },
      body: JSON.stringify({ content, msg_id: msgId || '', msg_type: 0 }),
    });
    var text = await resp.text();
    log('INFO', '频道发送: ' + resp.status + ' ' + text.substring(0, 100));
    return resp.ok;
  } catch(e) { log('ERROR', '频道发送异常: ' + e.message); return false; }
}

async function sendC2CMessage(token, openid, msgId, content) {
  try {
    var resp = await fetch('https://api.sgroup.qq.com/v2/users/' + encodeURIComponent(openid) + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'QQBot ' + token },
      body: JSON.stringify({ content, msg_id: msgId || '', msg_type: 0 }),
    });
    var text = await resp.text();
    log('INFO', 'C2C发送: ' + resp.status + ' ' + text.substring(0, 100));
    return resp.ok;
  } catch(e) { log('ERROR', 'C2C发送异常: ' + e.message); return false; }
}

async function sendGroupMessage(token, groupOpenid, msgId, content) {
  try {
    var resp = await fetch('https://api.sgroup.qq.com/v2/groups/' + encodeURIComponent(groupOpenid) + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'QQBot ' + token },
      body: JSON.stringify({ content, msg_id: msgId || '', msg_type: 0 }),
    });
    var text = await resp.text();
    log('INFO', '群聊发送: ' + resp.status + ' ' + text.substring(0, 100));
    return resp.ok;
  } catch(e) { log('ERROR', '群聊发送异常: ' + e.message); return false; }
}

async function connectWS() {
  if (stopped || !gAccount) return;
  try {
    var accessToken = await getAccessToken(gAccount.appId, gAccount.secret);
    var wsUrl = await getGatewayUrl(accessToken);
    log('INFO', '连接 ' + wsUrl);
    bridgeStatus.status = 'connecting';
    writeHealth();

    var WebSocket = require('ws');
    var wsConn = new WebSocket(wsUrl);
    var seq = 0;
    var heartbeatTimer = null;

    wsConn.on('open', function() { log('INFO', 'WebSocket 已连接'); });

    wsConn.on('message', function(raw) {
      try {
        var msg = JSON.parse(raw.toString());
        if (msg.op === 10) {
          seq = msg.s || 0;
          wsConn.send(JSON.stringify({
            op: 2,
            d: { token: 'QQBot ' + accessToken, intents: 1 << 25 | 1 << 28 | 1 << 30, shard: [0, 1] },
          }));
          var interval = msg.d && msg.d.heartbeat_interval || 30000;
          heartbeatTimer = setInterval(function() {
            if (wsConn && wsConn.readyState === 1) wsConn.send(JSON.stringify({ op: 1, d: seq }));
          }, interval);
        } else if (msg.op === 0) {
          seq = msg.s || seq;
          if (msg.t === 'READY') {
            log('INFO', '✅ QQ 认证成功 session=' + (msg.d && msg.d.session_id || ''));
            bridgeStatus.status = 'running';
            bridgeStatus.lastPollAt = new Date().toISOString();
            writeHealth();
          } else if (msg.t === 'MESSAGE_CREATE' || msg.t === 'AT_MESSAGE_CREATE' || msg.t === 'C2C_MESSAGE_CREATE') {
            bridgeStatus.lastPollAt = new Date().toISOString();
            var d = msg.d || {};
            log('INFO', '=== 收到消息 [' + msg.t + '] from=' + (d.author ? d.author.id : d.openid || '?') + ' msg_type=' + d.msg_type);
            var content = (d.content || '').replace(/<@!\d+>/g, '').trim();
            var authorId = d.author && d.author.id || d.openid || '';
            var channelId = d.channel_id || '';
            var groupOpenid = d.group_openid || '';
            var openid = d.author && d.author.id || d.openid || '';
            var msgId = d.id || '';
            var isC2C = msg.t === 'C2C_MESSAGE_CREATE';
            
            // 语音消息处理（msg_type:7=音频）
            if (!content && (d.msg_type === 7 || d.msg_type === '7' || (d.attachments && d.attachments.length > 0))) {
              log('INFO', '收到非文本消息 msg_type=' + d.msg_type + ' attachments=' + (d.attachments ? d.attachments.length : 0));
              log('INFO', '消息完整结构: ' + JSON.stringify(d).substring(0,500));
              try {
                var vp = require('./voice-pipeline');
                // QQ语音文件需通过官方API下载（带token认证）
                async function downloadQQVoice(fileInfo, msgData) {
                  // QQ 语音消息自带 ASR 转写文本！直接用！
                  var asrText = fileInfo.asr_refer_text || '';
                  if (asrText) {
                    log('INFO', 'QQ语音ASR转写文本: ' + asrText.substring(0, 100));
                    content = asrText;
                    return { ok: true, text: asrText };
                  }
                  // 如果没有 ASR 文本，尝试下载后转写
                  var voiceUrl = fileInfo.url || '';
                  if (voiceUrl) {
                    log('INFO', '无ASR文本，尝试转写语音URL: ' + voiceUrl.substring(0, 80) + '...');
                    try {
                      var result = await vp.transcribe(voiceUrl);
                      if (result && result.ok) return result;
                      log('WARN', '转写失败: ' + (result ? result.error : 'unknown'));
                    } catch(e) { log('WARN', '转写异常: ' + e.message); }
                  }
                  return null;
                }
                downloadQQVoice(d.attachments && d.attachments[0] ? d.attachments[0] : {}, d).then(function(result) {
                  if (result && result.ok && result.text) {
                    content = result.text;
                    log('INFO', '语音转写成功: ' + content.substring(0, 60));
                    // 转写成功后继续发送给CEO
                    if (content) {
                      forwardToECompany(content, 'qq:' + authorId).then(function(reply) {
                        log('INFO', '← CEO 回复语音转写: ' + (reply ? reply.substring(0,100) : '(空)'));
                        if (reply) {
                          // 刷新token再发（防止token过期）
                          getAccessToken(gAccount.appId, gAccount.secret).then(function(freshToken) {
                            log('INFO', 'Token refreshed, sending reply to QQ...');
                            var sendPromise;
                            if (isC2C && openid) sendPromise = sendC2CMessage(freshToken, openid, msgId, reply);
                            else if (channelId) sendPromise = sendChannelMessage(freshToken, channelId, msgId, reply);
                            else if (groupOpenid) sendPromise = sendGroupMessage(freshToken, groupOpenid, msgId, reply);
                            else { log('WARN', '无法确定回复方式'); return; }
                            sendPromise.then(function(sent) {
                              log('INFO', 'QQ回复' + (sent ? '成功 ✅' : '失败 ❌'));
                            }).catch(function(e) {
                              log('ERROR', 'QQ回复异常: ' + e.message);
                            });
                          });
                        }
                      });
                    }
                  } else {
                    log('WARN', '语音转写失败: ' + (result ? result.error : 'no result'));
                  }
                }).catch(function(e) { log('WARN', '语音处理异常: ' + e.message); });
              } catch(e) { log('WARN', '语音模块加载失败: ' + e.message); }
              // 语音消息不继续走下方的文本处理
              return;
            }
            
            log('INFO', '解析: type=' + (isC2C ? 'C2C私聊' : '频道消息') + ' content=' + content + ' author=' + authorId + ' channelId=' + channelId + ' group=' + groupOpenid);
            
            if (!content) { log('WARN', '空消息跳过'); return; }
            
            bridgeStatus.lastEventAt = new Date().toISOString();
            bridgeStatus.lastMessageAt = new Date().toISOString();
            bridgeStatus.messageCount++;
            writeHealth();
            
            log('INFO', '→ 转发 CEO...');
            forwardToECompany(content, 'qq:' + authorId).then(function(reply) {
              log('INFO', '← CEO 回复: ' + (reply ? reply.substring(0,100) : '(空)'));
              if (!reply) { log('WARN', 'CEO 返回空回复'); return; }
              // 根据消息类型选择正确的回复 API
              if (isC2C && openid) {
                sendC2CMessage(accessToken, openid, msgId, reply);
              } else if (channelId) {
                sendChannelMessage(accessToken, channelId, msgId, reply);
              } else if (groupOpenid) {
                sendGroupMessage(accessToken, groupOpenid, msgId, reply);
              } else {
                log('WARN', '无法确定回复方式');
              }
            });
          }
        } else if (msg.op === 7) {
          log('WARN', '服务器要求重连');
          if (wsConn) wsConn.close();
        }
      } catch(e) { log('ERROR', 'WS 解析: ' + e.message); }
    });

    wsConn.on('close', function(code, reason) {
      log('WARN', 'WS 断开: ' + code + ' ' + (reason || ''));
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (!stopped) {
        var delay = Math.min(5000 * Math.pow(2, Math.min(bridgeStatus.errorCount, 5)), 120000);
        bridgeStatus.errorCount++;
        setTimeout(function() { if (!stopped) connectWS(); }, delay);
      }
    });

    wsConn.on('error', function(err) {
      log('ERROR', 'WS 错误: ' + err.message);
    });

  } catch(e) {
    log('ERROR', '连接异常: ' + e.message);
    if (!stopped) { setTimeout(function() { if (!stopped) connectWS(); }, 10000); }
  }
}

function main() {
  log('INFO', '=== QQ 桥接 v3（调试版）===');
  log('INFO', 'PID: ' + process.pid);
  var account = loadAccount();
  if (!account) {
    log('WARN', '暂无凭证，等待配置...');
    bridgeStatus.status = 'waiting_account';
    startHealthServer();
    writeHealth();
    // 等待凭证中（不轮询，等待进程重启）
  log('WARN', '暂无凭证，请通过前端配置');
    return;
  }
  gAccount = account;
  bridgeStatus.account = account.appId;
  bridgeStatus.startedAt = new Date().toISOString();
  bridgeStatus.status = 'running';
  startHealthServer();
  writeHealth();
  connectWS();
  
  // 凭证变更监控（每30秒检查）
  var credSnapshot = JSON.stringify(account);
  setInterval(function() {
    var newAccount = loadAccount();
    if (newAccount && JSON.stringify(newAccount) !== credSnapshot) {
      log('INFO', '凭证已变更，重启中...');
      process.exit(0);
    }
  }, 30000);
}

process.on('SIGINT', function() { stopped = true; process.exit(0); });
process.on('SIGTERM', function() { stopped = true; process.exit(0); });
process.on('uncaughtException', function(err) {
  log('FATAL', '未捕获: ' + err.message);
});

main();
