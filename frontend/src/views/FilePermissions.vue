<template>
  <div class="file-permissions-page">
    <!-- 头部 -->
    <div class="header">
      <h1>📁 文件权限管理中心</h1>
      <div class="actions">
        <button @click="refresh" class="btn-secondary">🔄 刷新</button>
        <button @click="exportAudit" class="btn-secondary">📥 导出审计</button>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <span class="stat-value">{{ roles.length }}</span>
          <span class="stat-label">角色数</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📋</div>
        <div class="stat-info">
          <span class="stat-value">{{ agentOverrides.length }}</span>
          <span class="stat-label">Agent覆盖</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.total || 0 }}</span>
          <span class="stat-label">审计记录</span>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.denied || 0 }}</span>
          <span class="stat-label">拒绝操作</span>
        </div>
      </div>
    </div>

    <!-- 标签页 -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'roles' }" @click="activeTab = 'roles'">
        👥 角色权限
      </button>
      <button :class="{ active: activeTab === 'agents' }" @click="activeTab = 'agents'">
        🤖 Agent覆盖
      </button>
      <button :class="{ active: activeTab === 'audit' }" @click="activeTab = 'audit'">
        📋 审计日志
      </button>
      <button :class="{ active: activeTab === 'tester' }" @click="activeTab = 'tester'">
        🧪 权限测试
      </button>
    </div>

    <!-- 角色权限 -->
    <div v-if="activeTab === 'roles'" class="tab-content">
      <div class="section">
        <h3>角色文件权限配置</h3>
        <div class="roles-grid">
          <div v-for="role in roles" :key="role.role" class="role-card">
            <div class="role-header">
              <span class="role-icon">{{ getRoleIcon(role.role) }}</span>
              <span class="role-name">{{ role.role }}</span>
              <span class="role-desc">{{ role.description }}</span>
            </div>
            <div class="role-permissions">
              <div class="perm-row">
                <span class="perm-label">📖 读取路径:</span>
                <span class="perm-value">{{ formatPaths(role.readPaths) }}</span>
              </div>
              <div class="perm-row">
                <span class="perm-label">✏️ 写入路径:</span>
                <span class="perm-value">{{ formatPaths(role.writePaths) }}</span>
              </div>
              <div class="perm-row">
                <span class="perm-label">📎 允许扩展:</span>
                <span class="perm-value">{{ formatExtensions(role.allowedExtensions) }}</span>
              </div>
              <div class="perm-row">
                <span class="perm-label">📦 文件大小:</span>
                <span class="perm-value">{{ formatSize(role.maxFileSize) }}</span>
              </div>
              <div class="perm-flags">
                <span class="flag" :class="{ allowed: role.canDelete }">
                  {{ role.canDelete ? '✅' : '❌' }} 删除
                </span>
                <span class="flag" :class="{ allowed: role.canCreateDir }">
                  {{ role.canCreateDir ? '✅' : '❌' }} 创建目录
                </span>
                <span class="flag" :class="{ allowed: role.canExecute }">
                  {{ role.canExecute ? '✅' : '❌' }} 执行
                </span>
              </div>
            </div>
            <div class="role-actions">
              <button @click="editRole(role)" class="btn-small">编辑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent覆盖 -->
    <div v-if="activeTab === 'agents'" class="tab-content">
      <div class="section">
        <div class="section-header">
          <h3>🤖 Agent权限覆盖</h3>
          <button @click="showOverrideModal = true" class="btn-primary">+ 添加覆盖</button>
        </div>

        <div v-if="agentOverrides.length === 0" class="empty-state">
          <p>暂无Agent权限覆盖配置</p>
        </div>

        <div v-else class="override-list">
          <div v-for="override in agentOverrides" :key="override.agentId" class="override-card">
            <div class="override-header">
              <span class="agent-icon">{{ getAgentIcon(override.agentId) }}</span>
              <span class="agent-id">{{ override.agentId }}</span>
              <button @click="removeOverride(override.agentId)" class="btn-small btn-danger">移除</button>
            </div>
            <div class="override-details">
              <div v-if="override.readPaths" class="override-row">
                读取: {{ formatPaths(override.readPaths) }}
              </div>
              <div v-if="override.writePaths" class="override-row">
                写入: {{ formatPaths(override.writePaths) }}
              </div>
              <div v-if="override.allowedExtensions" class="override-row">
                扩展: {{ formatExtensions(override.allowedExtensions) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 审计日志 -->
    <div v-if="activeTab === 'audit'" class="tab-content">
      <div class="section">
        <h3>📋 文件操作审计日志</h3>
        
        <!-- 统计 -->
        <div class="audit-stats">
          <div class="audit-stat">
            <span class="label">最近24小时:</span>
            <span class="value">{{ stats.last24h || 0 }}</span>
          </div>
          <div class="audit-stat">
            <span class="label">最近1小时:</span>
            <span class="value">{{ stats.last1h || 0 }}</span>
          </div>
          <div class="audit-stat">
            <span class="label">读取:</span>
            <span class="value">{{ stats.byOperation?.read || 0 }}</span>
          </div>
          <div class="audit-stat">
            <span class="label">写入:</span>
            <span class="value">{{ stats.byOperation?.write || 0 }}</span>
          </div>
          <div class="audit-stat">
            <span class="label">删除:</span>
            <span class="value">{{ stats.byOperation?.delete || 0 }}</span>
          </div>
        </div>

        <!-- 过滤器 -->
        <div class="audit-filters">
          <select v-model="auditFilter.agentId">
            <option value="">全部Agent</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.icon }} {{ agent.name_cn }}
            </option>
          </select>
          <select v-model="auditFilter.operation">
            <option value="">全部操作</option>
            <option value="read">读取</option>
            <option value="write">写入</option>
            <option value="delete">删除</option>
            <option value="execute">执行</option>
          </select>
          <select v-model="auditFilter.allowed">
            <option value="">全部结果</option>
            <option value="true">允许</option>
            <option value="false">拒绝</option>
          </select>
          <button @click="loadAudit" class="btn-secondary">筛选</button>
        </div>

        <!-- 日志列表 -->
        <div class="audit-list">
          <div v-for="(entry, idx) in auditEntries" :key="idx" class="audit-entry" :class="{ denied: !entry.allowed }">
            <span class="audit-time">{{ formatDate(entry.timestamp) }}</span>
            <span class="audit-agent">{{ entry.agentId }}</span>
            <span class="audit-op" :class="entry.operation">{{ getOpIcon(entry.operation) }}</span>
            <span class="audit-path">{{ entry.filePath }}</span>
            <span class="audit-result" :class="{ allowed: entry.allowed }">
              {{ entry.allowed ? '✅' : '❌' }}
            </span>
            <span v-if="entry.reason" class="audit-reason">{{ entry.reason }}</span>
          </div>
          <div v-if="auditEntries.length === 0" class="empty-state">
            <p>暂无审计记录</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 权限测试 -->
    <div v-if="activeTab === 'tester'" class="tab-content">
      <div class="section">
        <h3>🧪 文件权限测试</h3>
        
        <div class="tester-form">
          <div class="form-group">
            <label>选择Agent:</label>
            <select v-model="tester.agentId">
              <option value="">选择Agent</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                {{ agent.icon }} {{ agent.name_cn }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>文件路径:</label>
            <input type="text" v-model="tester.filePath" placeholder="/path/to/file.txt" />
          </div>
          <div class="form-group">
            <label>操作类型:</label>
            <div class="operation-buttons">
              <button :class="{ active: tester.operation === 'read' }" @click="tester.operation = 'read'">
                📖 读取
              </button>
              <button :class="{ active: tester.operation === 'write' }" @click="tester.operation = 'write'">
                ✏️ 写入
              </button>
              <button :class="{ active: tester.operation === 'delete' }" @click="tester.operation = 'delete'">
                🗑️ 删除
              </button>
              <button :class="{ active: tester.operation === 'execute' }" @click="tester.operation = 'execute'">
                ▶️ 执行
              </button>
            </div>
          </div>
          <button @click="testPermission" class="btn-primary">测试权限</button>
        </div>

        <div v-if="testResult" class="test-result" :class="{ allowed: testResult.allowed, denied: !testResult.allowed }">
          <div class="result-header">
            <span class="result-icon">{{ testResult.allowed ? '✅' : '❌' }}</span>
            <span class="result-status">{{ testResult.allowed ? '权限允许' : '权限拒绝' }}</span>
          </div>
          <div class="result-reason">{{ testResult.reason || testResult.error }}</div>
          <div v-if="testResult.permissions" class="result-details">
            <h4>Agent权限详情:</h4>
            <div class="perm-info">
              <div>读取路径: {{ formatPaths(testResult.permissions.readPaths) }}</div>
              <div>写入路径: {{ formatPaths(testResult.permissions.writePaths) }}</div>
              <div>允许扩展: {{ formatExtensions(testResult.permissions.allowedExtensions) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 覆盖模态框 -->
    <div v-if="showOverrideModal" class="modal">
      <div class="modal-content">
        <h3>添加Agent权限覆盖</h3>
        <div class="form-group">
          <label>选择Agent:</label>
          <select v-model="newOverride.agentId">
            <option value="">选择Agent</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.icon }} {{ agent.name_cn }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>读取路径 (逗号分隔):</label>
          <input type="text" v-model="newOverride.readPaths" placeholder="/data, /logs" />
        </div>
        <div class="form-group">
          <label>写入路径 (逗号分隔):</label>
          <input type="text" v-model="newOverride.writePaths" placeholder="/data/output" />
        </div>
        <div class="form-group">
          <label>允许扩展名 (逗号分隔):</label>
          <input type="text" v-model="newOverride.allowedExtensions" placeholder=".js, .json, .txt" />
        </div>
        <div class="form-group">
          <label>最大文件大小 (MB):</label>
          <input type="number" v-model="newOverride.maxFileSizeMB" placeholder="50" />
        </div>
        <div class="modal-actions">
          <button @click="showOverrideModal = false" class="btn-secondary">取消</button>
          <button @click="createOverride" class="btn-primary">保存</button>
        </div>
      </div>
    </div>

    <!-- 编辑角色模态框 -->
    <div v-if="showEditRoleModal" class="modal">
      <div class="modal-content">
        <h3>编辑角色权限 - {{ editingRole?.role }}</h3>
        <div class="form-group">
          <label>读取路径 (逗号分隔):</label>
          <input type="text" v-model="editingRole.readPaths" />
        </div>
        <div class="form-group">
          <label>写入路径 (逗号分隔):</label>
          <input type="text" v-model="editingRole.writePaths" />
        </div>
        <div class="form-group">
          <label>允许扩展名 (逗号分隔):</label>
          <input type="text" v-model="editingRole.allowedExtensions" />
        </div>
        <div class="modal-actions">
          <button @click="showEditRoleModal = false" class="btn-secondary">取消</button>
          <button @click="saveRole" class="btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FilePermissions',
  data() {
    return {
      roles: [],
      agents: [],
      agentOverrides: [],
      auditEntries: [],
      stats: {},
      activeTab: 'roles',
      loading: false,
      showOverrideModal: false,
      showEditRoleModal: false,
      editingRole: null,
      newOverride: {
        agentId: '',
        readPaths: '',
        writePaths: '',
        allowedExtensions: '',
        maxFileSizeMB: null
      },
      auditFilter: {
        agentId: '',
        operation: '',
        allowed: ''
      },
      tester: {
        agentId: '',
        filePath: '',
        operation: 'read'
      },
      testResult: null
    }
  },
  async mounted() {
    await this.loadData()
  },
  methods: {
    async loadData() {
      this.loading = true
      try {
        await Promise.all([
          this.loadRoles(),
          this.loadAgents(),
          this.loadStats()
        ])
      } catch (e) {
        console.error('Failed to load data:', e)
      }
      this.loading = false
    },
    async loadRoles() {
      try {
        const res = await fetch('/api/file-permissions/roles')
        const data = await res.json()
        if (data.success) {
          this.roles = data.roles
        }
        
        // 加载覆盖信息
        const overviewRes = await fetch('/api/file-permissions/overview')
        const overviewData = await overviewRes.json()
        if (overviewData.success) {
          this.agentOverrides = []
          // 从概览获取覆盖数量等信息
        }
      } catch (e) {
        console.error('Failed to load roles:', e)
      }
    },
    async loadAgents() {
      try {
        const res = await fetch('/api/agents')
        var data = await res.json()
        this.agents = data.agents || data
      } catch (e) {
        console.error('Failed to load agents:', e)
      }
    },
    async loadStats() {
      try {
        const res = await fetch('/api/file-permissions/audit/stats')
        const data = await res.json()
        if (data.success) {
          this.stats = data
        }
      } catch (e) {
        console.error('Failed to load stats:', e)
      }
    },
    async loadAudit() {
      try {
        let url = '/api/file-permissions/audit?limit=100'
        if (this.auditFilter.agentId) url += `&agentId=${this.auditFilter.agentId}`
        if (this.auditFilter.operation) url += `&operation=${this.auditFilter.operation}`
        if (this.auditFilter.allowed) url += `&allowed=${this.auditFilter.allowed}`
        
        const res = await fetch(url)
        const data = await res.json()
        if (data.success) {
          this.auditEntries = data.entries
        }
      } catch (e) {
        console.error('Failed to load audit:', e)
      }
    },
    async testPermission() {
      if (!this.tester.agentId || !this.tester.filePath) {
        alert('请选择Agent并输入文件路径')
        return
      }
      
      try {
        const res = await fetch('/api/file-permissions/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: this.tester.agentId,
            agentRole: this.getAgentRole(this.tester.agentId),
            agentCategory: this.getAgentCategory(this.tester.agentId),
            operation: this.tester.operation,
            filePath: this.tester.filePath
          })
        })
        const data = await res.json()
        if (data.success) {
          this.testResult = data
          
          // 获取权限详情
          const permsRes = await fetch(`/api/file-permissions/agent/${this.tester.agentId}`)
          const permsData = await permsRes.json()
          if (permsData.success) {
            this.testResult.permissions = permsData.basePermissions
          }
        }
      } catch (e) {
        console.error('Failed to test permission:', e)
      }
    },
    getAgentRole(agentId) {
      const agent = this.agents.find(a => a.id === agentId)
      return agent?.role || 'staff'
    },
    getAgentCategory(agentId) {
      const agent = this.agents.find(a => a.id === agentId)
      return agent?.category || 'staff'
    },
    async createOverride() {
      if (!this.newOverride.agentId) {
        alert('请选择Agent')
        return
      }
      
      try {
        const override = {}
        if (this.newOverride.readPaths) {
          override.readPaths = this.newOverride.readPaths.split(',').map(p => p.trim())
        }
        if (this.newOverride.writePaths) {
          override.writePaths = this.newOverride.writePaths.split(',').map(p => p.trim())
        }
        if (this.newOverride.allowedExtensions) {
          override.allowedExtensions = this.newOverride.allowedExtensions.split(',').map(e => e.trim())
        }
        if (this.newOverride.maxFileSizeMB) {
          override.maxFileSize = this.newOverride.maxFileSizeMB * 1024 * 1024
        }
        
        const res = await fetch(`/api/file-permissions/agent/${this.newOverride.agentId}/override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(override)
        })
        const data = await res.json()
        if (data.success) {
          this.showOverrideModal = false
          this.newOverride = {
            agentId: '',
            readPaths: '',
            writePaths: '',
            allowedExtensions: '',
            maxFileSizeMB: null
          }
          await this.loadRoles()
          alert('覆盖创建成功')
        }
      } catch (e) {
        console.error('Failed to create override:', e)
      }
    },
    async removeOverride(agentId) {
      if (!confirm('确定要移除这个覆盖吗？')) return
      
      try {
        const res = await fetch(`/api/file-permissions/agent/${agentId}/override`, {
          method: 'DELETE'
        })
        const data = await res.json()
        if (data.success) {
          await this.loadRoles()
          alert('覆盖已移除')
        }
      } catch (e) {
        console.error('Failed to remove override:', e)
      }
    },
    editRole(role) {
      this.editingRole = {
        ...role,
        readPaths: role.readPaths.join(', '),
        writePaths: role.writePaths.join(', '),
        allowedExtensions: role.allowedExtensions.join(', ')
      }
      this.showEditRoleModal = true
    },
    async saveRole() {
      if (!this.editingRole) return
      
      try {
        const permissions = {
          readPaths: this.editingRole.readPaths.split(',').map(p => p.trim()),
          writePaths: this.editingRole.writePaths.split(',').map(p => p.trim()),
          allowedExtensions: this.editingRole.allowedExtensions.split(',').map(e => e.trim())
        }
        
        const res = await fetch(`/api/file-permissions/roles/${this.editingRole.role}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(permissions)
        })
        const data = await res.json()
        if (data.success) {
          this.showEditRoleModal = false
          this.editingRole = null
          await this.loadRoles()
          alert('角色权限已更新')
        }
      } catch (e) {
        console.error('Failed to save role:', e)
      }
    },
    getRoleIcon(role) {
      const icons = {
        ceo: '👑',
        c_suite: '🎩',
        director: '📊',
        senior: '💻',
        staff: '🔧',
        fullstack: '🚀',
        testing: '🧪',
        devops: '⚙️',
        security: '🔒'
      }
      return icons[role] || '👤'
    },
    getAgentIcon(agentId) {
      const agent = this.agents.find(a => a.id === agentId)
      return agent?.icon || '🤖'
    },
    getOpIcon(op) {
      const icons = {
        read: '📖',
        write: '✏️',
        delete: '🗑️',
        execute: '▶️'
      }
      return icons[op] || '📄'
    },
    formatPaths(paths) {
      if (!paths) return '-'
      if (paths.includes('*')) return '所有路径'
      return paths.slice(0, 3).join(', ') + (paths.length > 3 ? '...' : '')
    },
    formatExtensions(exts) {
      if (!exts) return '-'
      if (exts.includes('*')) return '所有扩展名'
      return exts.slice(0, 5).join(', ') + (exts.length > 5 ? '...' : '')
    },
    formatSize(bytes) {
      if (bytes === null || bytes === undefined || bytes === Infinity) return '无限制'
      const units = ['B', 'KB', 'MB', 'GB']
      let i = 0
      while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024
        i++
      }
      return `${bytes.toFixed(1)} ${units[i]}`
    },
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    exportAudit() {
      alert('导出审计日志...')
    },
    async refresh() {
      await this.loadData()
    }
  }
}
</script>

