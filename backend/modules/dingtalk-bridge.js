/**
 * dingtalk-bridge.js — 独立钉钉桥接（v3 官方对齐版）
 *
 * 使用 dingtalk-stream SDK（Stream 模式）直连钉钉。
 * 完全对齐官方示例：https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs
 *
 * 消息流: 钉钉消息 → SDK Stream → CEO Agent → 回复钉钉 + 同步工作台
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG = {
  healthPort: 28003,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  logFile: path.join(__dirname, '..', 'logs', 'dingtalk-bridge.log'),
  healthFile: path.join(__dirname, '..', 'logs', 'dingtalk-bridge.status.json'),
};

function log(level, msg) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] [' + level + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(CONFIG.logFile, line + '\n', 'utf-8'); } catch(e) {}
}

function httpPost(host, port, pathname, body) {
  return new Promise(function(resolve) {
    var data = JSON.stringify(body);
    var opts = {
      hostname: host, port: port, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 65000,
    };
    var req = http.request(opts, function(res) {
      var d = ''; res.on('data', function(c) { d += c; });
      res.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    });
    req.on('error', function() { resolve({}); });
    req.on('timeout', function() { req.destroy(); resolve({}); });
    req.write(data); req.end();
  });
}

function forwardToECompany(message, from, sessionId) {
  return httpPost(CONFIG.eCompanyHost, CONFIG.eCompanyPort, '/api/v4/channel/incoming', {
    message: message, from: from || sessionId || '', channel: 'dingtalk'
  });
}

var bridgeStatus = {
  status: 'starting', startedAt: null, lastEventAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '',
  _socketState: -1, _connected: false, _registered: false,
  _uptime: 0,
};

function updateHealthFile() {
  bridgeStatus._uptime = Math.floor((Date.now() - new Date(bridgeStatus.startedAt).getTime()) / 1000);
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
}

function startHealthAndMonitor() {
  // Health HTTP server
  var server = http.createServer(function(req, res) {
    updateHealthFile();
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus, null, 2));
    } else { res.writeHead(404); res.end('not found'); }
  });
  server.listen(CONFIG.healthPort, '127.0.0.1', function() {
    log('INFO', 'health server: http://127.0.0.1:' + CONFIG.healthPort + '/health');
  });
  server.on('error', function(e) {
    log('WARN', 'health port taken, using fallback file-only mode: ' + e.message);
  });

  // Periodic status file writer (every 15s)
  setInterval(updateHealthFile, 15000);

  // Periodic health log (every 60s)
  var healthLogInterval = setInterval(function() {
    var uptime = Math.floor((Date.now() - new Date(bridgeStatus.startedAt).getTime()) / 1000);
    var socket = bridgeStatus._socketState;
    var connected = bridgeStatus._connected;
    var registered = bridgeStatus._registered;
    var events = bridgeStatus.messageCount;
    log('STATS', 'uptime=' + uptime + 's socket=' + socket + ' connected=' + connected +
        ' registered=' + registered + ' messages=' + events + ' errors=' + bridgeStatus.errorCount);
  }, 60000);
}

function loadCredentials() {
  try {
    // First try openclaw.json (used by settings page)
    var cfgPath = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    var raw = require('fs').readFileSync(cfgPath, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
    var cfg = JSON.parse(raw);
    var dc = cfg && cfg.channels && cfg.channels.dingtalk;
    if (dc && dc.clientId && dc.clientSecret) {
      return { clientId: dc.clientId, clientSecret: dc.clientSecret };
    }
  } catch(e) {}
  // Fallback to legacy bridges.json
  try {
    var oldPath = path.join(__dirname, '..', 'config', 'bridges.json');
    if (require('fs').existsSync(oldPath)) {
      var oldCfg = JSON.parse(require('fs').readFileSync(oldPath, 'utf-8'));
      var dc = oldCfg.dingtalk;
      if (dc && dc.clientId && dc.clientSecret) {
        return { clientId: dc.clientId, clientSecret: dc.clientSecret };
      }
    }
  } catch(e) {}
  return null;
}

function writeSDKLog(level, msg) {
  log(level || 'SDK', '[SDK] ' + msg);
}

// Override console.info/warn/error to capture SDK output
var origConsoleInfo = console.info;
var origConsoleWarn = console.warn;
var origConsoleError = console.error;
console.info = function() { var m = Array.prototype.join.call(arguments, ' '); writeSDKLog('INFO', m); origConsoleInfo.apply(console, arguments); };
console.warn = function() { var m = Array.prototype.join.call(arguments, ' '); writeSDKLog('WARN', m); origConsoleWarn.apply(console, arguments); };
console.error = function() { var m = Array.prototype.join.call(arguments, ' '); writeSDKLog('ERROR', m); origConsoleError.apply(console, arguments); };

async function main() {
  log('INFO', '=== DingTalk Bridge v3 (official SDK alignment) ===');
  log('INFO', 'PID: ' + process.pid + ' Node: ' + process.version);

  var creds = loadCredentials();
  if (!creds) {
    log('WARN', '暂无钉钉凭证，进入等待模式（每15秒检查）');
    bridgeStatus.startedAt = new Date().toISOString();
    bridgeStatus.status = 'waiting_account';
    startHealthAndMonitor();
    // 账号已锁定：不自动切换
  log('STATS', '账号守护中，等待消息...');
    return;
  }

  log('INFO', 'Client ID: ' + creds.clientId);
  bridgeStatus.account = creds.clientId;
  bridgeStatus.startedAt = new Date().toISOString();

  startHealthAndMonitor();

  // ========== 导入 dingtalk-stream SDK ==========
  var dingtalkStream = require('dingtalk-stream');
  var DWClient = dingtalkStream.DWClient;
  var TOPIC_ROBOT = dingtalkStream.TOPIC_ROBOT;
  var EventAck = dingtalkStream.EventAck;

  log('INFO', 'SDK loaded TOPIC_ROBOT=' + TOPIC_ROBOT + ' autoReconnect=default(true) keepAlive=default(false)');
  bridgeStatus.status = 'connecting';

  // ========== 创建客户端（使用 SDK 默认配置） ==========
  var client = new DWClient({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  });

  // ========== 注册机器人消息回调 ==========
  client.registerCallbackListener(TOPIC_ROBOT, async function(res) {
    try {
      var messageId = res && res.headers && res.headers.messageId;
      log('INFO', '=== 收到钉钉回调 === messageId=' + (messageId || 'N/A'));
      log('INFO', 'headers=' + JSON.stringify(res.headers || {}));
      log('INFO', 'raw data(first 200)=' + String(res.data || '').substring(0, 200));

      bridgeStatus.lastEventAt = new Date().toISOString();
      updateHealthFile();

      // res.data 是 JSON 字符串
      var data;
      try { data = JSON.parse(res.data); } catch(e) {
        log('ERROR', 'JSON parse failed: ' + e.message);
        return;
      }

      log('INFO', 'parsed data keys=' + Object.keys(data).join(','));
      log('INFO', 'msgtype=' + data.msgtype + ' sender=' + (data.senderNick || '?') +
          '(' + (data.senderStaffId || '?') + ')' + ' convType=' + (data.conversationType || '?'));

      // 语音消息处理（钉钉语音 msgtype=audio）
      if (data.msgtype === 'audio') {
        log('INFO', '收到钉钉语音消息: recorder=' + (data.recorderStaffId || '?') + ' duration=' + (data.duration || '?') + ' content=' + JSON.stringify(data));
        if (messageId && client.socketCallBackResponse) client.socketCallBackResponse(messageId, {});
        msg = '🔊 [收到语音消息，语音识别尚未实现]';
      } else if (data.msgtype !== 'text' || !data.text || !data.text.content) {
        log('WARN', '非文本消息(/空), type=' + data.msgtype + ' skip');
        if (messageId && client.socketCallBackResponse) client.socketCallBackResponse(messageId, {});
        return;
      }

      var msg = data.text ? data.text.content : msg || '';
      var senderId = data.senderStaffId || '';
      var conversationId = data.conversationId || '';
      var sessionWebhook = data.sessionWebhook || '';

      log('INFO', '消息内容: ' + msg.substring(0, 200));
      log('INFO', 'sessionWebhook=' + (sessionWebhook ? 'present(' + sessionWebhook.substring(0, 60) + '...)' : 'MISSING'));

      bridgeStatus.lastMessageAt = new Date().toISOString();
      bridgeStatus.messageCount++;
      updateHealthFile();

      // 转发给 CEO
      log('INFO', '→ 转发 CEO...');
      var ecoResp = await forwardToECompany(msg, senderId, conversationId);
      var replyText = (ecoResp && ecoResp.reply) || '';
      log('INFO', '← CEO 回复: ' + (replyText.substring(0, 200) || '(空)'));

      // 通过 sessionWebhook 回复钉钉
      if (replyText && sessionWebhook) {
        try {
          var accessToken = await client.getAccessToken();
          log('INFO', 'AccessToken 获取成功, len=' + (accessToken || '').length);

          var wpResp = await fetch(sessionWebhook, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-acs-dingtalk-access-token': accessToken,
            },
            body: JSON.stringify({
              msgtype: 'text',
              text: { content: replyText },
              at: { atUserIds: [senderId], isAtAll: false },
            }),
          });

          var wpText = await wpResp.text();
          log('INFO', '回复钉钉 status=' + wpResp.status + ' resp=' + wpText.substring(0, 200));

          if (messageId && client.socketCallBackResponse) {
            try { client.socketCallBackResponse(messageId, JSON.parse(wpText)); }
            catch(e) { client.socketCallBackResponse(messageId, {}); }
          }
        } catch(e) {
          log('ERROR', '回复异常: ' + e.message);
          if (messageId && client.socketCallBackResponse) client.socketCallBackResponse(messageId, {});
        }
      } else {
        log('WARN', (replyText ? '无 sessionWebhook' : 'CEO 回复为空') + ', ACK only');
        if (messageId && client.socketCallBackResponse) client.socketCallBackResponse(messageId, {});
      }
      log('INFO', '=== 回调处理完成 ===');
    } catch(e) {
      log('ERROR', '处理异常: ' + e.message + '\n' + (e.stack || '').substring(0, 500));
    }
  });

  // 注册全局事件监听
  client.registerAllEventListener(function(message) {
    log('INFO', 'AllEvent: type=' + (message && message.type) + ' topic=' +
        ((message && message.headers && message.headers.topic) || ''));
    return { status: EventAck.SUCCESS };
  });

  // 连接事件
  client.on('error', function(err) {
    log('ERROR', 'SDK error: ' + (err.message || JSON.stringify(err)));
    bridgeStatus.errorCount++;
  });
  client.on('close', function() {
    log('WARN', 'SDK close (auto-reconnect enabled)');
    bridgeStatus.status = 'disconnected';
  });

  // ========== 连接 ==========
  try {
    await client.connect();
    bridgeStatus.status = 'running';
    bridgeStatus._socketState = client.socket ? client.socket.readyState : -1;
    bridgeStatus._connected = client.connected;
    bridgeStatus._registered = client.registered;
    log('INFO', '✅ Connect OK socket=' + bridgeStatus._socketState +
        ' connected=' + bridgeStatus._connected + ' registered=' + bridgeStatus._registered);
    log('INFO', '等待钉钉消息...');
    updateHealthFile();
  } catch(e) {
    log('FATAL', '连接失败: ' + e.message);
    bridgeStatus.status = 'failed: ' + e.message;
    updateHealthFile();
  }

  // 更新 socket 状态到 health 文件
  var socketMonitor = setInterval(function() {
    if (client.socket) {
      bridgeStatus._socketState = client.socket.readyState;
    }
    bridgeStatus._connected = client.connected;
    bridgeStatus._registered = client.registered;
  }, 5000);

  // 凭证变更监控
  setInterval(function() {
    var newCreds = loadCredentials();
    if (newCreds && (newCreds.clientId !== creds.clientId || newCreds.clientSecret !== creds.clientSecret)) {
      log('INFO', 'Credentials changed, restarting...');
      process.exit(0);
    }
  }, 30000);

  process.stdin.resume();
}

process.on('SIGINT', function() { log('INFO', 'SIGINT'); process.exit(0); });
process.on('SIGTERM', function() { log('INFO', 'SIGTERM'); process.exit(0); });
process.on('uncaughtException', function(err) {
  log('FATAL', 'uncaught: ' + err.message + '\n' + (err.stack || '').substring(0, 500));
});
process.on('unhandledRejection', function(err) {
  log('FATAL', 'unhandled: ' + (err.message || err));
});

main().catch(function(e) { log('FATAL', 'main: ' + e.message); });
