/**
 * unified-engine.js — eCompany 统一 AI 引擎 v2
 *
 * 统一引擎：薄代理层，不做独立思考。
 * 所有渠道消息统一转发到 runCEOCEO（完整CEO引擎），
 * 系统提示、记忆存储、工具调用全部由 runCEOCEO 处理。
 *
 * 消息流:
 *   外部消息 → unifiedEngine.process()
 *            → /api/v4/ai/chat → runCEOCEO（完整prompt+工具+记忆）
 */

const http = require('http');

function log(msg) {
  console.log('[统一引擎] ' + msg);
}

// ========== 消息标准化 ==========
function normalizeMessage(raw, source) {
  return {
    text: raw.message || raw.text || raw.content || '',
    from: raw.from || raw.sender || '',
    source: source || raw.channel || 'unknown',
    raw: raw
  };
}

// ========== 核心处理（薄代理）==========
// 不做自己的系统提示、不记忆、不构建上下文——全交给 runCEOCEO
async function process(msg, options) {
  var text = msg.text || '';
  var source = msg.source || 'unknown';
  if (!text) return '';

  log('转发 [' + source + ']: ' + text.substring(0, 50));

  // 只传用户消息，不加任何系统提示
  // runCEOCEO 会自动补充完整prompt+记忆+工具
  var reply = await callAI([{ role: 'user', content: text }], options);
  return reply || '';
}

async function callAI(messages, options) {
  var body = JSON.stringify({ messages: messages, stream: false });
  return new Promise(function(resolve) {
    var req = http.request({
      hostname: '127.0.0.1', port: 8005,
      path: '/api/v4/ai/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 180000
    }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(d).reply || ''); } catch(e) { resolve(''); }
      });
    });
    req.on('error', function() { resolve(''); });
    req.write(body); req.end();
  });
}

module.exports = {
  process: process,
  normalizeMessage: normalizeMessage
};