<style scoped>
.file-permissions-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 24px;
  color: var(--text-primary, var(--fg));
}

.actions {
  display: flex;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
}

.stat-icon {
  font-size: 28px;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: bold;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, var(--fg2));
}

.stat-card.warning .stat-icon {
  color: #ff9800;
}

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  padding: 4px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--fg2);
  cursor: pointer;
  font-size: 12px;
  border-radius: 8px;
  transition: all 0.2s;
  white-space: nowrap;
}

.tabs button:hover {
  color: var(--fg);
  background: rgba(255,255,255,0.04);
}

.tabs button.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(78,205,196,0.3);
}

.tab-content {
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  padding: 20px;
}

.section h3 { color: var(--text-primary, var(--fg));
  margin: 0 0 16px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.role-card {
  background: var(--bg-secondary, var(--bg2));
  border-radius: 8px;
  padding: 16px;
}

.role-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.role-icon {
  font-size: 24px;
}

.role-name {
  font-weight: bold;
  font-size: 16px;
}

.role-desc {
  font-size: 12px;
  color: var(--text-secondary, var(--fg2));
}

.role-permissions {
  font-size: 13px;
}

.perm-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.perm-label {
  color: var(--text-secondary, var(--fg2));
  min-width: 80px;
}

.perm-value {
  color: var(--text-primary, var(--fg));
  word-break: break-all;
}

.perm-flags {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.flag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-card, var(--bg2));
}

