<template>
  <div class="memory-page">
    <!-- 头部 -->
    <div class="header">
      <h1>🧠 Agent 记忆中心</h1>
      <div class="actions">
        <button @click="refreshAll" class="btn-secondary">🔄 刷新</button>
        <button @click="consolidateAll" class="btn-warning">🔧 整合所有记忆</button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-info">
          <div class="stat-value">{{ totalStats.totalMemories }}</div>
          <div class="stat-label">总记忆数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-info">
          <div class="stat-value">{{ totalStats.importantMemories }}</div>
          <div class="stat-label">重要记忆</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-info">
          <div class="stat-value">{{ agentStats.length }}</div>
          <div class="stat-label">Agent数量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-value">{{ recallCount }}</div>
          <div class="stat-label">召回次数</div>
        </div>
      </div>
    </div>

    <!-- 全局搜索 -->
    <div class="global-search">
      <input
        v-model="globalQuery"
        type="text"
        placeholder="🔍 全局搜索所有Agent的记忆..."
        @keyup.enter="globalSearch"
      />
      <button @click="globalSearch" class="btn-primary">搜索</button>
    </div>

    <!-- 全局搜索结果 -->
    <div v-if="globalResults.length > 0" class="results-section">
      <h3>🌐 全局搜索结果 ({{ globalResults.length }})</h3>
      <div class="memory-list">
        <div v-for="mem in globalResults" :key="mem.id" class="memory-card">
          <div class="memory-header">
            <span class="agent-badge">{{ mem.agent_icon }} {{ mem.agent_name }}</span>
            <span class="importance" :class="'level-' + mem.importance">
              {{ '⭐'.repeat(Math.floor(mem.importance / 3)) }}
            </span>
          </div>
          <div class="memory-content">{{ mem.content }}</div>
          <div class="memory-footer">
            <span class="tags">
              <span v-for="tag in mem.tags" :key="tag" class="tag">{{ tag }}</span>
            </span>
            <span class="date">{{ formatDate(mem.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent选择 -->
    <div class="agent-selector">
      <h3>🤖 选择 Agent</h3>
      <div class="agent-tabs">
        <button
          v-for="agent in agents"
          :key="agent.id"
          :class="{ active: selectedAgent?.id === agent.id }"
          @click="selectAgent(agent)"
        >
          {{ agent.icon }} {{ agent.name_cn }}
        </button>
      </div>
    </div>

    <!-- Agent记忆管理 -->
    <div v-if="selectedAgent" class="agent-memory-section">
      <!-- 记忆统计 -->
      <div class="agent-stats">
        <div class="stat">
          <span class="label">记忆总数:</span>
          <span class="value">{{ currentStats.total_memories || 0 }}</span>
        </div>
        <div class="stat">
          <span class="label">重要记忆:</span>
          <span class="value">{{ currentStats.important_memories || 0 }}</span>
        </div>
        <div class="stat">
          <span class="label">平均重要性:</span>
          <span class="value">{{ (currentStats.avg_importance || 0).toFixed(1) }}</span>
        </div>
        <div class="stat">
          <span class="label">最后整合:</span>
          <span class="value">{{ currentStats.last_consolidation || '从未' }}</span>
        </div>
      </div>

      <!-- 添加记忆 -->
      <div class="add-memory">
        <h4>➕ 添加新记忆</h4>
        <textarea
          v-model="newMemory.content"
          placeholder="输入记忆内容..."
          rows="3"
        ></textarea>
        <div class="memory-options">
          <select v-model="newMemory.type">
            <option value="experience">💡 经验</option>
            <option value="knowledge">📚 知识</option>
            <option value="preference">❤️ 偏好</option>
            <option value="task">📋 任务</option>
            <option value="context">🎯 上下文</option>
          </select>
          <select v-model="newMemory.importance">
            <option :value="3">低重要性</option>
            <option :value="5">中重要性</option>
            <option :value="7">高重要性</option>
            <option :value="9">关键记忆</option>
          </select>
          <input
            v-model="newMemory.tags"
            type="text"
            placeholder="标签（逗号分隔）"
          />
        </div>
        <button @click="addMemory" class="btn-primary">💾 保存记忆</button>
      </div>

      <!-- 记忆搜索 -->
      <div class="memory-search">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="🔍 搜索记忆..."
          @keyup.enter="searchMemories"
        />
        <button @click="searchMemories" class="btn-secondary">搜索</button>
      </div>

      <!-- 召回记忆 -->
      <div class="recall-section">
        <h4>🎯 召回相关记忆</h4>
        <textarea
          v-model="recallQuery"
          placeholder="输入场景描述，AI将召回相关记忆..."
          rows="2"
        ></textarea>
        <button @click="recallMemories" class="btn-primary">🔍 召回</button>
      </div>

      <!-- 记忆列表 -->
      <div class="memory-list">
        <h4>📜 记忆列表</h4>
        <div v-if="memories.length === 0" class="empty">
          暂无记忆，添加第一条吧！
        </div>
        <div v-else>
          <div v-for="mem in memories" :key="mem.id" class="memory-card">
            <div class="memory-header">
              <span class="type-badge" :class="mem.memory_type">
                {{ getTypeLabel(mem.memory_type) }}
              </span>
              <span class="importance" :class="'level-' + mem.importance">
                {{ '⭐'.repeat(Math.floor(mem.importance / 3)) }}
              </span>
              <span class="access-count">访问: {{ mem.access_count }}</span>
            </div>
            <div class="memory-content">{{ mem.content }}</div>
            <div class="memory-context" v-if="mem.context">
              {{ mem.context }}
            </div>
            <div class="memory-footer">
              <span class="tags">
                <span v-for="tag in mem.tags" :key="tag" class="tag">{{ tag }}</span>
              </span>
              <div class="actions">
                <button @click="editMemory(mem)" class="btn-small">✏️</button>
                <button @click="deleteMemory(mem.id)" class="btn-small btn-danger">🗑️</button>
              </div>
            </div>
            <div class="memory-date">
              创建: {{ formatDate(mem.created_at) }} |
              最后访问: {{ formatDate(mem.last_accessed) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      加载中...
    </div>
  </div>
</template>

<script>
export default {
  name: 'MemoryPage',
  data() {
    return {
      agents: [],
      selectedAgent: null,
      agentStats: [],
      memories: [],
      globalResults: [],
      globalQuery: '',
      searchQuery: '',
      recallQuery: '',
      recallCount: 0,
      newMemory: {
        content: '',
        type: 'experience',
        importance: 5,
        tags: ''
      },
      loading: false,
      totalStats: {
        totalMemories: 0,
        importantMemories: 0
      },
      currentStats: {}
    }
  },
  async mounted() {
    await this.loadAgents()
    await this.loadStats()
  },
  methods: {
    async loadAgents() {
      try {
        const res = await fetch('/api/agents')
        var d = await res.json(); this.agents = Array.isArray(d) ? d : (d.agents || [])
      } catch (e) {
        console.error('Failed to load agents:', e)
      }
    },
    async loadStats() {
      try {
        const res = await fetch('/api/memory/stats/all')
        const data = await res.json()
        if (data.success) {
          this.agentStats = data.stats
          this.totalStats = {
            totalMemories: data.stats.reduce((sum, s) => sum + (s.total_memories || 0), 0),
            importantMemories: data.stats.reduce((sum, s) => sum + (s.important_memories || 0), 0)
          }
        }
      } catch (e) {
        console.error('Failed to load stats:', e)
      }
    },
    selectAgent(agent) {
      this.selectedAgent = agent
      this.loadMemories()
      this.loadAgentStats()
    },
    async loadMemories() {
      if (!this.selectedAgent) return
      this.loading = true
      try {
        const res = await fetch(`/api/memory/${this.selectedAgent.id}/memories`)
        const data = await res.json()
        this.memories = data.memories || []
      } catch (e) {
        console.error('Failed to load memories:', e)
      }
      this.loading = false
    },
    async loadAgentStats() {
      if (!this.selectedAgent) return
      try {
        const res = await fetch(`/api/memory/${this.selectedAgent.id}/stats`)
        const data = await res.json()
        this.currentStats = data.stats || {}
      } catch (e) {
        console.error('Failed to load stats:', e)
      }
    },
    async addMemory() {
      if (!this.newMemory.content.trim()) {
        alert('请输入记忆内容')
        return
      }
      try {
        const tags = this.newMemory.tags.split(',').map(t => t.trim()).filter(t => t)
        await fetch(`/api/memory/${this.selectedAgent.id}/memories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: this.newMemory.content,
            type: this.newMemory.type,
            importance: parseInt(this.newMemory.importance),
            tags
          })
        })
        this.newMemory.content = ''
        this.newMemory.tags = ''
        await this.loadMemories()
        await this.loadStats()
      } catch (e) {
        console.error('Failed to add memory:', e)
      }
    },
    async searchMemories() {
      if (!this.searchQuery.trim()) return
      this.loading = true
      try {
        const res = await fetch(`/api/memory/${this.selectedAgent.id}/search?q=${encodeURIComponent(this.searchQuery)}`)
        const data = await res.json()
        this.memories = data.memories || []
      } catch (e) {
        console.error('Failed to search:', e)
      }
      this.loading = false
    },
    async recallMemories() {
      if (!this.recallQuery.trim()) {
        alert('请输入场景描述')
        return
      }
      this.loading = true
      try {
        const res = await fetch(`/api/memory/${this.selectedAgent.id}/recall?q=${encodeURIComponent(this.recallQuery)}`)
        const data = await res.json()
        this.memories = data.memories || []
        this.recallCount++
      } catch (e) {
        console.error('Failed to recall:', e)
      }
      this.loading = false
    },
    async globalSearch() {
      if (!this.globalQuery.trim()) return
      this.loading = true
      try {
        const res = await fetch(`/api/memory/search/global?q=${encodeURIComponent(this.globalQuery)}`)
        const data = await res.json()
        this.globalResults = data.memories || []
      } catch (e) {
        console.error('Failed to global search:', e)
      }
      this.loading = false
    },
    async deleteMemory(memoryId) {
      if (!confirm('确定要删除这条记忆吗？')) return
      try {
        await fetch(`/api/memory/${this.selectedAgent.id}/memories/${memoryId}`, {
          method: 'DELETE'
        })
        await this.loadMemories()
        await this.loadStats()
      } catch (e) {
        console.error('Failed to delete:', e)
      }
    },
    editMemory(mem) {
      // 简化版本：复制内容到输入框
      this.newMemory.content = mem.content
      this.newMemory.type = mem.memory_type
      this.newMemory.importance = mem.importance
      this.newMemory.tags = (mem.tags || []).join(', ')
    },
    async consolidateAll() {
      if (!confirm('确定要整合所有Agent的记忆吗？')) return
      try {
        await fetch('/api/memory/consolidate/all', { method: 'POST' })
        await this.loadStats()
        alert('记忆整合完成！')
      } catch (e) {
        console.error('Failed to consolidate:', e)
      }
    },
    async refreshAll() {
      await this.loadStats()
      if (this.selectedAgent) {
        await this.loadMemories()
        await this.loadAgentStats()
      }
    },
    getTypeLabel(type) {
      const labels = {
        experience: '💡 经验',
        knowledge: '📚 知识',
        preference: '❤️ 偏好',
        task: '📋 任务',
        context: '🎯 上下文'
      }
      return labels[type] || type
    },
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    }
  }
}
</script>

<style scoped>
.memory-page {
  padding: 20px;
  max-width: 1200px;
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
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-primary, var(--fg));
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, var(--fg2));
}

.global-search {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.global-search input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-size: 16px;
}

.agent-selector {
  margin-bottom: 24px;
}

.agent-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.agent-tabs button {
  padding: 8px 16px;
  border: 1px solid var(--border);
  background: var(--bg2);
  color: var(--fg2);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.agent-tabs button:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.agent-tabs button.active {
  background: var(--primary-color, var(--accent));
  color: white;
  border-color: var(--primary-color);
}

.agent-memory-section {
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  padding: 20px;
}

.agent-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--bg-secondary, var(--bg2));
  border-radius: 8px;
}

.stat {
  display: flex;
  gap: 8px;
}

.stat .label {
  color: var(--text-secondary, var(--fg2));
}

.stat .value {
  font-weight: bold;
  color: var(--text-primary, var(--fg));
}

.add-memory, .recall-section {
  margin-bottom: 20px;
}

.add-memory h4, .recall-section h4 {
  margin-bottom: 12px;
  color: var(--text-primary, var(--fg));
}

.add-memory textarea, .recall-section textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-radius: 8px;
  margin-bottom: 8px;
  resize: vertical;
}

.memory-options {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.memory-options select, .memory-options input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-radius: 6px;
}

.memory-search {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.memory-search input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-radius: 6px;
}

.memory-list h4 {
  margin-bottom: 12px;
}

.memory-card {
  background: var(--bg-secondary, var(--bg2));
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.memory-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.type-badge.experience { background: rgba(78,205,196,0.12); color: var(--accent); }
.type-badge.knowledge { background: rgba(16,185,129,0.08); color: #2e7d32; }
.type-badge.preference { background: rgba(239,68,68,0.12); color: var(--danger, #ef4444); }
.type-badge.task { background: rgba(245,158,11,0.12); color: var(--warning, #f59e0b); }
.type-badge.context { background: rgba(78,205,196,0.08); color: var(--accent); }

.importance {
  color: var(--warning, #f59e0b);
}

.access-count {
  color: var(--text-secondary, var(--fg2));
  font-size: 12px;
}

.memory-content {
  color: var(--text-primary, var(--fg));
  line-height: 1.6;
  margin-bottom: 8px;
}

.memory-context {
  color: var(--text-secondary, var(--fg2));
  font-size: 13px;
  font-style: italic;
  padding: 8px;
  background: var(--bg-card, var(--bg2));
  border-radius: 4px;
  margin-bottom: 8px;
}

.memory-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  padding: 2px 8px;
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  font-size: 11px;
  color: var(--text-secondary, var(--fg2));
}

.memory-date {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary, var(--fg2));
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

.btn-warning {
  padding: 10px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-small {
  padding: 4px 8px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  background: var(--bg-card, var(--bg2));
  border-radius: 4px;
  cursor: pointer;
}

.btn-danger {
  color: var(--danger, #ef4444);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, var(--fg2));
}

.empty {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, var(--fg2));
}

.results-section {
  background: var(--bg-card, var(--bg2));
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.results-section h3 {
  margin-bottom: 16px;
}
</style>
