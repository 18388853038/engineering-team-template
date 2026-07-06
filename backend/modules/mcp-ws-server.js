/**
 * mcp-ws-server.js — MCP WebSocket 传输支持
 * 
 * 通过 WebSocket 提供 MCP 协议传输层
 * 让远程 MCP 客户端能连接 eCompany 的 MCP 服务端
 * 
 * 端口: 18021 (WS) / 18010 (HTTP)
 */
var http = require('http');
var tools = [];

// 获取所有工具
function loadTools() {
  try {
    var tr = require('./tools-registry');
    tools = tr.ALL_TOOLS || [];
  } catch(e) {}
}

// 处理 MCP JSON-RPC 消息
function handleMCPMessage(msg) {
  try {
    var parsed = JSON.parse(msg);
    var id = parsed.id;
    var method = parsed.method;
    var params = parsed.params || {};
    
    if (method === 'initialize') {
      return JSON.stringify({ jsonrpc: '2.0', id: id, result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'ecompany-mcp-ws', version: '1.0.0' }
      }});
    }
    
    if (method === 'tools/list') {
      loadTools();
      var mcpTools = tools.map(function(t) {
        return { name: t.id || t.name, description: (t.description || '').substring(0, 500), inputSchema: t.parameters || { type: 'object', properties: {} } };
      });
      return JSON.stringify({ jsonrpc: '2.0', id: id, result: { tools: mcpTools } });
    }
    
    if (method === 'tools/call') {
      var toolName = params.name;
      var args = params.arguments || {};
      var tool = tools.find(function(t) { return t.id === toolName || t.name === toolName; });
      if (!tool) {
        return JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Tool not found' } });
      }
      // Async execution - simplified
      tool.handler(args).then(function(result) {
        var response = JSON.stringify({ jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
        if (broadcast) broadcast(response);
      }).catch(function(e) {
        var errorResponse = JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32603, message: e.message } });
        if (broadcast) broadcast(errorResponse);
      });
      return JSON.stringify({ jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: 'executing...' }] } });
    }
    
    return JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Unknown method: ' + method } });
  } catch(e) {
    return JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } });
  }
}

var broadcast = null;

// 启动 WS 服务
function start(callback) {
  try {
    // Simple WS upgrade via HTTP server
    var server = http.createServer(function(req, res) {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        loadTools();
        res.end(JSON.stringify({ ok: true, protocol: 'ws', tools: tools.length }));
        return;
      }
      res.writeHead(404);
      res.end('MCP WS on port 28011');
    });
    
    server.on('upgrade', function(req, socket, head) {
      if (req.url !== '/mcp/ws') {
        socket.destroy();
        return;
      }
      
      var key = req.headers['sec-websocket-key'];
      var accept = require('crypto').createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-5AB9DC11B85B')
        .digest('base64');
      
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      
      broadcast = function(data) {
        try {
          var buf = Buffer.from(data, 'utf8');
          var frame = Buffer.alloc(2 + buf.length);
          frame[0] = 0x81; // FIN + text
          frame[1] = buf.length;
          buf.copy(frame, 2);
          socket.write(frame);
        } catch(e) {}
      };
      
      socket.on('data', function(data) {
        if (data.length < 2) return;
        var opcode = data[0] & 0x0F;
        if (opcode === 0x08) { socket.end(); return; } // Close
        if (opcode !== 0x01) return; // Not text
        
        var mask = data[1] & 0x80;
        var len = data[1] & 0x7F;
        var offset = 2;
        if (len === 126) { len = data.readUInt16BE(2); offset = 4; }
        else if (len === 127) { len = data.readUInt32BE(2); offset = 6; }
        
        var maskKey = mask ? data.slice(offset, offset + 4) : null;
        offset += mask ? 4 : 0;
        var payload = data.slice(offset, offset + len);
        
        if (maskKey) {
          for (var i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
        }
        
        var msg = payload.toString('utf8');
        var response = handleMCPMessage(msg);
        if (response) broadcast(response);
      });
      
      socket.on('close', function() {
        console.log('[MCP-WS] Client disconnected');
        broadcast = null;
      });
      
      console.log('[MCP-WS] Client connected');
      broadcast(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }));
    });
    
    server.listen(28011, '127.0.0.1', function() {
      loadTools();
      console.log('[MCP-WS] WebSocket MCP server on ws://127.0.0.1:28011/mcp/ws (' + tools.length + ' tools)');
      if (callback) callback(null, true);
    });
    
    server.on('error', function(e) {
      console.error('[MCP-WS] Error:', e.message);
      if (callback) callback(e);
    });
  } catch(e) {
    console.error('[MCP-WS] Start failed:', e.message);
    if (callback) callback(e);
  }
}

module.exports = { start: start };
