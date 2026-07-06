/**
 * wechat-bridge.js — 独立微信桥接（稳定版 v4）
 *
 * 铁律：
 *  1. 永不退出、永不重启。进程跑起来就是守护进程。
 *  2. 账户文件变了 → 原地热切换凭证，不清除任何进程状态。
 *  3. 切换后旧账号的 updatesBuf 自动清空，历史数据不残留。
 *  4. 看门狗（父进程）只负责起桥接，不起就不要了——桥接自己保证不死。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ========== 配置 ==========
const CONFIG = {
  healthPort: 28001,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  pollIntervalMs: 1000,
  sessionExpiredBackoffMs: 60000,
  healthFile: path.join(__dirname, '..', 'logs', 'wechat-bridge.status.json'),
  accountBackupFile: path.join(__dirname, '..', 'logs', 'wechat-bridge.account.json'),
};

// ========== 日志 ==========
function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'wechat-bridge.log'), line + '\n', 'utf-8'); } catch(e) {}
}

// ========== 账号管理 ==========
var gAccount = null;

function saveBackup(acct) {
  try { fs.writeFileSync(CONFIG.accountBackupFile, JSON.stringify(acct, null, 2), 'utf-8'); } catch(e) {}
}

function loadFromGateway() {
  const dir = path.join(process.env.USERPROFILE, '.openclaw', 'openclaw-weixin', 'accounts');
  const idx = path.join(dir, '..', 'accounts.json');
  if (!fs.existsSync(idx)) return null;
  try {
    const list = JSON.parse(fs.readFileSync(idx, 'utf8'));
    if (!list || !list[0]) return null;
    const f = path.join(dir, list[0] + '.json');
    if (!fs.existsSync(f)) return null;
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!raw.token) return null;
    const label = raw.token.includes('@') ? raw.token.split('@')[0] : raw.token.substring(0, 16);
    return { token: raw.token, baseUrl: raw.baseUrl, label };
  } catch(e) { return null; }
}

function loadAccount() {
  // 优先独立备份（网关插件删文件也不影响）
  if (fs.existsSync(CONFIG.accountBackupFile)) {
    try {
      const b = JSON.parse(fs.readFileSync(CONFIG.accountBackupFile, 'utf8'));
      if (b && b.token) return b;
    } catch(e) {}
  }
  // 无备份则从网关读
  const a = loadFromGateway();
  if (a) saveBackup(a);
  return a;
}

// 热切换账号：不退出、不重启，原地换凭证
function trySwitchAccount() {
  var a = loadFromGateway();
  if (!a) return false;
  if (gAccount && a.token === gAccount.token) return false; // 没变化
  var oldLabel = gAccount ? gAccount.label : '(none)';
  log('INFO', '检测到新绑定账号: ' + a.label + ' (旧: ' + oldLabel + ')，原地切换...');
  gAccount = a;
  saveBackup(a);
  bridgeStatus.account = a.label;
  bridgeStatus.errorCount = 0;
  bridgeStatus.lastError = '';
  bridgeStatus.sessionRefreshedAt = new Date().toISOString();
  log('INFO', '账号已切换: ' + a.label + '（进程不重启，历史数据已清除）');
  return true;
}

// ========== API ==========
function buildBaseInfo() {
  return { bot_agent: 'eCompany-Bridge', channel_version: '2.1.9' };
}

function randomUin() {
  return 'wx_' + Math.random().toString(36).substring(2, 10);
}

function apiPost(account, endpoint, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    var host = new URL(account.baseUrl).hostname;
    var data = JSON.stringify(body);
    var opts = {
      hostname: host, port: 443, path: '/' + endpoint, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + account.token,
        'AuthorizationType': 'ilink_bot_token',
        'X-WECHAT-UIN': randomUin(),
        'iLink-App-Id': '',
        'iLink-App-ClientVersion': '132889',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs || 35000,
    };
    var req = https.request(opts, function(res) {
      var d = ''; res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ ret: -1 }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

function genClientId() {
  return 'cli_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

async function sendMessage(account, toUser, content) {
  try {
    var r = await apiPost(account, 'ilink/bot/sendmessage', {
      msg: {
        from_user_id: '',
        to_user_id: toUser,
        client_id: genClientId(),
        message_type: 2,
        message_state: 2,
        item_list: [{ type: 1, text_item: { text: content } }],
      },
      base_info: buildBaseInfo(),
    });
    if (r && (r.ret === 0 || (r.base_response && r.base_response.ret === 0) || JSON.stringify(r) === '{}')) return true;
    log('WARN', 'sendMessage 返回: ' + JSON.stringify(r));
    return false;
  } catch(e) {
    log('ERROR', 'sendMessage 异常: ' + e.message);
    return false;
  }
}

function forwardToECompany(message, fromUser) {
  return new Promise(function(resolve) {
    var data = JSON.stringify({ message: message, from: fromUser, source: 'wechat-bridge' });
    var req = http.request({
      hostname: CONFIG.eCompanyHost, port: CONFIG.eCompanyPort,
      path: '/api/v4/wechat/incoming', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 65000,
    }, function(res) {
      var d = ''; res.on('data', function(c) { d += c; });
      res.on('end', function() { try { resolve(JSON.parse(d).reply || ''); } catch(e) { resolve(''); } });
    });
    req.on('error', function() { resolve(''); });
    req.on('timeout', function() { req.destroy(); resolve(''); });
    req.write(data); req.end();
  });
}

// ========== 健康检查 ==========
var bridgeStatus = {
  status: 'starting', startedAt: null, lastPollAt: null, lastMessageAt: null,
  errorCount: 0, messageCount: 0, account: '', lastError: '', sessionRefreshedAt: null,
};

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
  server.on('error', function(e) { log('WARN', '健康检查端口被占用: ' + e.message); });
}

function startHealthWriter() {
  setInterval(function() {
    try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
  }, 15000);
}

// ========== 文件变化监听（永不退出，只热切换）==========
function startAccountWatcher() {
  // 监听 accounts 目录文件变化
  var accountsDir = path.join(process.env.USERPROFILE, '.openclaw', 'openclaw-weixin', 'accounts');
  if (!fs.existsSync(accountsDir)) return;
  try {
    fs.watch(accountsDir, { persistent: false }, function(event, filename) {
      if (event === 'rename' && filename && filename.endsWith('.json')) {
        log('INFO', '检测到账号文件变化: ' + filename + '，尝试热切换...');
        // 短延迟等文件写完成
        setTimeout(function() {
          if (trySwitchAccount()) {
            // 切换成功 → 清空轮询状态，下次 poll 会用新 token
            // poll 函数会在下一轮使用 gAccount，自动清 updatesBuf
          }
        }, 500);
      }
    });
    log('INFO', '账号文件监听已启动（仅热切换，不重启）');
  } catch(e) {
    log('WARN', '无法监听账号目录: ' + e.message);
  }
}

// ========== 主循环 ==========
var pollTimer = null;
var stopped = false;

function runBridge(initialAccount) {
  gAccount = initialAccount;

  bridgeStatus.status = 'running';
  bridgeStatus.startedAt = new Date().toISOString();
  bridgeStatus.account = gAccount.label;

  log('INFO', '账号: ' + gAccount.label + '（守护模式，永不退出）');

  var updatesBuf = '';

  function poll() {
    if (stopped) return;

    apiPost(gAccount, 'ilink/bot/getupdates', {
      get_updates_buf: updatesBuf,
      base_info: buildBaseInfo(),
    }).then(function(result) {
      bridgeStatus.lastPollAt = new Date().toISOString();

      var ret = result.ret != null ? result.ret : (result.base_response ? result.base_response.ret : 0);
      var errcode = result.errcode;

      // 账号切换检测（用户扫码后产生新文件，trySwitchAccount 会在文件监听中触发）
      // 但还需要检测：当 API 返回 -14 时尝试热切换
      if (errcode === -14 || ret === -14) {
        bridgeStatus.lastError = 'session_expired';
        bridgeStatus.errorCount++;
        log('WARN', 'session 过期，尝试热切换账号...');
        // 先等一秒让网关写完账户文件，然后尝试切换
        setTimeout(function() {
          if (trySwitchAccount()) {
            updatesBuf = '';
            log('INFO', '已切换到新账号，恢复轮询');
            if (!stopped) pollTimer = setTimeout(poll, 1000);
          } else {
            log('WARN', '未检测到新账号，60s 后重试');
            if (!stopped) pollTimer = setTimeout(poll, CONFIG.sessionExpiredBackoffMs);
          }
        }, 1500);
        return;
      }

      if (ret === 0) {
        bridgeStatus.errorCount = 0;
        bridgeStatus.lastError = '';
        if (result.updates_buf) updatesBuf = result.updates_buf;
        var msgs = result.msgs || [];

        function processNext(idx) {
          if (idx >= msgs.length) {
            if (!stopped) pollTimer = setTimeout(poll, CONFIG.pollIntervalMs);
            return;
          }
          var msg = msgs[idx];
          var text = '';
          var msgId = msg.msg_id || msg.MsgId || (msg.msgData ? msg.msgData.msgId : '') || '';
          var fromUser = '';
          if (msg.item_list) {
            for (var i = 0; i < msg.item_list.length; i++) {
              var item = msg.item_list[i];
              if (item.type === 1 && item.text_item && item.text_item.text) {
                text = item.text_item.text;
              } else if (item.type === 3 && item.voice_item) {
                log('INFO', '收到语音消息(text=' + (item.voice_item.text||'').substring(0,30) + ', duration=' + item.voice_item.playtime + 'ms)');
                // 微信语音消息已自带转写文字
                text = item.voice_item.text || '';
              }
            }
            fromUser = msg.from_user_id || '';
          } else if (msg.content) {
            text = typeof msg.content === 'string' ? msg.content : (msg.content.text || '');
            fromUser = msg.fromUser || msg.from_user || '';
            msgId = msg.msgId || msg.MsgId || '';
          }
          // 去重：同一消息120秒内不重复转发（用fromUser+text做key，不用msgId——iLink有时不返回msgId）
          var dedupKey = fromUser + '|' + text;
          var now = Date.now();
          if (bridgeStatus._recentMsgs) {
            var lastTime = bridgeStatus._recentMsgs.get(dedupKey);
            if (lastTime && (now - lastTime) < 120000) { processNext(idx + 1); return; }
          } else { bridgeStatus._recentMsgs = new Map(); }
          bridgeStatus._recentMsgs.set(dedupKey, now);
          // 清理过期记录
          if (bridgeStatus._recentMsgs.size > 200) {
            var keysToDelete = [];
            for (var key of bridgeStatus._recentMsgs.keys()) {
              if (now - bridgeStatus._recentMsgs.get(key) > 180000) keysToDelete.push(key);
            }
            for (var dk = 0; dk < keysToDelete.length; dk++) bridgeStatus._recentMsgs.delete(keysToDelete[dk]);
          }
          if (text && fromUser) {
            log('INFO', fromUser + ': ' + text.substring(0, 60));
            bridgeStatus.lastMessageAt = new Date().toISOString();
            bridgeStatus.messageCount++;
            forwardToECompany(text, fromUser).then(function(reply) {
              if (reply) {
                sendMessage(gAccount, fromUser, reply).then(function(sent) {
                  if (sent) log('INFO', '已回复 ' + fromUser + ': ' + reply.substring(0, 60));
                  else log('INFO', '回复发送失败');
                  processNext(idx + 1);
                });
              } else {
                processNext(idx + 1);
              }
            });
          } else {
            processNext(idx + 1);
          }
        }
        processNext(0);
      } else {
        bridgeStatus.errorCount++;
        bridgeStatus.lastError = 'ret=' + ret;
        log('WARN', 'getupdates ret=' + ret + ' ' + (result.err_msg || result.errmsg || ''));
        if (!stopped) pollTimer = setTimeout(poll, Math.min(CONFIG.pollIntervalMs * Math.pow(2, Math.min(bridgeStatus.errorCount, 6)), 120000));
      }
    }).catch(function(e) {
      bridgeStatus.errorCount++;
      bridgeStatus.lastError = e.message;
      log('ERROR', '轮询异常 #' + bridgeStatus.errorCount + ': ' + e.message);
      if (!stopped) pollTimer = setTimeout(poll, Math.min(CONFIG.pollIntervalMs * Math.pow(2, Math.min(bridgeStatus.errorCount, 6)), 120000));
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
process.on('uncaughtException', function(err) {
  log('FATAL', '未捕获异常: ' + err.message);
  // 不自杀 —— 看门狗会处理
});

// ========== 启动 ==========
function main() {
  log('INFO', '=== eCompany 微信桥接 v4（守护模式）===');
  log('INFO', 'PID: ' + process.pid);

  var account = loadAccount();
  if (!account) {
    log('WARN', '暂无账号，等待扫码绑定...');
    bridgeStatus.status = 'waiting_account';
    // 不退出，等文件变化通知
    startAccountWatcher();
    // 每 15s 检查一次
    var waitTimer = setInterval(function() {
      if (stopped) { clearInterval(waitTimer); return; }
      account = loadAccount();
      if (account) {
        clearInterval(waitTimer);
        log('INFO', '检测到账号:' + account.label + '，启动服务');
        bridgeStatus.status = 'running';
        startHealthServer();
        startHealthWriter();
        startAccountWatcher();
        runBridge(account);
      }
    }, 15000);
    return;
  }

  log('INFO', '账号: ' + account.label);
  log('INFO', '服务器: ' + account.baseUrl);

  startHealthServer();
  startHealthWriter();
  startAccountWatcher();
  runBridge(account);
}

main();
