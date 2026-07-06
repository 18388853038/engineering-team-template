<template>
  <div class="page">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <h2>📋 {{ __('auditTitle') }}</h2>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select v-model="filter.actor" class="filter-select" @change="fetchLog">
          <option value="">{{ __('auditAllActors') }}</option>
          <option v-for="a in actors" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="filter.action" class="filter-select" @change="fetchLog">
          <option value="">{{ __('auditAllActions') }}</option>
          <option v-for="act in actions" :key="act" :value="act">{{ actionNames[act] || act }}</option>
        </select>
        <input type="date" v-model="filter.since" class="filter-date" @change="fetchLog" :title="__('auditFilterDate')" />
        <button class="refresh-btn" @click="fetchLog">↻ {{ __('auditRefresh') }}</button>
      </div>
    </div>
    <p class="desc">{{ __('auditDesc') }}</p>

    <div class="settings-section" style="margin-top:12px">
      <div v-if="!entries.length" class="empty-state" style="padding:20px">
        <p style="color:var(--fg3);font-size:12px">{{ __('auditNoRecords') }}</p>
      </div>

      <!-- Timeline -->
      <div v-for="(e,i) in entries" :key="e.id" class="timeline-item" :class="{ collapsed: collapsed[e.id] }">
        <div class="timeline-marker" :style="{background: levelColor(e.action)}"></div>
        <div class="timeline-content" @click="toggleCollapse(e.id)">
          <div class="timeline-header">
            <span class="timeline-action" :style="{color: levelColor(e.action)}">{{ actionNames[e.action] || e.action }}</span>
            <span class="timeline-actor">{{ actorsMap[e.actor] || e.actor }}</span>
            <span class="timeline-time">{{ formatTime(e.timestamp) }}</span>
            <span class="timeline-result" :class="e.result||'success'">{{ e.result || 'success' }}</span>
          </div>
          <div v-if="e.target" class="timeline-detail">{{ __('auditTarget') }}: {{ actorsMap[e.target] || e.target }}</div>
          <div v-if="e.detail && e.detail.title" class="timeline-detail">
            {{ __('auditDetail') }}: {{ e.detail.title }}
            <span v-if="e.detail.score">| {{ __('auditScore') }}: {{ e.detail.score }}</span>
            <span v-if="e.detail.status">| {{ __('status') }}: {{ e.detail.status }}</span>
          </div>
          <div v-if="!collapsed[e.id] && e.detail && Object.keys(e.detail).filter(k => k !== 'title' && k !== 'score' && k !== 'status').length > 0" class="timeline-extra">
            <div v-for="(v,k) in e.detail" :key="k" v-if="k !== 'title' && k !== 'score' && k !== 'status'" class="extra-row">
              <span class="extra-key">{{ k }}:</span>
              <span class="extra-val">{{ typeof v === 'object' ? JSON.stringify(v) : v }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalEntries > limit" class="pagination">
        <button :disabled="offset <= 0" @click="prevPage">← {{ __('auditPrevPage') }}</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button :disabled="offset + limit >= totalEntries" @click="nextPage">{{ __('auditNextPage') }} →</button>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'

const ACTION_NAMES = {
  'quality_score': '📊 质量评分',
  'task_completed_and_scored': '✅ 任务完成评分',
  'score_task': '📊 评分',
  'approve_task': '✅ 审批通过',
  'reject_task': '❌ 审批驳回',
  'require_approval': '⏳ 申请审批',
  'quality_report': '📋 质量报告',
  'system_startup': '🟢 系统启动',
  'system_restart': '🔄 系统重启',
  'config_change': '⚙️ 配置变更',
  'channel_test': '🔌 渠道测试',
  'channel_install': '📦 渠道安装',
  'batch_dispatch': '📤 批量分发',
  'agent_message': '💬 员工消息',
  'task_assigned': '📋 任务分配',
  'task_created': '➕ 任务创建',
  'task_completed': '✅ 任务完成',
  'lock_acquired': '🔒 获取锁',
  'lock_released': '🔓 释放锁'
}

const LEVEL_COLORS = {
  'quality_score': '#3b82f6',
  'task_completed_and_scored': '#22c55e',
  'approve_task': '#22c55e',
  'reject_task': '#ef4444',
  'require_approval': '#eab308',
  'config_change': '#a855f7',
  'system_startup': '#22c55e',
  'system_restart': '#eab308',
  'task_completed': '#22c55e',
  'task_created': '#3b82f6',
  'task_assigned': '#6366f1'
}

export default {
  data() {
    return {
      entries: [],
      actors: [],
      actions: Object.keys(ACTION_NAMES),
      actionNames: ACTION_NAMES,
      actorsMap: {},
      totalEntries: 0,
      offset: 0,
      limit: 50,
      collapsed: {},
      filter: { actor: '', action: '', since: '' }
    }
  },
  computed: {
    totalPages() { return Math.ceil(this.totalEntries / this.limit) || 1 },
    currentPage() { return Math.floor(this.offset / this.limit) + 1 }
  },
  mounted() {
    // Load agents map for name resolution
    API.get('/api/agents').then(d => {
      if (d.agents) {
        d.agents.forEach(a => {
          this.actorsMap[a.id] = a.name_cn || a.name || a.id
          if (!this.actors.includes(a.id)) this.actors.push(a.id)
        })
        this.actors.sort()
      }
    }).catch(() => {})
    this.fetchLog()
  },
  methods: {
    async fetchLog() {
      const params = new URLSearchParams()
      if (this.filter.actor) params.set('actor', this.filter.actor)
      if (this.filter.action) params.set('action', this.filter.action)
      if (this.filter.since) params.set('since', this.filter.since)
      params.set('limit', String(this.limit))
      params.set('offset', String(this.offset))
      
      API.get('/api/v4/audit-log?' + params.toString()).then(d => {
        if (d && d.entries) {
          this.entries = d.entries
          // Estimate total from consecutive pages
          if (d.entries.length < this.limit) this.totalEntries = this.offset + d.entries.length
          else this.totalEntries = Math.max(this.totalEntries, this.offset + this.limit + 1)
        } else {
          this.entries = Array.isArray(d) ? d : []
          this.totalEntries = this.entries.length
        }
      }).catch(() => {
        this.entries = []
        this.totalEntries = 0
      })
    },
    prevPage() {
      if (this.offset > 0) {
        this.offset = Math.max(0, this.offset - this.limit)
        this.fetchLog()
      }
    },
    nextPage() {
      if (this.offset + this.limit < this.totalEntries) {
        this.offset += this.limit
        this.fetchLog()
      }
    },
    toggleCollapse(id) {
      this.collapsed[id] = !this.collapsed[id]
      this.$forceUpdate()
    },
    formatTime(ts) {
      if (!ts) return '-'
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    levelColor(action) {
      return LEVEL_COLORS[action] || '#6b7280'
    }
  }
}
</script>

<style scoped>
.filter-select, .filter-date {
  padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg2); color: var(--fg); font-size: 12px; outline: none;
}
.refresh-btn {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-size: 12px; cursor: pointer;
}
.timeline-item {
  display: flex; gap: 10px; padding: 6px 0;
  border-bottom: 1px solid var(--border); cursor: pointer;
  transition: background 0.2s;
}
.timeline-item:hover { background: rgba(255,255,255,0.02); }
.timeline-marker {
  width: 8px; min-width: 8px; height: 8px; border-radius: 50%;
  margin-top: 6px;
}
.timeline-content { flex: 1; min-width: 0; }
.timeline-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 12px;
}
.timeline-action { font-weight: 600; font-size: 12px; }
.timeline-actor { color: var(--fg2); font-size: 11px; }
.timeline-time { color: var(--fg3); font-size: 10px; margin-left: auto; }
.timeline-result {
  font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;
}
.timeline-result.success { background: rgba(34,197,94,0.15); color: #22c55e; }
.timeline-result.failure { background: rgba(239,68,68,0.15); color: #ef4444; }
.timeline-detail { font-size: 11px; color: var(--fg2); margin-top: 2px; }
.timeline-extra { font-size: 10px; color: var(--fg3); margin-top: 2px; padding: 4px 0; }
.extra-row { margin: 1px 0; }
.extra-key { color: var(--fg2); margin-right: 4px; }
.extra-val { color: var(--fg); }
.pagination {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 16px 0; font-size: 12px;
}
.pagination button {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg2); color: var(--fg); cursor: pointer; font-size: 12px;
}
.pagination button:disabled { opacity: 0.4; cursor: default; }
.page-info { color: var(--fg2); font-size: 11px; }
</style>
