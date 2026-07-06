/**
 * mcp-manager.js — MCP 协议集成管理器
 * 
 * 功能：
 * 1. MCP stdio 服务器管理（启动/停止 MCP 工具服务器）
 * 2. MCP 工具注册（将 MCP 工具暴露给 AI Agent）
 * 3. MCP 请求执行（通过 SDK 协议调用 MCP 工具）
 * 
 * 基于 @modelcontextprotocol/sdk@1.29.0
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE = __dirname;
const MCP_SERVERS_DIR = path.join(BASE, '..', 'mcp-servers');
const TOOL_REGISTRY_FILE = path.join(BASE, '..', 'mcp-tools.json');

// MCP 服务器配置（可在 mcp-servers-config.json 中配置）
const DEFAULT_SERVERS = {
  'filesystem': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.env.USERPROFILE || 'C:\\Users\\Administrator'],
    description: '文件系统操作（读取/写入/列出目录）'
  },
  'brave-search': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    description: '网络搜索'
  },
  'github': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    description: 'GitHub 操作（PR/Issue/Repo）'
  }
};

class MCPServerManager {
  constructor() {
    this.servers = {};           // { name: { process, tools, running } }
    this.availableTools = [];    // 所有已注册 MCP 工具列表
    this.requestId = 0;
    
    // 加载已配置的服务器
    this._loadConfig();
    
    // 加载已注册的 MCP 工具（持久化）
    this._loadPersistedTools();
  }
  
  _loadConfig() {
    try {
      const configPath = path.join(BASE, '..', 'mcp-servers-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        for (const [name, cfg] of Object.entries(config)) {
          DEFAULT_SERVERS[name] = cfg;
        }
      }
    } catch(e) {}
  }
  
  _loadPersistedTools() {
    try {
      if (fs.existsSync(TOOL_REGISTRY_FILE)) {
        const data = JSON.parse(fs.readFileSync(TOOL_REGISTRY_FILE, 'utf-8'));
        this.availableTools = data.tools || [];
      }
    } catch(e) {}
  }
  
  _savePersistedTools() {
    try {
      fs.writeFileSync(TOOL_REGISTRY_FILE, JSON.stringify({ tools: this.availableTools, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
    } catch(e) {}
  }
  
  // ========== 服务器生命周期管理 ==========
  
  /**
   * 启动 MCP 服务器
   * @param {string} name 服务器名称
   * @returns {Promise} 启动结果
   */
  async startServer(name) {
    if (this.servers[name]?.running) {
      return { ok: true, message: `Server ${name} already running`, tools: this.servers[name].tools };
    }
    
    const cfg = DEFAULT_SERVERS[name];
    if (!cfg) {
      return { ok: false, error: `Unknown MCP server: ${name}` };
    }
    
    return new Promise((resolve) => {
      try {
        const proc = spawn(cfg.command, cfg.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
        
        let stdout = '';
        let stderr = '';
        let initialized = false;
        let tools = [];
        
        proc.stdout.on('data', (data) => {
          const line = data.toString().trim();
          stdout += line + '\n';
          
          if (!initialized && line.includes('"result"')) {
            // JSON-RPC initialize 响应
            try {
              const msg = JSON.parse(line);
              if (msg.result?.protocolVersion) {
                initialized = true;
                // 发送 initialized 通知
                proc.stdin.write(JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'notifications/initialized',
                  params: {}
                }) + '\n');
              }
            } catch(e) {}
          }
          
          if (initialized && line.includes('"result"')) {
            try {
              const msg = JSON.parse(line);
              if (msg.result?.tools) {
                tools = msg.result.tools;
              }
            } catch(e) {}
          }
        });
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('error', (err) => {
          this.servers[name] = { running: false, process: null, tools: [], error: err.message };
          resolve({ ok: false, error: err.message });
        });
        
        proc.on('exit', (code) => {
          if (this.servers[name]) {
            this.servers[name].running = false;
          }
          resolve({ ok: false, error: `Server exited with code ${code}`, stderr: stderr.substring(0, 500) });
        });
        
        // 超时检测（5秒未启动则失败）
        setTimeout(() => {
          if (!initialized) {
            proc.kill();
            resolve({ ok: false, error: 'Server startup timeout (5s)' });
          }
        }, 5000);
        
        this.servers[name] = { process: proc, tools: [], running: false, config: cfg, initialized: false };
        
        // 发送 initialize 请求
        setTimeout(() => {
          if (!initialized) {
            const initReq = {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                clientInfo: { name: 'ecompany-mcp-manager', version: '1.0.0' }
              }
            };
            proc.stdin.write(JSON.stringify(initReq) + '\n');
          }
        }, 100);
        
        // 轮询等待初始化
        const pollInterval = setInterval(() => {
          if (initialized) {
            clearInterval(pollInterval);
            this.servers[name].running = true;
            this.servers[name].tools = tools;
            
            // 注册工具到全局列表
            this._registerTools(name, tools, cfg.description);
            
            resolve({ ok: true, message: `Server ${name} started`, tools: tools });
          }
        }, 200);
        
      } catch(err) {
        resolve({ ok: false, error: err.message });
      }
    });
  }
  
  /**
   * 停止 MCP 服务器
   */
  stopServer(name) {
    const srv = this.servers[name];
    if (!srv || !srv.running) return { ok: true, message: `${name} not running` };
    
    try { srv.process.kill(); } catch(e) {}
    srv.running = false;
    srv.process = null;
    
    // 从全局工具列表移除该服务器的工具
    this.availableTools = this.availableTools.filter(t => t._mcpServer !== name);
    this._savePersistedTools();
    
    return { ok: true, message: `Server ${name} stopped` };
  }
  
  /**
   * 重启 MCP 服务器
   */
  async restartServer(name) {
    this.stopServer(name);
    await new Promise(r => setTimeout(r, 1000));
    return this.startServer(name);
  }
  
  // ========== 工具注册 ==========
  
  _registerTools(serverName, tools, serverDescription) {
    const registeredTools = (tools || []).map(tool => ({
      ...tool,
      _mcpServer: serverName,
      _serverDescription: serverDescription,
      id: `mcp_${serverName}_${tool.name}`
    }));
    
    // 合并（去重）
    const existingNames = this.availableTools.map(t => t.name);
    for (const t of registeredTools) {
      if (!existingNames.includes(t.name)) {
        this.availableTools.push(t);
      }
    }
    
    this._savePersistedTools();
  }
  
  /**
   * 执行 MCP 工具调用
   */
  async callTool(toolName, arguments_) {
    // 找到工具所属服务器
    const tool = this.availableTools.find(t => t.name === toolName);
    if (!tool) {
      return { ok: false, error: `Tool not found: ${toolName}` };
    }
    
    const srv = this.servers[tool._mcpServer];
    if (!srv?.running) {
      return { ok: false, error: `MCP server ${tool._mcpServer} not running` };
    }
    
    const requestId = ++this.requestId;
    
    return new Promise((resolve) => {
      let result = '';
      let settled = false;
      
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: 'Tool call timeout (30s)', tool: toolName });
        }
      }, 30000);
      
      const onData = (data) => {
        const line = data.toString().trim();
        if (!line) return;
        try {
          const msg = JSON.parse(line);
          if (msg.id === requestId && msg.result !== undefined) {
            settled = true;
            clearTimeout(timeout);
            srv.process.stdout.removeListener('data', onData);
            resolve({ ok: true, result: msg.result });
          }
          if (msg.error) {
            settled = true;
            clearTimeout(timeout);
            srv.process.stdout.removeListener('data', onData);
            resolve({ ok: false, error: msg.error.message || msg.error });
          }
        } catch(e) {}
      };
      
      srv.process.stdout.on('data', onData);
      
      const callReq = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: arguments_ || {}
        }
      };
      
      srv.process.stdin.write(JSON.stringify(callReq) + '\n');
    });
  }
  
  // ========== 工具列表 ==========
  
  /**
   * 获取所有已注册 MCP 工具
   */
  listTools() {
    return this.availableTools.filter(t => {
      const srv = this.servers[t._mcpServer];
      return srv?.running;
    });
  }
  
  /**
   * 获取服务器状态
   */
  getServerStatus() {
    const status = {};
    for (const [name, srv] of Object.entries(this.servers)) {
      status[name] = {
        running: srv.running,
        toolCount: srv.tools?.length || 0,
        config: srv.config ? { command: srv.config.command, args: srv.config.args } : null,
        error: srv.error || null
      };
    }
    return status;
  }
  
  /**
   * 列出所有可启动的服务器定义
   */
  listAvailableServers() {
    const result = {};
    for (const [name, cfg] of Object.entries(DEFAULT_SERVERS)) {
      result[name] = {
        description: cfg.description || '',
        command: cfg.command,
        args: cfg.args,
        running: this.servers[name]?.running || false,
        toolCount: this.servers[name]?.tools?.length || 0
      };
    }
    return result;
  }
}

// 单例导出
var mcpManager = new MCPServerManager();
module.exports = mcpManager;