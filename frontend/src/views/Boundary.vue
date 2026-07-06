<template>
  <div class="page">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h2>🔒 {{ __('boundaryTitle') }}</h2>
      <span class="badge" :class="{ 'badge-warn': boundary.stats && boundary.stats.recentViolations > 0 }">
        {{ boundary.stats ? boundary.stats.recentViolations + __('boundaryViolations') : __('loading') }}
      </span>
      <button class="refresh-btn" @click="fetchAll">↻ {{ __('boundaryRefresh') }}</button>
    </div>
    <p class="desc">{{ __('boundaryDesc') }}</p>

    <!-- Global Rate Limits -->
    <div class="settings-section">
      <h3>🌐 {{ __('boundaryGlobalLimits') }}</h3>
      <div class="limits-grid">
        <div class="limit-item">
          <label>{{ __('boundaryPerMinute') }}</label>
          <input type="number" v-model.number="limits.perMinute" class="limit-input" min="1" max="1000" />
          <span class="limit-unit">{{ __('boundaryTimesMinute') }}</span>
        </div>
        <div class="limit-item">
          <label>{{ __('boundaryPerHour') }}</label>
          <input type="number" v-model.number="limits.perHour" class="limit-input" min="1" max="10000" />
          <span class="limit-unit">{{ __('boundaryTimesHour') }}</span>
        </div>
        <div class="limit-item">
          <label>{{ __('boundaryPerDay') }}</label>
          <input type="number" v-model.number="limits.perDay" class="limit-input" min="1" max="100000" />
          <span class="limit-unit">{{ __('boundaryTimesDay') }}</span>
        </div>
        <button class="save-btn" @click="saveLimits">{{ __('boundarySaveLimits') }}</button>
      </div>
    </div>

    <!-- Tool-Level Rate Limits -->
    <div class="settings-section">
      <h3>🔧 {{ __('boundaryToolLimits') }}</h3>
      <div class="tool-limits">
        <div v-for="(limit, tool) in boundary.toolRateLimits || {}" :key="tool" class="tool-limit-row">
          <span class="tool-name">{{ tool }}</span>
          <input type="number" v-model.number="toolLimitsEdit[tool].perMinute" class="limit-input-sm" min="0" />
          <span class="unit">/min</span>
          <input type="number" v-model.number="toolLimitsEdit[tool].perHour" class="limit-input-sm" min="0" />
          <span class="unit">/hr</span>
          <button class="tiny-btn" @click="saveToolLimit(tool)">{{ __('boundarySave') }}</button>
        </div>
      </div>
      <div class="add-tool-row">
        <input v-model="newToolName" :placeholder="__('boundaryToolName')" class="limit-input-sm" />
        <input type="number" v-model.number="newToolMin" placeholder="/min" class="limit-input-sm" min="0" />
        <input type="number" v-model.number="newToolHour" placeholder="/hr" class="limit-input-sm" min="0" />
        <button class="tiny-btn" @click="addToolLimit">{{ __('boundaryAddTool') }}</button>
      </div>
    </div>

    <!-- Agent List -->
    <div class="settings-section">
      <h3>👥 {{ __('boundaryAgentList') }}</h3>
      <table class="dt" v-if="agents.length > 0">
        <thead><tr><th>{{ __('boundaryAgentName') }}</th><th>{{ __('boundaryRole') }}</th><th>{{ __('boundaryCalls') }}</th><th>{{ __('boundaryLimits') }}</th><th>{{ __('boundaryAction') }}</th></tr></thead>
        <tbody>
          <tr v-for="a in agents" :key="a.id">
            <td>{{ a.name_cn || a.name || a.id }}</td>
            <td><span class="role-tag">{{ a.role }}</span></td>
            <td>
              <span :style="{color: (agentStats[a.id] && agentStats[a.id].blocked > 0) ? '#ef4444' : '#22c55e'}">
                {{ agentStats[a.id] ? agentStats[a.id].total + '/' + agentStats[a.id].blocked : '0/0' }}
              </span>
            </td>
            <td>
              <div v-if="agentOverrides[a.id]" style="font-size:10px;color:var(--fg2)">
                <span v-if="agentOverrides[a.id].rateLimits">自定义频控</span>
                <span v-if="agentOverrides[a.id].blockedTools">, {{ agentOverrides[a.id].blockedTools.length }} 禁用工具</span>
              </div>
              <span v-else style="font-size:10px;color:var(--fg3)">{{ __('boundaryUseDefault') }}</span>
            </td>
            <td><button class="tiny-btn" @click="openAgentEditor(a.id)">{{ __('boundaryEdit') }}</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">{{ __('boundaryLoadingAgents') }}</p>
    </div>

    <!-- Agent Editor Modal -->
    <div v-if="editingAgent" class="modal-overlay" @click.self="editingAgent = null">
      <div class="modal">
        <h3>{{ __('boundaryEditTitle') }}: {{ editingAgent }}</h3>
        <div class="modal-body">
          <h4 style="font-size:12px;margin:8px 0">{{ __('boundaryCustomLimits') }}</h4>
          <div class="limits-grid">
            <div><label>{{ __('boundaryPerMinute') }}</label><input type="number" v-model.number="editPerMin" class="limit-input" min="0" :placeholder="__('boundaryGlobal')" /></div>
            <div><label>{{ __('boundaryPerHour') }}</label><input type="number" v-model.number="editPerHour" class="limit-input" min="0" :placeholder="__('boundaryGlobal')" /></div>
            <div><label>{{ __('boundaryPerDay') }}</label><input type="number" v-model.number="editPerDay" class="limit-input" min="0" :placeholder="__('boundaryGlobal')" /></div>
          </div>
          <h4 style="font-size:12px;margin:8px 0">{{ __('boundaryTaskQuota') }}</h4>
          <div class="limits-grid">
            <div><label>{{ __('boundaryMaxTasks') }}</label><input type="number" v-model.number="editMaxTasks" class="limit-input" min="0" :placeholder="__('boundaryUnlimited')" /></div>
            <div><label>{{ __('boundaryDailyTasks') }}</label><input type="number" v-model.number="editDailyTasks" class="limit-input" min="0" :placeholder="__('boundaryUnlimited')" /></div>
          </div>
          <h4 style="font-size:12px;margin:12px 0 4px">{{ __('boundaryBlockedTools') }}</h4>
          <div class="blocked-tools-list">
            <div v-for="t in availableTools" :key="t" class="tool-check-item">
              <label>
                <input type="checkbox" :value="t" v-model="editBlockedTools" />
                {{ t }}
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="tiny-btn" @click="saveAgentOverride()">{{ __('boundarySave') }}</button>
          <button class="tiny-btn" style="background:transparent;color:var(--fg2)" @click="editingAgent = null">{{ __('boundaryCancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Recent Violations -->
    <div class="settings-section" v-if="violations.length">
      <h3>⚠️ {{ __('boundaryRecentViolations') }} ({{ boundary.stats ? boundary.stats.violations : 0 }})</h3>
      <div v-for="v in violations" :key="v.ts" class="violation-row">
        <span class="vio-agent">{{ v.agentName || v.agentId }}</span>
        <span class="vio-tool">{{ v.toolName }}</span>
        <span class="vio-reason">{{ v.reason }}</span>
        <span class="vio-time">{{ formatTime(v.ts) }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'

const ALL_TOOLS = [
  'query_team', 'assign_task', 'list_tasks', 'delegate',
  'system_overview', 'system_config_get', 'system_config_set',
  'system_profile_get', 'system_profile_set', 'system_channels',
  'search_web', 'get_weather', 'system_metrics', 'system_evaluate',
  'system_schedule', 'system_router',
  'read_file', 'write_file'
]

export default {
  data() {
    return {
      agents: [],
      boundary: { rateLimits: { perMinute: 20, perHour: 100, perDay: 500 }, toolRateLimits: {}, agentOverrides: {} },
      limits: { perMinute: 20, perHour: 100, perDay: 500 },
      toolLimitsEdit: {},
      agentOverrides: {},
      agentStats: {},
      violations: [],
      editingAgent: null,
      editPerMin: 0, editPerHour: 0, editPerDay: 0,
      editMaxTasks: 0, editDailyTasks: 0,
      editBlockedTools: [],
      newToolName: '', newToolMin: 0, newToolHour: 0,
      availableTools: ALL_TOOLS
    }
  },
  mounted() {
    Promise.all([API.get('/api/agents'), this.fetchAll()]).then(([d]) => {
      if (d.agents) this.agents = d.agents
    })
  },
  methods: {
    async fetchAll() {
      try {
        const d = await API.get('/api/harness/boundary/status')
        if (d && d.rateLimits) {
          this.boundary = d
          this.limits = { ...d.rateLimits }
          this.agentOverrides = d.agentOverrides || {}
          this.agentStats = d.stats ? d.stats.byAgent || {} : {}
          this.violations = []
          if (d.stats && d.stats.byTool) {
            Object.keys(d.toolRateLimits).forEach(t => {
              this.toolLimitsEdit[t] = { ...d.toolRateLimits[t] }
            })
          }
        }
      } catch(e) {}
    },
    async saveLimits() {
      try {
        const r = await API.post('/api/harness/boundary/limits', { global: this.limits })
        if (r.ok) {
          this.boundary.rateLimits = { ...this.limits }
        }
      } catch(e) {}
    },
    async saveToolLimit(tool) {
      try {
        await API.post('/api/harness/boundary/limits', { toolName: tool, tool: this.toolLimitsEdit[tool] })
      } catch(e) {}
    },
    async addToolLimit() {
      if (!this.newToolName) return
      const limits = { perMinute: this.newToolMin || 5, perHour: this.newToolHour || 30 }
      await API.post('/api/harness/boundary/limits', { toolName: this.newToolName, tool: limits })
      this.boundary.toolRateLimits[this.newToolName] = limits
      this.toolLimitsEdit[this.newToolName] = limits
      this.newToolName = ''; this.newToolMin = 0; this.newToolHour = 0
    },
    openAgentEditor(agentId) {
      this.editingAgent = agentId
      const ov = this.agentOverrides[agentId] || {}
      this.editPerMin = (ov.rateLimits && ov.rateLimits.perMinute) || 0
      this.editPerHour = (ov.rateLimits && ov.rateLimits.perHour) || 0
      this.editPerDay = (ov.rateLimits && ov.rateLimits.perDay) || 0
      this.editMaxTasks = ov.maxTasks || 0
      this.editDailyTasks = ov.dailyTasks || 0
      this.editBlockedTools = ov.blockedTools || []
    },
    async saveAgentOverride() {
      const override = {}
      if (this.editPerMin || this.editPerHour || this.editPerDay) {
        override.rateLimits = {}
        if (this.editPerMin) override.rateLimits.perMinute = this.editPerMin
        if (this.editPerHour) override.rateLimits.perHour = this.editPerHour
        if (this.editPerDay) override.rateLimits.perDay = this.editPerDay
      }
      if (this.editMaxTasks) override.maxTasks = this.editMaxTasks
      if (this.editDailyTasks) override.dailyTasks = this.editDailyTasks
      if (this.editBlockedTools.length > 0) {
        override.blockedTools = this.editBlockedTools
      }
      await API.post('/api/harness/boundary/agent/' + this.editingAgent, override)
      this.agentOverrides[this.editingAgent] = override
      this.editingAgent = null
    },
    formatTime(ts) {
      if (!ts) return '-'
      const d = new Date(ts)
      return d.toLocaleTimeString()
    }
  }
}
</script>

<style scoped>
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--bg2); color: var(--fg2); }
.badge-warn { background: rgba(239,68,68,0.15); color: #ef4444; }
.refresh-btn, .save-btn {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-size: 12px; cursor: pointer;
}
.limits-grid { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; padding: 8px 0; }
.limit-item { display: flex; flex-direction: column; gap: 4px; }
.limit-item label, .limit-input, .limit-unit { font-size: 12px; }
.limit-input {
  width: 80px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg2); color: var(--fg); outline: none;
}
.limit-input-sm {
  width: 60px; padding: 3px 5px; border-radius: 3px; border: 1px solid var(--border);
  background: var(--bg2); color: var(--fg); font-size: 11px; outline: none;
}
.tool-limits { display: flex; flex-direction: column; gap: 4px; }
.tool-limit-row, .add-tool-row {
  display: flex; align-items: center; gap: 6px; padding: 4px 0;
  border-bottom: 1px solid var(--border); font-size: 12px;
}
.tool-name { min-width: 120px; font-family: monospace; font-size: 11px; }
.unit { color: var(--fg3); font-size: 10px; min-width: 24px; }
.tiny-btn {
  padding: 2px 8px; border-radius: 3px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-size: 10px; cursor: pointer;
}
.role-tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: rgba(59,130,246,0.15); color: #3b82f6; }
.violation-row { display: flex; gap: 8px; padding: 4px 0; font-size: 11px; border-bottom: 1px solid var(--border); }
.vio-agent { min-width: 80px; font-weight: 500; }
.vio-tool { min-width: 80px; font-family: monospace; color: var(--fg2); }
.vio-reason { flex: 1; color: #ef4444; }
.vio-time { color: var(--fg3); font-size: 10px; }
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;
}
.modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.blocked-tools-list { display: flex; flex-wrap: wrap; gap: 4px; }
.tool-check-item label { font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 3px; }
.add-tool-row { margin-top: 8px; }
</style>
