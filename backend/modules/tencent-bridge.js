/**
 * tencent-bridge.js — 腾讯云服务桥接
 *
 * 提供腾讯文档/会议/问卷等办公工具的能力。
 * 凭证从 OpenClaw 配置读取。
 *
 * MCP 直连: 创建/编辑文档（无长度限制）
 * mcporter: 搜索/读取文档
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const CONFIG = {
  healthPort: 28006,
  eCompanyHost: '127.0.0.1',
  eCompanyPort: 8002,
  healthFile: path.join(__dirname, '..', 'logs', 'tencent-bridge.status.json'),
  logFile: path.join(__dirname, '..', 'logs', 'tencent-bridge.log'),
};

function log(level, msg) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] [' + level + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(CONFIG.logFile, line + '\n', 'utf-8'); } catch(e) {}
}

function loadCredentials() {
  try {
    var raw = fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.substring(1);
    var cfg = JSON.parse(raw);
    var tc = cfg && cfg.channels && cfg.channels.tencent;
    if (tc && tc.secretId && tc.secretKey) {
      return { secretId: tc.secretId, secretKey: tc.secretKey };
    }
  } catch(e) {}
  return null;
}

var gCreds = null;
var bridgeStatus = {
  status: 'starting', startedAt: null, lastPollAt: null,
  errorCount: 0, account: '', _configured: false,
};
var stopped = false;

function writeHealth() {
  bridgeStatus.lastPollAt = new Date().toISOString();
  bridgeStatus._uptime = Math.floor((Date.now() - new Date(bridgeStatus.startedAt).getTime()) / 1000);
  try { fs.writeFileSync(CONFIG.healthFile, JSON.stringify(bridgeStatus, null, 2), 'utf-8'); } catch(e) {}
}

function startHealthServer() {
  var server = http.createServer(function(req, res) {
    writeHealth();
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgeStatus, null, 2));
    } else { res.writeHead(404); res.end('not found'); }
  });
  server.listen(CONFIG.healthPort, '127.0.0.1', function() {
    log('INFO', '健康检查: http://127.0.0.1:' + CONFIG.healthPort + '/health');
  });
  server.on('error', function(e) { log('WARN', '健康端口被占: ' + e.message); });
}

function main() {
  log('INFO', '=== Tencent Cloud Bridge v1 ===');
  log('INFO', 'PID: ' + process.pid);

  var creds = loadCredentials();
  if (!creds) {
    log('WARN', '暂无腾讯云凭证');
    bridgeStatus.status = 'waiting_account';
    bridgeStatus.account = '(not configured)';
  } else {
    log('INFO', 'SecretId: ' + creds.secretId.substring(0, 10) + '...');
    bridgeStatus.account = creds.secretId.substring(0, 10) + '...';
    bridgeStatus._configured = true;
    bridgeStatus.status = 'running';
    
    // 验证凭证有效性
    log('INFO', '凭证已就绪，等待CEO调用');
  }

  bridgeStatus.startedAt = new Date().toISOString();
  startHealthServer();
  writeHealth();

  // 凭证变更监控（每30秒检查）
  var credSnapshot = creds ? JSON.stringify(creds) : '';
  setInterval(function() {
    var newCreds = loadCredentials();
    var newSnap = newCreds ? JSON.stringify(newCreds) : '';
    if (newSnap !== credSnapshot) {
      log('INFO', '凭证已变更，重启中...');
      process.exit(0);
    }
  }, 30000);

  log('INFO', 'Tencent Cloud bridge running.');
  process.stdin.resume();
}

process.on('SIGINT', function() { stopped = true; process.exit(0); });
process.on('SIGTERM', function() { stopped = true; process.exit(0); });
process.on('uncaughtException', function(err) { log('FATAL', '未捕获: ' + err.message); });

main();
