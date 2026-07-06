/**
 * gateway-bridge.js — eCompany ↔ OpenClaw 轻量桥接
 *
 * 不做 WebSocket 持久连接（eCompany 独立运行，不依赖 OpenClaw 网关）。
 * 仅保留消息转发能力：收到 HTTP 推送时转发给 eCompany CEO。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'gateway-bridge.log');
const ECON_PORT = 8002;

function log(msg) {
  var ts = new Date().toISOString();
  var line = '[' + ts + '] [bridge] ' + msg;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8'); } catch(e) {}
}

/** 转发消息到 eCompany CEO */
function forwardToCEO(message, from) {
  return new Promise(function(resolve) {
    var data = JSON.stringify({
      message: message,
      from: from || '',
      channel: 'bridge'
    });
    var req = http.request({
      hostname: '127.0.0.1', port: ECON_PORT,
      path: '/api/v4/channel/forward',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 60000
    }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve({ ok: res.statusCode < 400 }); });
    });
    req.on('error', function(e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function() { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  start: function() {
    log('=== eCompany 桥接启动（独立模式，不连网关）===');
    log('消息转发端点: http://127.0.0.1:' + ECON_PORT + '/api/v4/channel/forward');
    log('桥接就绪，等待消息推送');
    return { forwardToCEO: forwardToCEO };
  },
  forwardToCEO: forwardToCEO
};
