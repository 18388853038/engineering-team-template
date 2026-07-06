/**
 * mcp-tools-bridge.js — MCP 工具 → eCompany DeepSeek 工具桥接
 * 
 * 将 MCP 协议的工具自动注册到 eCompany 的 tools-registry，
 * 让 AI Agent 能像调用本地工具一样调用 MCP 工具。
 */

var mcpManager;

function getMCPManager() {
  if (!mcpManager) {
    try { mcpManager = require('./mcp-manager'); } catch(e) {
      try { mcpManager = require('./mcp-manager'); } catch(e2) {
        return null;
      }
    }
  }
  return mcpManager;
}

/**
 * 获取所有 MCP 工具并转换为 eCompany 工具格式
 */
function getMCPTools() {
  var mgr = getMCPManager();
  if (!mgr) return [];
  
  var tools = [];
  try {
    var registeredTools = mgr.getRegisteredTools ? mgr.getRegisteredTools() : (mgr.availableTools || []);
    
    (registeredTools || []).forEach(function(tool) {
      // MCP tool format: { name, description, inputSchema }
      // Convert to DeepSeek format
      var parameters = { type: 'object', properties: {}, required: [] };
      
      if (tool.inputSchema) {
        parameters = {
          type: 'object',
          properties: tool.inputSchema.properties || {},
          required: tool.inputSchema.required || []
        };
      }
      
      tools.push({
        id: 'mcp_' + (tool.name || tool.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_'),
        name: 'mcp_' + (tool.name || tool.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_'),
        description: (tool.description || tool.name || 'MCP tool').substring(0, 500),
        parameters: parameters,
        skills: [],
        permission: 'user',
        handler: async function(args) {
          try {
            var mgr2 = getMCPManager();
            if (!mgr2) return { error: 'MCP manager not available' };
            if (mgr2.executeTool) {
              return await mgr2.executeTool(tool.name, args);
            }
            return { error: 'MCP executeTool not available' };
          } catch(e) {
            return { error: e.message };
          }
        }
      });
    });
  } catch(e) {
    console.error('[MCP-Bridge] Error getting tools:', e.message);
  }
  
  return tools;
}

/**
 * 获取状态
 */
function getStats() {
  var mgr = getMCPManager();
  if (!mgr) return { available: false, servers: 0, tools: 0 };
  
  try {
    var servers = mgr.getStatus ? mgr.getStatus() : {};
    var tools = getMCPTools();
    return {
      available: true,
      servers: Object.keys(servers).length,
      runningServers: Object.values(servers).filter(function(s) { return s.running; }).length,
      tools: tools.length
    };
  } catch(e) {
    return { available: true, error: e.message };
  }
}

module.exports = {
  getMCPTools: getMCPTools,
  getStats: getStats
};
