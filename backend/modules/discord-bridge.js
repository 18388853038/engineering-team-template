/**
 * discord-bridge.js — Discord Bot 桥接
 *
 * 使用 Discord Gateway API v10 (WebSocket) + REST API
 *   - Gateway: 接收消息事件 (MESSAGE_CREATE)
 *   - REST: 发送回复消息
 * 凭证: ~/.openclaw/openclaw.json → channels.discord.botToken
 *
 * 依赖: ws (已存在于 package.json)
 * 守护模式，永不退出。只热切换凭证。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// 动态加载 ws（由 server-modern.js fork 时会提供）
let WebSocket;
try { WebSocket = require('ws'); } catch(e) {
  // 如果 ws 不可用，记录错误但不自杀
  console.log('[Discord] ws 模块加载失败: ' + e.message);
}

const CONFIG = {
  healthPort: 28013,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  healthFile: path.join(__dirname, '..', 'logs', 'discord-bridge.status.json'),
  apiBase: 'https://discord.com/api/v10',
  gatewayVersion: 'v10',
  intents: 33280, // GUILD_MESSAGES (512) | MESSAGE_CONTENT (32768)
};

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [Discord] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'discord-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

// ========== 凭证加载 ==========
var gBotToken = null;

function loadToken() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const token = cfg.channels && cfg.channels.discord && cfg.channels.discord.botToken;
    return token || null;
  } catch(e) { return null; }
}

function trySwitchToken() {
  const token = loadToken();
  if (!token) return false;
  if (token === gBotToken) return false;
  log('INFO', '切换 Bot Token');
  gBotToken = token;
  bridgeStatus.account = token.substring(0, 12) + '...';
  bridgeStatus.errorCount = 0;
  bridgeStatus.lastError = '';
  return true;
}

// ========== Discord API ==========
function discordApi(method, endpoint, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!gBotToken) { reject(new Error('no token')); return; }
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'discord.com', port: 443,
      path: '/api/v10' + endpoint,
      method: method,
      headers: {
        'Authorization': 'Bot ' + gBotToken,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (eCompany, 1.0.0)',
      },
      timeout: timeoutMs || 15000,
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function sendMessage(channelId, text) {
  return discordApi('POST', '/channels/' + channelId + '/messages', { content: text });
}

// ========== 转发到 CEO ==========
function forwardToECompany(message, fromUser, channelId, guildId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ message, from: fromUser, source: 'discord-bridge', channel_id: channelId, guild_id: guildId || '' });
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
  status: 'starting', startedAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '', lastError: '',
  gatewayConnected: false, guildCount: 0,
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

// ========== Gateway WebSocket ==========
var ws = null;
var heartbeatInterval = null;
var sequence = null;
var sessionId = null;
var reconnectTimer = null;
var stopped = false;

function heartbeat(ms) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 1, d: sequence }));
    }
  }, ms);
}

function reconnect() {
  if (stopped) return;
  log('INFO', '5 秒后重连...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (!stopped) connectGateway();
  }, 5000);
}

function connectGateway() {
  if (!WebSocket) {
    log('FATAL', 'ws 模块未加载，无法连接');
    return;
  }
  if (!gBotToken) {
    log('WARN', '无 Bot Token');
    bridgeStatus.gatewayConnected = false;
    return;
  }

  log('INFO', '连接 Discord Gateway...');

  // 先获取 gateway URL
  discordApi('GET', '/gateway/bot').then(resp => {
    if (resp.status !== 200) {
      log('WARN', '获取 gateway URL 失败: ' + resp.status);
      reconnect();
      return;
    }
    const url = resp.data.url + '/?encoding=json&v=' + CONFIG.gatewayVersion;
    log('INFO', 'Gateway URL: ' + url);

    try {
      ws = new WebSocket(url);
    } catch(e) {
      log('FATAL', 'WebSocket 连接失败: ' + e.message);
      reconnect();
      return;
    }

    ws.on('open', () => {
      log('INFO', 'Gateway 连接已建立');
    });

    ws.on('message', (raw) => {
      try {
        const pkt = JSON.parse(raw.toString());

        switch (pkt.op) {
          case 10: // Hello
            heartbeat(pkt.d.heartbeat_interval);
            // Identify
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: gBotToken,
                intents: CONFIG.intents,
                properties: {
                  $os: process.platform,
                  $browser: 'eCompany',
                  $device: 'eCompany',
                },
              },
            }));
            break;

          case 0: // Dispatch
            sequence = pkt.s;
            if (pkt.t === 'READY') {
              sessionId = pkt.d.session_id;
              bridgeStatus.gatewayConnected = true;
              bridgeStatus.guildCount = (pkt.d.guilds || []).length;
              const botUser = pkt.d.user;
              log('INFO', '已登录: ' + (botUser.username || 'unknown') + '#' + (botUser.discriminator || '0'));
              log('INFO', '已加入 ' + bridgeStatus.guildCount + ' 个服务器');
            } else if (pkt.t === 'MESSAGE_CREATE') {
              const msg = pkt.d;
              // 忽略机器人自己的消息
              if (msg.author && msg.author.bot) return;
              // 只处理文本消息
              if (!msg.content || msg.content.trim() === '') return;

              const text = msg.content;
              const fromUser = msg.author.id;
              const channelId = msg.channel_id;
              const guildId = msg.guild_id;
              const userName = msg.author.username || 'User';

              log('INFO', userName + ' (#' + channelId.substring(0, 6) + '): ' + text.substring(0, 60));
              bridgeStatus.lastMessageAt = new Date().toISOString();
              bridgeStatus.messageCount++;

              forwardToECompany(text, fromUser, channelId, guildId).then(reply => {
                if (reply) {
                  sendMessage(channelId, reply).then(sent => {
                    if (sent && sent.status < 300) log('INFO', '已回复 ' + fromUser + ': ' + reply.substring(0, 60));
                    else log('WARN', '回复发送失败: status=' + (sent && sent.status));
                  });
                }
              });
            }
            break;

          case 7: // Reconnect
            log('WARN', '收到 Reconnect 指令');
            if (ws) { ws.close(); ws = null; }
            reconnect();
            break;

          case 9: // Invalid Session
            log('WARN', 'Invalid Session，重置后重连');
            sessionId = null;
            sequence = null;
            if (ws) { ws.close(); ws = null; }
            reconnect();
            break;
        }
      } catch(e) {
        log('WARN', '消息解析失败: ' + e.message);
      }
    });

    ws.on('close', (code, reason) => {
      bridgeStatus.gatewayConnected = false;
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
      log('WARN', 'Gateway 断开: code=' + code + ' reason=' + (reason || '').toString().substring(0, 50));
      if (!stopped) reconnect();
    });

    ws.on('error', (err) => {
      bridgeStatus.errorCount++;
      bridgeStatus.lastError = err.message;
      log('ERROR', 'WebSocket 错误: ' + err.message);
    });

  }).catch(e => {
    log('ERROR', '获取 gateway URL 异常: ' + e.message);
    reconnect();
  });
}

function disconnectGateway() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch(e) {} ws = null; }
  bridgeStatus.gatewayConnected = false;
}

// ========== 凭证监听 ==========
function startTokenWatcher() {
  const cfgPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'openclaw.json');
  if (!fs.existsSync(cfgPath)) return;
  try {
    fs.watch(cfgPath, { persistent: false }, (event) => {
      if (event === 'change') {
        setTimeout(() => {
          if (trySwitchToken()) {
            log('INFO', 'Token 已切换，重新连接 Gateway');
            disconnectGateway();
            connectGateway();
          }
        }, 500);
      }
    });
    log('INFO', 'Token 文件监听已启动');
  } catch(e) {
    log('WARN', '无法监听 Token 文件: ' + e.message);
  }
}

// ========== 优雅关闭 ==========
function shutdown() {
  if (stopped) return;
  stopped = true;
  log('INFO', '桥接已停止');
  bridgeStatus.status = 'stopped';
  disconnectGateway();
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => { log('FATAL', '未捕获异常: ' + err.message); });

// ========== 启动 ==========
function main() {
  log('INFO', '=== eCompany Discord 桥接 ===');
  log('INFO', 'PID: ' + process.pid);

  if (!WebSocket) {
    log('FATAL', 'ws 模块不可用，无法启动');
    bridgeStatus.status = 'error';
    bridgeStatus.lastError = 'ws module not available';
    startHealthServer();
    startHealthWriter();
    return;
  }

  gBotToken = loadToken();
  if (!gBotToken) {
    log('WARN', '无 Bot Token，等待配置...');
    bridgeStatus.status = 'waiting_token';
    const waitTimer = setInterval(() => {
      if (stopped) { clearInterval(waitTimer); return; }
      gBotToken = loadToken();
      if (gBotToken) {
        clearInterval(waitTimer);
        log('INFO', 'Token 已配置，连接 Gateway');
        bridgeStatus.status = 'running';
        startHealthServer();
        startHealthWriter();
        startTokenWatcher();
        connectGateway();
      }
    }, 15000);
    return;
  }

  bridgeStatus.status = 'running';
  startHealthServer();
  startHealthWriter();
  startTokenWatcher();
  connectGateway();
}

main();
