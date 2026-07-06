/**
 * mcp-server.js — eCompany MCP 服务器模式
 * 
 * 将 eCompany 的 115 个工具通过 MCP 协议暴露给外部
 * 支持 WebSocket 传输（其他 MCP 客户端可连接）
 * 
 * 端口: 18010
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_PORT = 18010;
var server = null;
var isRunning = false;

// 获取所有工具
function getAllTools() {
  try {
    var tr = require('./tools-registry');
    return tr.ALL_TOOLS || [];
  } catch(e) {
    try {
      var toolsFile = path.join(__dirname, '..', 'mcp-tools.json');
      if (fs.existsSync(toolsFile)) {
        return JSON.parse(fs.readFileSync(toolsFile, 'utf8')).tools || [];
      }
    } catch(e2) {}
    return [];
  }
}

// 构建 MCP 协议响应
function mcpRespond(res, id, result, error) {
  var response = { jsonrpc: '2.0', id: id };
  if (error) response.error = { code: error.code || -32603, message: error.message || 'Internal error' };
  else response.result = result;
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(response));
}

// 处理 MCP 请求
function handleMCPRequest(body, res) {
  var id = body.id;
  var method = body.method;
  var params = body.params || {};
  
  switch (method) {
    case 'initialize':
      mcpRespond(res, id, {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: { name: 'ecompany-mcp', version: '1.0.0' }
      });
      console.log('[MCP-Server] Client initialized');
      break;
      
    case 'tools/list':
      try {
        var tools = getAllTools().map(function(t) {
          return {
            name: t.id || t.name,
            description: (t.description || '').substring(0, 500),
            inputSchema: t.parameters || {
              type: 'object',
              properties: {},
              required: []
            }
          };
        });
        mcpRespond(res, id, { tools: tools });
        console.log('[MCP-Server] Listed ' + tools.length + ' tools');
      } catch(e) {
        mcpRespond(res, id, null, { code: -32603, message: e.message });
      }
      break;
      
    case 'tools/call':
      try {
        var toolName = params.name;
        var args = params.arguments || {};
        var allTools = getAllTools();
        var tool = allTools.find(function(t) { return (t.id === toolName || t.name === toolName); });
        
        if (!tool) {
          mcpRespond(res, id, null, { code: -32601, message: 'Tool not found: ' + toolName });
          return;
        }
        
        // Execute tool asynchronously
        (async function() {
          try {
            var result = await tool.handler(args);
            mcpRespond(res, id, {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            });
            console.log('[MCP-Server] Called tool: ' + toolName);
          } catch(e) {
            mcpRespond(res, id, null, { code: -32603, message: e.message });
          }
        })();
      } catch(e) {
        mcpRespond(res, id, null, { code: -32603, message: e.message });
      }
      break;
      
    case 'resources/list':
      mcpRespond(res, id, { resources: [
        { uri: 'ecompany://status', name: 'System Status', description: 'eCompany 系统状态' },
        { uri: 'ecompany://agents', name: 'Agent List', description: 'AI 员工列表' }
      ]});
      break;
      
    case 'resources/read':
      var uri = params.uri;
      try {
        var content = '';
        if (uri === 'ecompany://status') {
          content = JSON.stringify(require('../../server-modern.js').healthCheck ? {} : { status: 'running' });
        } else if (uri === 'ecompany://agents') {
          content = JSON.stringify(require('../agents.json'));
        }
        mcpRespond(res, id, { contents: [{ uri: uri, text: content }] });
      } catch(e) {
        mcpRespond(res, id, null, { code: -32603, message: e.message });
      }
      break;
      
    case 'prompts/list':
      mcpRespond(res, id, { prompts: [] });
      break;
      
    default:
      mcpRespond(res, id, null, { code: -32601, message: 'Method not found: ' + method });
  }
}

// 创建 HTTP 服务器（用于 MCP 的 SSE/HTTP 传输）
function createMCPServer() {
  return http.createServer(function(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Health check
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'running', port: MCP_PORT, tools: getAllTools().length }));
      return;
    }
    
    // MCP JSON-RPC endpoint
    if (req.url === '/mcp' && req.method === 'POST') {
      var body = '';
      req.on('data', function(c) { body += c; });
      req.on('end', function() {
        try {
          var json = JSON.parse(body);
          handleMCPRequest(json, res);
        } catch(e) {
          mcpRespond(res, null, null, { code: -32700, message: 'Parse error: ' + e.message });
        }
      });
      return;
    }
    
    // 404
    res.writeHead(404);
    res.end('Not Found');
  });
}

// 启动 MCP 服务器
function start(callback) {
  if (isRunning) {
    if (callback) callback(null, true);
    return;
  }
  
  try {
    server = createMCPServer();
    server.listen(MCP_PORT, '127.0.0.1', function() {
      isRunning = true;
      var toolCount = getAllTools().length;
      console.log('[MCP-Server] eCompany MCP Server running on http://127.0.0.1:' + MCP_PORT + ' (' + toolCount + ' tools)');
      if (callback) callback(null, true);
    });
    
    server.on('error', function(e) {
      console.error('[MCP-Server] Error:', e.message);
      isRunning = false;
      if (callback) callback(e);
    });
  } catch(e) {
    console.error('[MCP-Server] Start failed:', e.message);
    if (callback) callback(e);
  }
}

// 停止 MCP 服务器
function stop() {
  if (server) {
    try { server.close(); } catch(e) {}
    server = null;
  }
  isRunning = false;
  console.log('[MCP-Server] Stopped');
}

// 获取状态
function getStatus() {
  return {
    running: isRunning,
    port: MCP_PORT,
    tools: getAllTools().length,
    url: 'http://127.0.0.1:' + MCP_PORT + '/mcp'
  };
}

module.exports = { start, stop, getStatus, isRunning: function() { return isRunning; } };
