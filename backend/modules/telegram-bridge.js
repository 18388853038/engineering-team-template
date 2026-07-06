/**
 * telegram-bridge.js — Telegram 桥接
 *
 * 使用 Bot API: 长轮询 getUpdates → 转发给 CEO → sendMessage 回复
 * 凭证: ~/.openclaw/openclaw.json → channels.telegram.botToken
 * 守护模式，永不退出。只热切换凭证。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CONFIG = {
  healthPort: 28011,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  pollIntervalMs: 500,
  healthFile: path.join(__dirname, '..', 'logs', 'telegram-bridge.status.json'),
};

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [Telegram] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'telegram-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

// ========== 凭证加载 ==========
var gBotToken = null;
var gApiBase = 'https://api.telegram.org';

function loadToken() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const token = cfg.channels && cfg.channels.telegram && cfg.channels.telegram.botToken;
    return token || null;
  } catch(e) { return null; }
}

function trySwitchToken() {
  const token = loadToken();
  if (!token) return false;
  if (token === gBotToken) return false;
  const oldLabel = gBotToken ? gBotToken.substring(0, 12) + '...' : '(none)';
  const newLabel = token.substring(0, 12) + '...';
  log('INFO', '切换 Token: ' + oldLabel + ' → ' + newLabel);
  gBotToken = token;
  bridgeStatus.account = newLabel;
  bridgeStatus.errorCount = 0;
  bridgeStatus.lastError = '';
  return true;
}

// ========== Telegram API ==========
function tgApi(method, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!gBotToken) { reject(new Error('no token')); return; }
    const data = JSON.stringify(body || {});
    const url = new URL(gApiBase + '/bot' + gBotToken + '/' + method);
    const opts = {
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs || 35000,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

// ========== 转发到 CEO ==========
function forwardToECompany(message, fromUser, chatId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ message, from: fromUser, source: 'telegram-bridge', chat_id: chatId });
    const req = http.request({
      hostname: CONFIG.eCompanyHost, port: CONFIG.eCompanyPort,
      path: '/api/v4/channel/incoming', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 65000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).reply || ''); } catch(e) { resolve(''); } });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(data); req.end();
  });
}

// ========== 健康检查 ==========
var bridgeStatus = {
  status: 'starting', startedAt: null, lastPollAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '', lastError: '', lastUpdateId: 0,
};

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus));
    } else { res.writeHead(404); res.end('not found'); }
  });
  server.listen(CONFIG.healthPort, '127.0.0.1', () => {
    log('INFO', '健康检查: http://127.0.0.1:' + CONFIG.healthPort + '/health');
  });
  server.on('error', e => log('WARN', '健康检查端口被占用: ' + e.message));
}

function startHealthWriter() {
  setInterval(() => {
    try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  }, 15000);
}

// ========== 凭证监听 ==========
function startTokenWatcher() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return;
  try {
    fs.watch(cfgPath, { persistent: false }, (event) => {
      if (event === 'change') {
        setTimeout(() => trySwitchToken(), 500);
      }
    });
    log('INFO', 'Token 文件监听已启动');
  } catch(e) {
    log('WARN', '无法监听 Token 文件: ' + e.message);
  }
}

// ========== 主循环 ==========
var pollTimer = null;
var stopped = false;

function runBridge() {
  bridgeStatus.status = 'running';
  bridgeStatus.startedAt = new Date().toISOString();
  const label = gBotToken ? gBotToken.substring(0, 12) + '...' : '(unknown)';
  bridgeStatus.account = label;
  log('INFO', 'Bot Token: ' + label);

  function poll() {
    if (stopped) return;

    tgApi('getUpdates', {
      offset: bridgeStatus.lastUpdateId + 1,
      timeout: 30,  // 长轮询 30s
      allowed_updates: ['message'],
    }).then(result => {
      bridgeStatus.lastPollAt = new Date().toISOString();

      if (!result.ok) {
        bridgeStatus.errorCount++;
        bridgeStatus.lastError = result.description || 'unknown error';
        log('WARN', 'getUpdates 失败: ' + (result.description || JSON.stringify(result)));
        if (!stopped) pollTimer = setTimeout(poll, CONFIG.pollIntervalMs * 3);
        return;
      }

      bridgeStatus.errorCount = 0;
      bridgeStatus.lastError = '';

      const updates = result.result || [];
      if (updates.length === 0) {
        if (!stopped) pollTimer = setTimeout(poll, CONFIG.pollIntervalMs);
        return;
      }

      let maxId = bridgeStatus.lastUpdateId;
      function processNext(idx) {
        if (idx >= updates.length) {
          bridgeStatus.lastUpdateId = maxId;
          if (!stopped) pollTimer = setTimeout(poll, CONFIG.pollIntervalMs);
          return;
        }
        const upd = updates[idx];
        if (upd.update_id > maxId) maxId = upd.update_id;

        const msg = upd.message;
        if (!msg || !msg.text || !msg.from) { processNext(idx + 1); return; }

        const chatId = msg.chat.id;
        const fromUser = msg.from.id.toString();
        const text = msg.text;
        const userName = msg.from.first_name || msg.from.username || 'User';

        log('INFO', userName + '(' + fromUser + '): ' + text.substring(0, 60));
        bridgeStatus.lastMessageAt = new Date().toISOString();
        bridgeStatus.messageCount++;

        forwardToECompany(text, fromUser, chatId).then(reply => {
          if (reply) {
            tgApi('sendMessage', { chat_id: chatId, text: reply }).then(sent => {
              if (sent && sent.ok) log('INFO', '已回复 ' + fromUser + ': ' + reply.substring(0, 60));
              else log('WARN', '回复发送失败: ' + (sent && sent.description));
              processNext(idx + 1);
            }).catch(() => { processNext(idx + 1); });
          } else {
            processNext(idx + 1);
          }
        });
      }

      processNext(0);

    }).catch(e => {
      bridgeStatus.errorCount++;
      bridgeStatus.lastError = e.message;
      log('ERROR', '轮询异常 #' + bridgeStatus.errorCount + ': ' + e.message);
      if (!stopped) pollTimer = setTimeout(poll, Math.min(CONFIG.pollIntervalMs * 5 * Math.min(bridgeStatus.errorCount, 6), 60000));
    });
  }

  poll();
}

// ========== 优雅关闭 ==========
function shutdown() {
  if (stopped) return;
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  log('INFO', '桥接已停止');
  bridgeStatus.status = 'stopped';
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  log('FATAL', '未捕获异常: ' + err.message);
  // 不自杀
});

// ========== 启动 ==========
function main() {
  log('INFO', '=== eCompany Telegram 桥接 ===');
  log('INFO', 'PID: ' + process.pid);

  gBotToken = loadToken();
  if (!gBotToken) {
    log('WARN', '无 Bot Token，等待配置...');
    bridgeStatus.status = 'waiting_token';
    const waitTimer = setInterval(() => {
      if (stopped) { clearInterval(waitTimer); return; }
      gBotToken = loadToken();
      if (gBotToken) {
        clearInterval(waitTimer);
        log('INFO', 'Token 已配置，启动服务');
        bridgeStatus.status = 'running';
        startHealthServer();
        startHealthWriter();
        startTokenWatcher();
        runBridge();
      }
    }, 15000);
    return;
  }

  startHealthServer();
  startHealthWriter();
  startTokenWatcher();
  runBridge();
}

main();
