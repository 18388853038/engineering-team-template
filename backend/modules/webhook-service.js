/**
 * webhook-service.js — eCompany Webhook 接收服务
 * 
 * 集中接收外部系统的 Webhook 回调，统一验证、路由、处理。
 * 
 * 支持：
 *   - GitHub/GitLab Push/PR/Issue 事件
 *   - CI/CD 构建状态通知
 *   - 监控告警推送
 *   - 自定义 JSON Webhook
 * 
 * 端口: 28010 (默认，通过 WEBHOOK_PORT 环境变量覆盖)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const LOG_FILE = path.join(BASE, 'logs', 'webhook.log');
const HOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '28010', 10);
const ECOMPANY_PORT = parseInt(process.env.PORT || '8002', 10);

var server = null;
var isRunning = false;

// ========== 日志 ==========
function log(level, msg) {
  var line = '[' + new Date().toISOString() + '] [' + level + '] ' + msg;
  console.log('[Webhook] ' + line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch(e) {}
}

// ========== Webhook 处理 ==========

var HANDLERS = {};

function registerHandler(name, matcher, handler) {
  HANDLERS[name] = { matcher: matcher, handler: handler };
  log('INFO', '已注册 Webhook 处理器: ' + name);
}

// 默认处理器：转发到 CEO
async function forwardToCEO(title, body) {
  try {
    var msg = '【Webhook】' + title + '\n' + (body || '');
    var payload = JSON.stringify({ message: msg, source: 'webhook', channel: 'webhook' });
    var req = http.request({
      hostname: '127.0.0.1', port: ECOMPANY_PORT,
      path: '/api/v4/channel/incoming', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30000
    });
    req.write(payload);
    req.end();
  } catch(e) {
    log('ERROR', '转发到CEO失败: ' + e.message);
  }
}

// ========== 内置处理器 ==========

// GitHub Webhook
registerHandler('github', function(headers, body) {
  return headers['x-github-event'] || (body && body.repository && body.repository.full_name);
}, async function(headers, body, raw) {
  var event = headers['x-github-event'] || 'unknown';
  var repo = body.repository ? body.repository.full_name : 'unknown';
  var sender = body.sender ? body.sender.login : 'unknown';

  switch (event) {
    case 'push':
      var branch = (body.ref || '').replace('refs/heads/', '');
      var commits = (body.commits || []).length;
      return await forwardToCEO(
        'GitHub Push: ' + repo + ' [' + branch + ']',
        sender + ' 推送了 ' + commits + ' 个提交'
      );
    case 'pull_request':
      var pr = body.pull_request;
      var action = body.action || 'opened';
      return await forwardToCEO(
        'GitHub PR: ' + repo + ' #' + (pr && pr.number),
        (pr && pr.title) + ' - ' + action + ' by ' + sender
      );
    case 'issues':
      var issue = body.issue;
      return await forwardToCEO(
        'GitHub Issue: ' + repo + ' #' + (issue && issue.number),
        (issue && issue.title) + ' - ' + (body.action || 'created')
      );
    default:
      return await forwardToCEO(
        'GitHub Event: ' + event + ' - ' + repo,
        '来自 ' + sender
      );
  }
});

// GitLab Webhook
registerHandler('gitlab', function(headers, body) {
  return headers['x-gitlab-event'] || (body && body.project && body.project.path_with_namespace);
}, async function(headers, body) {
  var event = headers['x-gitlab-event'] || 'Push Hook';
  var proj = body.project ? body.project.path_with_namespace : 'unknown';
  var user = body.user_username || body.user_name || 'unknown';

  if (event === 'Push Hook') {
    var branch = (body.ref || '').replace('refs/heads/', '');
    var count = (body.commits || []).length;
    return await forwardToCEO(
      'GitLab Push: ' + proj + ' [' + branch + ']',
      user + ' 推送了 ' + count + ' 个提交'
    );
  }
  return await forwardToCEO('GitLab Event: ' + proj, event + ' by ' + user);
});

// Docker Hub / Container Registry webhook
registerHandler('docker', function(headers, body) {
  return body && body.callback_url && body.push_data;
}, async function(headers, body) {
  var repo = body.repository ? body.repository.repo_name : 'unknown';
  var tag = body.push_data ? body.push_data.tag : 'latest';
  return await forwardToCEO(
    'Docker Image Push: ' + repo,
    '镜像已更新: ' + tag
  );
});

// 通用 JSON Webhook (兜底)
registerHandler('generic', function(headers, body) {
  return body && typeof body === 'object' && !body.error;
}, async function(headers, body) {
  var summary = '';
  if (body.message) summary = body.message;
  else if (body.text) summary = body.text;
  else if (body.title) summary = body.title;
  else summary = JSON.stringify(body).substring(0, 200);

  return await forwardToCEO('Webhook 收到', summary);
});

// ========== 匹配处理器 ==========
function matchHandler(headers, body) {
  for (var name in HANDLERS) {
    if (name === 'generic') continue; // generic is fallback
    try {
      if (HANDLERS[name].matcher(headers, body)) return HANDLERS[name];
    } catch(e) {}
  }
  // Fallback to generic
  return HANDLERS['generic'] || null;
}

// ========== 请求处理 ==========
function handleRequest(req, res) {
  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', async function() {
    var raw = Buffer.concat(chunks).toString('utf8');
    var body = null;
    try { body = JSON.parse(raw); } catch(e) { body = { raw: raw.substring(0, 500) }; }

    var handler = matchHandler(req.headers, body);
    if (!handler) {
      res.writeHead(400);
      res.end('No matching webhook handler');
      return;
    }

    try {
      log('INFO', 'Webhook 触发: ' + handler.matcher.toString().substring(0, 60));
      await handler.handler(req.headers, body, raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      log('ERROR', 'Webhook 处理失败: ' + e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

// ========== 启动/停止 ==========
function start(callback) {
  if (isRunning) {
    if (callback) callback(null, true);
    return;
  }

  try {
    server = http.createServer(handleRequest);
    server.listen(HOOK_PORT, '0.0.0.0', function() {
      isRunning = true;
      var handlerCount = Object.keys(HANDLERS).length;
      log('INFO', 'Webhook 服务已启动 (port=' + HOOK_PORT + ', handlers=' + handlerCount + ')');
      if (callback) callback(null, true);
    });
    server.on('error', function(e) {
      log('ERROR', '启动失败: ' + e.message);
      isRunning = false;
      if (callback) callback(e);
    });
  } catch(e) {
    log('ERROR', '启动异常: ' + e.message);
    if (callback) callback(e);
  }
}

function stop() {
  if (server) {
    try { server.close(); } catch(e) {}
    server = null;
  }
  isRunning = false;
  log('INFO', 'Webhook 服务已停止');
}

function getStatus() {
  return {
    running: isRunning,
    port: HOOK_PORT,
    handlers: Object.keys(HANDLERS).length,
    handlers_map: Object.keys(HANDLERS)
  };
}

module.exports = { start: start, stop: stop, getStatus: getStatus, registerHandler: registerHandler };
