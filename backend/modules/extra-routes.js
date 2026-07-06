/**
 * extra-routes.js - 补充路由（v3.5 补充）
 * 由 server-modern.js 加载
 */
function registerExtraRoutes(registerRoute, parseBody, json) {

  // GET /api/bindings/my - 获取当前用户绑定列表
  registerRoute(['GET'], /^\/api\/bindings\/my$/, function(req, res) {
    try {
      var cb = require('./channel-bindings');
      json(res, { ok: true, bindings: cb.getUserBindings ? cb.getUserBindings() : [] });
    } catch(e) {
      json(res, { ok: false, error: String(e), bindings: [] });
    }
  });

  // GET /api/bindings/channel-types - 获取支持的渠道类型列表
  registerRoute(['GET'], /^\/api\/bindings\/channel-types$/, function(req, res) {
    try {
      var cb = require('./channel-bindings');
      json(res, { ok: true, channelTypes: cb.getChannelTypes ? cb.getChannelTypes() : [] });
    } catch(e) {
      json(res, { ok: false, error: String(e), channelTypes: [] });
    }
  });

  // ====== Harness 渠道消息接收（不会被主文件回滚覆盖）======
  registerRoute(['POST'], /^\/api\/harness\/channel\/message$/, async function(req, res) {
    try {
      var b = await parseBody(req);
      try {
        var ws = require('./ws-server');
        ws.broadcast('channel', { type: 'channel_message', source: b.channel || 'unknown', message: b.message || b.content || '', from: b.from || '', time: Date.now() });
      } catch(e) {}
      json(res, { ok: true });
    } catch(e) { json(res, { ok: false, error: e.message }); }
  });

}

// channel forwarder
module.exports = { registerExtraRoutes };