.flag.allowed {
  color: var(--accent);
}

.role-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.override-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.override-card {
  background: var(--bg-secondary, var(--bg2));
  border-radius: 8px;
  padding: 16px;
}

.override-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.agent-icon {
  font-size: 20px;
}

.agent-id {
  font-weight: bold;
  flex: 1;
}

.override-details {
  font-size: 13px;
  color: var(--text-secondary, var(--fg2));
}

.override-row {
  margin-bottom: 4px;
}

.audit-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-secondary, var(--bg2));
  border-radius: 8px;
}

.audit-stat {
  display: flex;
  gap: 8px;
}

.audit-stat .label {
  color: var(--text-secondary, var(--fg2));
}

.audit-stat .value {
  font-weight: bold;
}

.audit-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.audit-filters select {
  padding: 8px 12px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-radius: 6px;
}

.audit-list {
  max-height: 400px;
  overflow-y: auto;
}

.audit-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary, var(--bg2));
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}

.audit-entry.denied {
  border-left: 3px solid var(--danger, #ef4444);
}

.audit-time {
  color: var(--text-secondary, var(--fg2));
  min-width: 140px;
}

.audit-agent {
  font-weight: bold;
  min-width: 100px;
}

.audit-op {
  min-width: 30px;
}

.audit-path {
  flex: 1;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-result {
  min-width: 30px;
}

.tester-form {
  max-width: 600px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: bold;
  font-size: 14px;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-radius: 6px;
}

.operation-buttons {
  display: flex;
  gap: 8px;
}

.operation-buttons button {
  padding: 10px 16px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  background: var(--bg-secondary, var(--bg2));
  border-radius: 6px;
  cursor: pointer;
}

.operation-buttons button.active {
  background: var(--primary-color, var(--accent));
  color: white;
  border-color: var(--primary-color);
}

.test-result {
  margin-top: 20px;
  padding: 16px;
  border-radius: 8px;
}

.test-result.allowed {
  background: rgba(16,185,129,0.08);
  border: 1px solid var(--accent);
}

.test-result.denied {
  background: rgba(239,68,68,0.08);
  border: 1px solid var(--danger, #ef4444);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-icon {
  font-size: 24px;
}

.result-status {
  font-size: 18px;
  font-weight: bold;
}

.result-reason {
  font-size: 14px;
  color: var(--text-secondary, var(--fg2));
}

.result-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.result-details h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.perm-info {
  font-size: 13px;
  line-height: 1.8;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
}

.modal-content h3 {
  margin: 0 0 20px 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--primary-color, var(--accent));
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.btn-secondary:hover {
  color: #fff;
  border-color: var(--accent);
}

.btn-small {
  padding: 6px 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-small:hover {
  color: #fff;
  border-color: var(--accent);
}

.btn-danger {
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, var(--fg2));
}
</style>
