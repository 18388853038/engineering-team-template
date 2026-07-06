/**
 * slack-bridge.js — Slack Bot 桥接
 *
 * 使用 Slack Events API (HTTP 回调) + Web API (chat.postMessage)
 *   - HTTP 服务器接收 Event Subscriptions 回调
 *   - 支持 URL 验证挑战
 *   - 转发消息给 CEO → 通过 chat.postMessage 回复
 * 凭证: ~/.openclaw/openclaw.json → channels.slack.{botToken, signingSecret}
 * 
 * 需要 HTTPS 暴露（推荐 cloudflared 或部署到公网）
 * 守护模式，永不退出。只热切换凭证。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const CONFIG = {
  healthPort: 28014,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  healthFile: path.join(__dirname, '..', 'logs', 'slack-bridge.status.json'),
  slackApiBase: 'slack.com',
};

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [Slack] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'slack-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

// ========== 凭证加载 ==========
var gBotToken = null;
var gSigningSecret = null;

function loadCreds() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const sk = cfg.channels && cfg.channels.slack;
    if (!sk || !sk.botToken) return null;
    return { botToken: sk.botToken, signingSecret: sk.signingSecret || '' };
  } catch(e) { return null; }
}

function trySwitchCreds() {
  const creds = loadCreds();
  if (!creds) return false;
  if (creds.botToken === gBotToken) return false;
  log('INFO', '切换 Bot Token');
  gBotToken = creds.botToken;
  gSigningSecret = creds.signingSecret;
  bridgeStatus.account = gBotToken.substring(0, 12) + '...';
  bridgeStatus.errorCount = 0;
  bridgeStatus.lastError = '';
  return true;
}

// ========== Slack API ==========
function slackApi(method, endpoint, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!gBotToken) { reject(new Error('no token')); return; }
    const data = body ? querystring.stringify(body) : '';
    const opts = {
      hostname: CONFIG.slackApiBase, port: 443,
      path: '/api' + endpoint,
      method: method || 'POST',
      headers: {
        'Authorization': 'Bearer ' + gBotToken,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs || 15000,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, error: 'parse_error' }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function sendMessageSlack(channel, text) {
  return slackApi('POST', '/chat.postMessage', { channel: channel, text: text });
}

// ========== 签名验证 ==========
function verifySlackSignature(reqBody, signature, timestamp) {
  if (!gSigningSecret) return true; // 没有 signingSecret 则跳过验证
  if (!signature || !timestamp) return false;

  // 检查时间戳是否在 5 分钟内
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const base = 'v0:' + timestamp + ':' + reqBody;
  const hmac = crypto.createHmac('sha256', gSigningSecret).update(base).digest('hex');
  const expected = 'v0=' + hmac;

  // 恒定时间比较
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ========== 转发到 CEO ==========
function forwardToECompany(message, fromUser, channel, teamId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ message, from: fromUser, source: 'slack-bridge', channel: channel, team_id: teamId || '' });
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

// ========== 健康检查 + Webhook ==========
var bridgeStatus = {
  status: 'starting', startedAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '', lastError: '',
};

// 已处理消息去重
var processedEvents = new Set();
setInterval(() => { if (processedEvents.size > 5000) processedEvents.clear(); }, 600000);

function startWebhookServer() {
  const server = http.createServer((req, res) => {
    // === 健康检查 ===
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus));
      return;
    }

    // === Slack Events ===
    if (req.url === '/events' || req.url === '/events/') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        // 验证签名
        const signature = req.headers['x-slack-signature'];
        const timestamp = req.headers['x-slack-request-timestamp'];
        if (!verifySlackSignature(body, signature, timestamp)) {
          log('WARN', '签名验证失败');
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        try {
          const data = JSON.parse(body);

          // URL 验证挑战
          if (data.type === 'url_verification') {
            log('INFO', 'URL 验证成功');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ challenge: data.challenge }));
            return;
          }

          // Event Callback
          if (data.type === 'event_callback') {
            const event = data.event;

            // 去重
            const eventId = data.event_id || (data.event_time + '_' + (event && event.ts));
            if (processedEvents.has(eventId)) {
              res.writeHead(200);
              res.end('ok');
              return;
            }
            processedEvents.add(eventId);

            // 只处理 im（私聊）消息
            if (event && event.type === 'message' && event.subtype !== 'bot_message' && !event.bot_id) {
              const text = event.text || '';
              const user = event.user || '';
              const channel = event.channel || '';
              const teamId = data.team_id || '';

              if (text && user) {
                log('INFO', user + ': ' + text.substring(0, 60));
                bridgeStatus.lastMessageAt = new Date().toISOString();
                bridgeStatus.messageCount++;

                forwardToECompany(text, user, channel, teamId).then(reply => {
                  if (reply) {
                    sendMessageSlack(channel, reply).then(sent => {
                      if (sent && sent.ok) log('INFO', '已回复 ' + user + ': ' + reply.substring(0, 60));
                      else log('WARN', '回复发送失败: ' + (sent && sent.error));
                    });
                  }
                });
              }
            }
          }

          // Slack 要求 3 秒内返回 200
          res.writeHead(200);
          res.end('ok');
        } catch(e) {
          log('WARN', '事件解析失败: ' + e.message);
          res.writeHead(200);
          res.end('ok');
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(CONFIG.healthPort, '0.0.0.0', () => {
    log('INFO', 'Webhook 服务: http://0.0.0.0:' + CONFIG.healthPort + '/events');
    log('INFO', '⚠ 需要 HTTPS 暴露！使用 cloudflared tunnel 或部署到公网服务器');
    log('INFO', '  Events Request URL: https://<你的域名>:' + CONFIG.healthPort + '/events');
  });
  server.on('error', e => log('WARN', 'Webhook 端口被占用: ' + e.message));
}

function startHealthWriter() {
  setInterval(() => {
    try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  }, 15000);
}

// ========== 凭证监听 ==========
function startCredsWatcher() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return;
  try {
    fs.watch(cfgPath, { persistent: false }, (event) => {
      if (event === 'change') setTimeout(() => trySwitchCreds(), 500);
    });
    log('INFO', '凭证文件监听已启动');
  } catch(e) {
    log('WARN', '无法监听凭证文件: ' + e.message);
  }
}

// ========== 优雅关闭 ==========
var stopped = false;
function shutdown() {
  if (stopped) return;
  stopped = true;
  log('INFO', '桥接已停止');
  bridgeStatus.status = 'stopped';
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => { log('FATAL', '未捕获异常: ' + err.message); });

// ========== 启动 ==========
function main() {
  log('INFO', '=== eCompany Slack 桥接 ===');
  log('INFO', 'PID: ' + process.pid);

  const creds = loadCreds();
  if (!creds) {
    log('WARN', '无凭证，等待配置...');
    bridgeStatus.status = 'waiting_creds';
    const waitTimer = setInterval(() => {
      if (stopped) { clearInterval(waitTimer); return; }
      const c = loadCreds();
      if (c) {
        clearInterval(waitTimer);
        gBotToken = c.botToken;
        gSigningSecret = c.signingSecret;
        bridgeStatus.account = gBotToken.substring(0, 12) + '...';
        log('INFO', '凭证已配置，启动服务');
        bridgeStatus.status = 'running';
        startWebhookServer();
        startHealthWriter();
        startCredsWatcher();
      }
    }, 15000);
    return;
  }

  gBotToken = creds.botToken;
  gSigningSecret = creds.signingSecret;
  bridgeStatus.account = gBotToken.substring(0, 12) + '...';
  bridgeStatus.status = 'running';

  startWebhookServer();
  startHealthWriter();
  startCredsWatcher();
}

main();
