/**
 * whatsapp-bridge.js — WhatsApp Cloud API 桥接
 *
 * 使用 Meta WhatsApp Cloud API:
 *   - HTTP 服务器接收 webhook 回调（需要 HTTPS 暴露，推荐 cloudflared）
 *   - 转发消息给 CEO → 通过 API 回复
 * 凭证: ~/.openclaw/openclaw.json → channels.whatsapp.{phoneNumberId, accessToken, verifyToken}
 * 守护模式，永不退出。只热切换凭证。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const CONFIG = {
  healthPort: 28012,
  webhookPort: 28022,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  healthFile: path.join(__dirname, '..', 'logs', 'whatsapp-bridge.status.json'),
  apiVersion: 'v18.0',
  graphBase: 'graph.facebook.com',
};

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [WhatsApp] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'whatsapp-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

// ========== 凭证加载 ==========
var gPhoneNumberId = null;
var gAccessToken = null;
var gVerifyToken = null;

function loadCreds() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const wa = cfg.channels && cfg.channels.whatsapp;
    if (!wa || !wa.phoneNumberId || !wa.accessToken) return null;
    return { phoneNumberId: wa.phoneNumberId, accessToken: wa.accessToken, verifyToken: wa.verifyToken || 'ecompany_verify' };
  } catch(e) { return null; }
}

function trySwitchCreds() {
  const creds = loadCreds();
  if (!creds) return false;
  if (creds.accessToken === gAccessToken && creds.phoneNumberId === gPhoneNumberId) return false;
  log('INFO', '切换凭证: PhoneNumberId=' + creds.phoneNumberId.substring(0, 6) + '...');
  gPhoneNumberId = creds.phoneNumberId;
  gAccessToken = creds.accessToken;
  gVerifyToken = creds.verifyToken;
  bridgeStatus.account = gPhoneNumberId;
  bridgeStatus.errorCount = 0;
  bridgeStatus.lastError = '';
  return true;
}

// ========== WhatsApp Cloud API ==========
function waApi(method, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!gAccessToken || !gPhoneNumberId) { reject(new Error('no creds')); return; }
    const data = JSON.stringify(body || {});
    const opts = {
      hostname: CONFIG.graphBase, port: 443,
      path: '/' + CONFIG.apiVersion + '/' + gPhoneNumberId + '/' + method,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + gAccessToken,
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs || 35000,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: { message: d.substring(0, 100) } }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

function sendMessageWA(to, text) {
  return waApi('messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text },
  });
}

// ========== 转发到 CEO ==========
function forwardToECompany(message, fromUser, waId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ message, from: fromUser, source: 'whatsapp-bridge', wa_id: waId });
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

// 已处理消息去重缓存 (message id)
var processedMessages = new Set();
setInterval(() => { processedMessages.clear(); }, 300000); // 5min 清一次

function startWebhookServer() {
  // webhook 接收 + 健康检查 合并在同一端口 28012
  const server = http.createServer((req, res) => {
    // === 健康检查 ===
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus));
      return;
    }

    // === WhatsApp Webhook ===
    if (req.url === '/webhook' || req.url === '/webhook/') {
      // GET = 验证挑战 (Meta webhook setup)
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost');
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token === gVerifyToken && challenge) {
          log('INFO', 'Webhook 验证成功 (challenge=' + challenge.substring(0, 10) + '...)');
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(challenge);
        } else {
          log('WARN', 'Webhook 验证失败: mode=' + mode + ' token=' + token);
          res.writeHead(403);
          res.end('Forbidden');
        }
        return;
      }

      // POST = 接收消息
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const entries = data.entry || [];
            for (const entry of entries) {
              const changes = entry.changes || [];
              for (const change of changes) {
                const msgs = change.value && change.value.messages || [];
                for (const msg of msgs) {
                  // 去重
                  if (processedMessages.has(msg.id)) continue;
                  processedMessages.add(msg.id);

                  const text = msg.text ? msg.text.body : '';
                  const from = msg.from || '';
                  const waId = change.value && change.value.metadata && change.value.metadata.display_phone_number || '';

                  if (!text || !from) continue;

                  log('INFO', from + ': ' + text.substring(0, 60));
                  bridgeStatus.lastMessageAt = new Date().toISOString();
                  bridgeStatus.messageCount++;

                  forwardToECompany(text, from, waId).then(reply => {
                    if (reply) {
                      sendMessageWA(from, reply).then(sent => {
                        if (sent && !sent.error) log('INFO', '已回复 ' + from + ': ' + reply.substring(0, 60));
                        else log('WARN', '回复发送失败: ' + JSON.stringify(sent && sent.error));
                      });
                    }
                  });
                }
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch(e) {
            log('WARN', 'Webhook 解析失败: ' + e.message);
            res.writeHead(200);
            res.end('ok');
          }
        });
        return;
      }
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(CONFIG.healthPort, '0.0.0.0', () => {
    log('INFO', 'Webhook 服务: http://0.0.0.0:' + CONFIG.healthPort + '/webhook');
    log('INFO', '⚠ 需要 HTTPS 暴露！使用 cloudflared tunnel 或部署到公网服务器');
    log('INFO', '  Webhook URL 配置: https://<你的域名>:' + CONFIG.healthPort + '/webhook');
    log('INFO', '  Verify Token: ' + gVerifyToken);
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
  log('INFO', '=== eCompany WhatsApp 桥接 ===');
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
        gPhoneNumberId = c.phoneNumberId;
        gAccessToken = c.accessToken;
        gVerifyToken = c.verifyToken;
        log('INFO', '凭证已配置，启动服务');
        bridgeStatus.status = 'running';
        startWebhookServer();
        startHealthWriter();
        startCredsWatcher();
      }
    }, 15000);
    return;
  }

  gPhoneNumberId = creds.phoneNumberId;
  gAccessToken = creds.accessToken;
  gVerifyToken = creds.verifyToken;
  bridgeStatus.account = gPhoneNumberId;

  startWebhookServer();
  startHealthWriter();
  startCredsWatcher();
}

main();
