/**
 * wecom-bridge.js — 企业微信桥接（长连接 WebSocket 模式 v2）
 *
 * 使用 @wecom/aibot-node-sdk 通过 WebSocket 长连接直连企微。
 * 无需公网 IP，无需消息加解密。
 *
 * 消息流: 企微消息 → WebSocket → CEO Agent → 回复企微 + 同步工作台
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CONFIG = {
  healthPort: 28004,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  logFile: path.join(__dirname, '..', 'logs', 'wecom-bridge.log'),
  healthFile: path.join(__dirname, '..', 'logs', 'wecom-bridge.status.json'),
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
    message: message, from: from || sessionId || '', channel: 'wecom'
  });
}

var bridgeStatus = {
  status: 'starting', startedAt: null, lastEventAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '',
  _connected: false,
  _lastConnectedAt: null,
};

function updateHealthFile() {
  bridgeStatus.lastPollAt = new Date().toISOString();
  bridgeStatus._uptime = Math.floor((Date.now() - new Date(bridgeStatus.startedAt).getTime()) / 1000);
  // Update _connected based on event recency: if we received a message/event in last 120s or isConnected() says true
  if (bridgeStatus._lastConnectedAt) {
    var idleMs = Date.now() - new Date(bridgeStatus._lastConnectedAt).getTime();
    if (idleMs > 120000) {
      bridgeStatus._connected = false;
    }
  }
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
}

// ========== 加载凭证（从 OpenClaw 配置读取） ==========
function loadCredentials() {
  try {
    var openclawCfg = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (fs.existsSync(openclawCfg)) {
      var raw = fs.readFileSync(openclawCfg, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
      var cfg = JSON.parse(raw);
      var wc = cfg && cfg.channels && cfg.channels.wecom;
      // 长连接模式需要 botId + secret（不是 corpId + agentSecret）
      if (wc && wc.botId && wc.botSecret) {
        return { botId: wc.botId, secret: wc.botSecret };
      }
    }
  } catch(e) {}
  return null;
}

// ========== 启动健康服务器 ==========
function startHealthServer() {
  var server = http.createServer(function(req, res) {
    updateHealthFile();
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus, null, 2));
    } else { res.writeHead(404); res.end('not found'); }
  });
  server.listen(CONFIG.healthPort, '127.0.0.1', function() {
    log('INFO', 'health: http://127.0.0.1:' + CONFIG.healthPort + '/health');
  });
  server.on('error', function(e) { log('WARN', 'health port taken: ' + e.message); });
}

// ========== Main ==========
async function main() {
  log('INFO', '=== WeCom Bridge v2 (WebSocket long connection) ===');
  log('INFO', 'PID: ' + process.pid + ' Node: ' + process.version);

  var creds = loadCredentials();
  if (!creds || !creds.botId || !creds.secret) {
    log('WARN', 'No wecom WebSocket credentials (need botId + botSecret)');
    log('WARN', 'Configure at settings page or ~/.openclaw/openclaw.json channels.wecom');
    bridgeStatus.account = '(not configured)';
  } else {
    log('INFO', 'BotID: ' + creds.botId.substring(0, 8) + '...');
    bridgeStatus.account = creds.botId;
  }

  bridgeStatus.startedAt = new Date().toISOString();
  bridgeStatus.status = 'running';
  startHealthServer();

  // 定期写健康文件
  setInterval(updateHealthFile, 15000);

  // 如果有凭证，启动长连接
  if (creds && creds.botId && creds.secret) {
    try {
      var { WSClient, DefaultLogger, generateReqId } = require('@wecom/aibot-node-sdk');
      var logger = new DefaultLogger('WecomeBridge');

      log('INFO', 'Connecting to wss://openws.work.weixin.qq.com ...');
      bridgeStatus.status = 'connecting';

      var client = new WSClient({
        botId: creds.botId,
        secret: creds.secret,
        log: logger,
        // 连接成功自动订阅
      });

      // 消息回调（frame = { headers, body }）
      client.on('message', async function(frame) {
        try {
          var body = frame && frame.body || frame || {};
          log('INFO', '=== 收到企微消息 === msgid=' + (body.msgid || body.msgId || 'N/A'));
          log('INFO', 'msgtype=' + body.msgtype + ' from=' + (body.from && body.from.userid) +
              ' chattype=' + body.chattype);

          bridgeStatus.lastEventAt = new Date().toISOString();
          bridgeStatus._connected = true;
          bridgeStatus._lastConnectedAt = bridgeStatus.lastEventAt;
          updateHealthFile();

          // 语音消息处理（企微 msgtype=voice）
          if (body.msgtype === 'voice') {
            log('INFO', '收到企微语音消息: media_id=' + (body.media_id || body.voice?.media_id || '?') + ' format=' + (body.format || '?') + ' duration=' + (body.duration || '?'));
            try {
              var vp = require('./voice-pipeline');
              var audioUrl = body.media_id || (body.voice && body.voice.media_id) || '';
              if (audioUrl) {
                log('INFO', '企微语音media_id=' + audioUrl + '，需通过企微API下载后转写');
              }
            } catch(e) { log('WARN', '语音模块加载: ' + e.message); }
            content = '🔊 [收到语音消息，语音识别尚未实现]';
          } else if (body.msgtype !== 'text' || !body.text || !body.text.content) {
            log('WARN', '非文本消息 type=' + body.msgtype + '，跳过');
            return;
          }

          var content = body.text ? body.text.content : (content || '');
          var userId = body.from && body.from.userid || '';
          var chatId = body.chatid || userId;

          // 去掉 @机器人
          content = content.replace(/@.*?\s/g, '').trim();

          log('INFO', '文本消息: ' + content.substring(0, 200));
          bridgeStatus.lastMessageAt = new Date().toISOString();
          bridgeStatus.messageCount++;
          updateHealthFile();

          // 转发给 CEO
          log('INFO', '→ 转发 CEO...');
          var ecoResp = await forwardToECompany(content, userId, 'wecom:' + chatId);
          var replyText = (ecoResp && ecoResp.reply) || '';
          log('INFO', '← CEO 回复: ' + (replyText.substring(0, 200) || '(空)'));

          if (replyText) {
            // 通过 WebSocket 回复（SDK reply(frame, body) 需要传原始 frame）
            try {
              log('INFO', '回复内容: ' + replyText.substring(0, 100));
              // 长连接模式回复使用 markdown 格式（不用 text）
              await client.reply(frame, {
                msgtype: 'markdown',
                markdown: { content: replyText },
              });
              log('INFO', '✅ 回复已发送');
            } catch(e) {
              log('ERROR', '回复失败: ' + (e.message || e.code || JSON.stringify(e)));
            }
          }
          log('INFO', '=== 处理完成 ===');
        } catch(e) {
          log('ERROR', '消息处理异常: ' + e.message + '\n' + (e.stack || '').substring(0, 300));
        }
      });

      // 事件回调（进入会话等）
      client.on('event', function(event) {
        log('INFO', '事件回调: eventtype=' + (event.event && event.event.eventtype) + ' from=' +
            (event.from && event.from.userid));
        bridgeStatus.lastEventAt = new Date().toISOString();
        bridgeStatus._lastConnectedAt = bridgeStatus.lastEventAt;
        updateHealthFile();
      });

      // 连接事件
      client.on('connected', function() {
        log('INFO', '✅ 长连接建立成功');
        bridgeStatus.status = 'running';
        bridgeStatus._connected = true;
        bridgeStatus._lastConnectedAt = new Date().toISOString();
        updateHealthFile();
      });
      client.on('disconnected', function() {
        log('WARN', '连接断开（SDK 自动重连中）');
        bridgeStatus.status = 'reconnecting';
        bridgeStatus._connected = false;
        updateHealthFile();
      });
      client.on('error', function(err) {
        log('ERROR', 'SDK 错误: ' + (err.message || err));
        bridgeStatus.errorCount++;
      });
      client.on('reconnecting', function() {
        log('INFO', '重连中...');
        bridgeStatus.status = 'reconnecting';
        updateHealthFile();
      });
      client.on('reconnected', function() {
        log('INFO', '✅ 重连成功');
        bridgeStatus.status = 'running';
        bridgeStatus._connected = true;
        bridgeStatus._lastConnectedAt = new Date().toISOString();
        updateHealthFile();
      });

      // 启动连接
      await client.connect();
      log('INFO', 'WebSocket 连接已发起，等待登录...');

      // 定期检查 SDK 连接状态（每30秒）
      setInterval(function() {
        try {
          if (typeof client.isConnected === 'function') {
            var sdkConnected = client.isConnected();
            if (sdkConnected && !bridgeStatus._connected) {
              log('INFO', 'SDK 报告已连接，更新状态');
              bridgeStatus._connected = true;
              bridgeStatus._lastConnectedAt = new Date().toISOString();
            }
          }
        } catch(e) {
          log('WARN', 'SDK 连接状态检查异常: ' + e.message);
        }
        updateHealthFile();
      }, 30000);

    } catch(e) {
      log('FATAL', 'SDK 启动失败: ' + e.message + '\n' + (e.stack || '').substring(0, 300));
      bridgeStatus.status = 'failed: ' + e.message;
      updateHealthFile();
    }
  }

  // 凭证变更监控（每30秒检查）
  var credSnapshot = creds ? JSON.stringify(creds) : '';
  setInterval(function() {
    var newCreds = loadCredentials();
    var newSnap = newCreds ? JSON.stringify(newCreds) : '';
    if (newSnap !== credSnapshot) {
      log('INFO', 'Credentials changed, restarting...');
      process.exit(0);
    }
  }, 30000);

  log('INFO', 'WeCom bridge running. Waiting for credentials or messages...');
  updateHealthFile();
  process.stdin.resume();
}

process.on('SIGINT', function() { process.exit(0); });
process.on('SIGTERM', function() { process.exit(0); });
process.on('uncaughtException', function(err) {
  log('FATAL', 'uncaught: ' + err.message + '\n' + (err.stack || '').substring(0, 500));
});
process.on('unhandledRejection', function(err) {
  log('FATAL', 'unhandled: ' + (err.message || err));
});

main().catch(function(e) { log('FATAL', 'main: ' + e.message); });
