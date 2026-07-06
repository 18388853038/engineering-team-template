<template>
  <div class="page">
    <h2>🔌 MCP 协议管理</h2>
    <p class="desc">管理 MCP 工具服务器和服务端模式 — Model Context Protocol 集成</p>

    <!-- MCP Server Status -->
    <div class="card">
      <div class="card-header">
        <span>🖥️ eCompany MCP 服务器端</span>
        <span class="mcp-status" :class="mcpServer.running ? 'online' : 'offline'">
          {{ mcpServer.running ? '运行中' : '已停止' }}
        </span>
      </div>
      <div class="card-body">
        <div class="info-row"><label>状态</label><span>{{ mcpServer.running ? '✅ 运行中' : '⏹️ 已停止' }}</span></div>
        <div class="info-row"><label>端口</label><span>{{ mcpServer.port || 18010 }}</span></div>
        <div class="info-row"><label>可用工具</label><span>{{ mcpServer.tools || 0 }} 个</span></div>
        <div class="info-row"><label>MCP 端点</label><code>{{ mcpServer.url || 'http://127.0.0.1:18010/mcp' }}</code></div>
        <div class="card-actions">
          <button v-if="!mcpServer.running" class="btn btn-primary" @click="startMCPServer">▶ 启动 MCP 服务端</button>
          <button v-if="mcpServer.running" class="btn btn-danger" @click="stopMCPServer">⏹ 停止 MCP 服务端</button>
        </div>
      </div>
    </div>

    <!-- Tool Client Status -->
    <div class="card">
      <div class="card-header">
        <span>🔧 MCP 客户端（已配置的服务器）</span>
      </div>
      <div class="card-body">
        <div class="servers-grid">
          <div v-for="(srv, name) in servers" :key="name" class="server-item">
            <div class="srv-header">
              <span class="srv-name">{{ name }}</span>
              <span class="srv-status" :class="srv.running ? 'online' : 'offline'">
                {{ srv.running ? '运行中' : '已停止' }}
              </span>
            </div>
            <div class="srv-info">{{ srv.description || srv.config?.command }}</div>
            <div class="srv-tools" v-if="srv.toolCount">🔧 {{ srv.toolCount }} 个工具</div>
            <div class="srv-actions">
              <button v-if="!srv.running" class="btn btn-sm btn-primary" @click="startServer(name)">启动</button>
              <button v-if="srv.running" class="btn btn-sm btn-danger" @click="stopServer(name)">停止</button>
            </div>
          </div>
        </div>
        <div v-if="!Object.keys(servers).length" class="empty-state">暂无 MCP 服务器配置</div>
      </div>
    </div>

    <!-- Tools List -->
    <div class="card">
      <div class="card-header">
        <span>📦 所有工具 ({{ tools.length }})</span>
      </div>
      <div class="card-body">
        <input v-model="toolSearch" class="search-input" placeholder="搜索工具..." />
        <div class="tools-grid">
          <div v-for="t in filteredTools" :key="t.id" class="tool-item" :title="t.description">
            <div class="tool-id">
              <span class="tool-prefix" :class="prefixClass(t.id)">{{ prefixLabel(t.id) }}</span>
              {{ t.id }}
            </div>
            <div class="tool-desc">{{ (t.description || '').substring(0, 80) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      mcpServer: { running: false, port: 18010, tools: 0, url: 'http://127.0.0.1:18010/mcp' },
      servers: {},
      tools: [],
      toolSearch: ''
    }
  },
  computed: {
    filteredTools() {
      if (!this.toolSearch) return this.tools
      var q = this.toolSearch.toLowerCase()
      return this.tools.filter(function(t) { return (t.id || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) })
    }
  },
  methods: {
    prefixLabel(id) {
      if (!id) return '?'
      if (id.startsWith('skill_')) return 'SK'
      if (id.startsWith('coding_')) return 'CD'
      if (id.startsWith('mcp_')) return 'MC'
      if (id.startsWith('ecompany_')) return 'BR'
      if (id.startsWith('file_')) return 'FL'
      return '??'
    },
    prefixClass(id) {
      if (!id) return 'prefix-unknown'
      if (id.startsWith('skill_')) return 'prefix-skill'
      if (id.startsWith('coding_')) return 'prefix-coding'
      if (id.startsWith('mcp_')) return 'prefix-mcp'
      if (id.startsWith('ecompany_')) return 'prefix-bridge'
      if (id.startsWith('file_')) return 'prefix-file'
      return 'prefix-unknown'
    },
    load() {
      // Load MCP server status
      API.get('/api/mcp/server/status').then(function(d) { if (d.ok) this.mcpServer = d.status }.bind(this)).catch(function() {})
      // Load MCP client servers
      API.get('/api/mcp/servers').then(function(d) { if (d.ok) this.servers = d.servers }.bind(this)).catch(function() {})
      // Load tools
      API.get('/api/tools/list').then(function(d) { if (d.ok) this.tools = d.tools }.bind(this)).catch(function() {})
    },
    startMCPServer() {
      API.post('/api/mcp/server/start').then(function(d) { if (d.ok) { this.mcpServer = d.status; this.load() } }.bind(this))
    },
    stopMCPServer() {
      API.post('/api/mcp/server/stop').then(function(d) { if (d.ok) { this.load() } }.bind(this))
    },
    startServer(name) {
      API.post('/api/mcp/start', { name: name }).then(function(d) { if (d.ok) this.load() }.bind(this))
    },
    stopServer(name) {
      API.post('/api/mcp/stop', { name: name }).then(function(d) { if (d.ok) this.load() }.bind(this))
    }
  },
  mounted() { this.load() }
}
</script>

<style scoped>
.page { max-width: 1000px; margin: 0 auto; padding: 24px; }
.page h2 { color: #fff; font-size: 20px; margin-bottom: 4px; }
.desc { color: var(--fg2); font-size: 12px; margin-bottom: 20px; }
.card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
.card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 14px; color: #fff; font-weight: 500; }
.card-body { padding: 12px 16px; }
.card-actions { margin-top: 12px; }
.info-row { display: flex; gap: 12px; padding: 4px 0; font-size: 12px; }
.info-row label { color: var(--fg2); min-width: 80px; }
.info-row code { color: var(--accent); background: rgba(78,205,196,0.1); padding: 1px 6px; border-radius: 3px; font-size: 11px; }
.mcp-status { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.mcp-status.online { color: #22c55e; background: rgba(34,197,94,0.15); }
.mcp-status.offline { color: var(--fg3); background: rgba(255,255,255,0.05); }

/* Servers */
.servers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.server-item { border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
.srv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.srv-name { color: #fff; font-size: 13px; font-weight: 500; }
.srv-status { font-size: 10px; padding: 1px 6px; border-radius: 3px; }
.srv-status.online { color: #22c55e; background: rgba(34,197,94,0.15); }
.srv-status.offline { color: var(--fg3); background: rgba(255,255,255,0.05); }
.srv-info { color: var(--fg2); font-size: 11px; }
.srv-tools { color: var(--accent); font-size: 10px; margin-top: 4px; }
.srv-actions { margin-top: 6px; }

/* Tools */
.search-input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--fg); font-size: 12px; outline: none; margin-bottom: 10px; box-sizing: border-box; }
.tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px; max-height: 400px; overflow-y: auto; }
.tool-item { border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; cursor: default; }
.tool-id { color: var(--fg); font-size: 11px; font-family: monospace; display: flex; align-items: center; gap: 4px; }
.tool-desc { color: var(--fg2); font-size: 10px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool-prefix { font-size: 9px; padding: 0 4px; border-radius: 2px; font-weight: 600; }
.prefix-skill { color: #4ecdc4; background: rgba(78,205,196,0.15); }
.prefix-coding { color: #eab308; background: rgba(234,179,8,0.15); }
.prefix-mcp { color: #a78bfa; background: rgba(167,139,250,0.15); }
.prefix-bridge { color: #60a5fa; background: rgba(96,165,250,0.15); }
.prefix-file { color: #34d399; background: rgba(52,211,153,0.15); }
.prefix-unknown { color: var(--fg3); background: rgba(255,255,255,0.05); }
.empty-state { text-align: center; padding: 20px; color: var(--fg3); font-size: 12px; }

/* Buttons */
.btn { cursor: pointer; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 500; }
.btn-primary { background: var(--accent); color: #0f0c29; }
.btn-primary:hover { opacity: 0.9; }
.btn-danger { color: #ef4444; background: rgba(239,68,68,0.15); }
.btn-danger:hover { background: rgba(239,68,68,0.25); }
.btn-sm { padding: 4px 10px; font-size: 11px; }
</style>
