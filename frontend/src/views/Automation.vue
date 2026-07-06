<template>
  <div class="page">
    <h2>⚡ {{ __('automationTitle') }}</h2>
    <p class="desc">{{ __('automationDesc') }}</p>

    <!-- 新建/{{ __("automationForm") }} -->
    <div class="settings-section">
      <h3>{{ editing ? __('editTaskForm') : __('tasksNew') }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>{{ __('automationTaskName') }}</label>
          <input v-model="form.name" class="input" placeholder="例: 每日早报推送" />
        </div>
        <div class="form-field">
          <label>调度周期</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input v-model="form.schedule" class="input" style="flex:1" placeholder="every 30m / daily 08:00" />
            <select v-model="schedulePreset" style="padding:6px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:11px;outline:none" @change="applyPreset">
              <option value="">快捷预设</option>
              <option value="every 5m">每 5 分钟</option>
              <option value="every 30m">每 30 分钟</option>
              <option value="every 1h">每小时</option>
              <option value="every 6h">每 6 小时</option>
              <option value="daily 08:00">每天 08:00</option>
              <option value="daily 20:00">每天 20:00</option>
              <option value="weekly 1 09:00">每周一 09:00</option>
            </select>
          </div>
          <div style="font-size:10px;color:var(--fg3);margin-top:2px">格式: every Nm/Nh 或 daily HH:MM 或 weekly D HH:MM</div>
        </div>
        <div class="form-field">
          <label>操作类型</label>
          <select v-model="form.action" class="input" style="max-width:200px">
            <option value="">-- 请选择 --</option>
            <option value="report">📊 生成日报</option>
            <option value="heartbeat">💓 心跳检测</option>
            <option value="cleanup">🧹 数据清理</option>
            <option value="sync">🔄 数据同步</option>
            <option value="custom">🔧 自定义</option>
          </select>
        </div>
        <div class="form-field">
          <label>描述说明</label>
          <input v-model="form.description" class="input" placeholder="任务说明" />
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" @click="saveTask">{{ editing ? '保存修改' : '➕ 创建任务' }}</button>
        <button v-if="editing" class="btn btn-ghost" @click="cancelEdit">取消</button>
      </div>
    </div>

    <!-- {{ __("automationJob") }} -->
    <div class="settings-section">
      <h3>📋 {{ __("automationJob") }} <span style="font-size:12px;color:var(--fg3);font-weight:400">({{ tasks.length }} 个)</span></h3>
      <div v-if="tasks.length === 0" class="empty-state">
        <div class="icon">⏰</div>
        <p style="color:var(--fg3)">暂无{{ __("automationJob") }}，在上面创建第一个</p>
      </div>
      <div v-for="t in tasks" :key="t.id" class="cron-task">
        <div class="task-header">
          <span class="status-dot" :class="t.enabled !== false ? 'running' : 'paused'" @click="toggleTask(t)"></span>
          <div class="task-info">
            <div class="task-name">{{ t.name }}</div>
            <div class="task-meta">
              <span>{{ t.schedule || t.interval }}</span>
              <span class="task-action">{{ t.action || '自定义' }}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="file-btn" @click="triggerTask(t)" title="立即执行">▶️</button>
            <button class="file-btn" @click="editTask(t)" :title="__('automationEdit')">✏️</button>
            <button class="file-btn" @click="deleteTask(t)" title="删除">🗑️</button>
          </div>
        </div>
        <div v-if="t.description" class="task-desc">{{ t.description }}</div>
        <div class="task-footer">
          <span :style="{color:t.enabled !== false ? '#22c55e' : '#6b7280'}">{{ t.enabled !== false ? '● 运行中' : '○ 已暂停' }}</span>
          <span v-if="t.lastRun" style="margin-left:12px">{{ __('automationLastRun') }}: {{ t.lastRun }}</span>
          <span v-if="t.nextRun" style="margin-left:12px">{{ __('automationNextRun') }}: {{ t.nextRun }}</span>
        </div>
      </div>
    </div>

    <!-- {{ __("automationBeat") }} -->
    <div class="settings-section">
      <h3>💓 {{ __("automationBeat") }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">状态</div>
          <div class="val" :style="{color:heartbeat.enabled?'#22c55e':'#6b7280'}">{{ heartbeat.enabled ? '● 运行中' : '○ 已停止' }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">上次心跳</div>
          <div class="val" style="font-size:14px;color:var(--fg)">{{ heartbeat.lastBeat || '-' }}</div>
        </div>
        <div class="health-item" v-if="heartbeat.enabled">
          <div class="lbl">内存占用</div>
          <div class="val" style="font-size:14px;color:var(--fg)">{{ heartbeat.memory || '-' }}</div>
        </div>
        <div class="health-item" v-if="heartbeat.enabled">
          <div class="lbl">频率</div>
          <div class="val" style="font-size:14px;color:var(--fg)">{{ heartbeat.interval || '30分钟' }}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="save-btn" @click="toggleHeartbeat">{{ heartbeat.enabled ? '⏹ 停止守护' : '▶️ 启动守护' }}</button>
        <span v-if="heartbeat.enabled" style="font-size:11px;color:var(--fg3);display:flex;align-items:center">
          频率: <input v-model="heartbeatInterval" style="width:50px;padding:3px 6px;margin:0 4px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:11px;outline:none;text-align:center" /> 分钟
          <button class="btn btn-ghost" style="padding:2px 6px;font-size:10px;margin-left:4px" @click="updateHeartbeatInterval">更新</button>
        </span>
      </div>
    </div>

    <!-- {{ __("automationSchedule") }} -->
    <div class="settings-section">
      <h3>📅 今日运行概览</h3>
      <div style="font-size:12px;color:var(--fg2);line-height:2">
        <div v-if="todayRuns.length === 0" style="padding:12px 0;color:var(--fg3)">今天还没有任务执行记录</div>
        <div v-for="(r, i) in todayRuns" :key="i" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          <span style="color:var(--fg3);min-width:50px">{{ r.time }}</span>
          <span>{{ r.name }}</span>
          <span :style="{color: r.ok ? '#22c55e' : '#ef4444'}">{{ r.ok ? '✅' : '❌' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() { return {
    tasks: [],
    heartbeat: { enabled: true, lastBeat: '-', memory: '-', interval: '30分钟' },
    heartbeatInterval: 30,
    editing: false,
    editingId: null,
    schedulePreset: '',
    form: { name: '', schedule: '', action: '', description: '' },
    todayRuns: []
  }},
  mounted() { this.loadTasks(); this.loadHeartbeat(); this.loadTodayRuns() },
  methods: {
    applyPreset() {
      if (this.schedulePreset) this.form.schedule = this.schedulePreset
    },
    async loadTasks() {
      try {
        const d = await API.get('/api/cron/jobs')
        this.tasks = d.jobs || d.tasks || d || []
      } catch(e) { this.tasks = [] }
    },
    async loadTodayRuns() {
      try {
        const d = await API.get('/api/v4/activities')
        if (d && d.activities) {
          const today = new Date().toDateString()
          this.todayRuns = d.activities
            .filter(function(a) { return a.time && new Date(a.time).toDateString() === today })
            .slice(-20)
            .map(function(a) { return { time: new Date(a.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}), name: a.title || a.action || a.name || '活动', ok: a.ok !== false } })
        }
      } catch(e) {}
    },
    saveTask() {
      if (!this.form.name || !this.form.schedule) { alert('请填写任务名称和调度周期'); return }
      const payload = {
        name: this.form.name,
        schedule: this.form.schedule,
        action: this.form.action || 'custom',
        description: this.form.description || this.form.action
      }
      if (this.editing && this.editingId) {
        API.put('/api/cron/jobs/' + this.editingId, payload).then(function(r) {
          if (r && r.job) { alert('任务已更新'); this.cancelEdit(); this.loadTasks() }
          else { alert('更新失败: ' + (r.error || '未知错误')) }
        }.bind(this)).catch(function(e) { alert('更新失败: ' + (e.message || e)) })
      } else {
        API.post('/api/cron/jobs', payload).then(function(r) {
          if (r && r.job) { this.form = { name: '', schedule: '', action: '', description: '' }; this.loadTasks() }
          else { alert('创建失败: ' + (r.error || '未知错误')) }
        }.bind(this)).catch(function(e) { alert('创建失败: ' + (e.message || e)) })
      }
    },
    editTask(t) {
      this.editing = true; this.editingId = t.id
      this.form = { name: t.name || '', schedule: t.schedule || t.interval || '', action: t.action || '', description: t.description || '' }
    },
    cancelEdit() {
      this.editing = false; this.editingId = null
      this.form = { name: '', schedule: '', action: '', description: '' }
    },
    async toggleTask(t) {
      try {
        await API.put('/api/cron/jobs/' + t.id, { enabled: t.enabled === false })
        await this.loadTasks()
      } catch(e) { alert('操作失败: ' + (e.message || e)) }
    },
    async triggerTask(t) {
      try {
        await API.post('/api/cron/jobs/' + t.id + '/trigger', {})
        alert('任务已触发')
        await this.loadTodayRuns()
      } catch(e) { alert('触发失败: ' + (e.message || e)) }
    },
    async deleteTask(t) {
      if (!confirm('确认删除「' + (t.name || t.action) + '」？')) return
      try {
        await API.del('/api/cron/jobs/' + t.id)
        await this.loadTasks()
      } catch(e) { alert('删除失败: ' + (e.message || e)) }
    },
    async loadHeartbeat() {
      try { const d = await API.get('/api/v4/settings/heartbeat'); if(d) { this.heartbeat = d; this.heartbeatInterval = parseInt(d.interval) || 30 } } catch(e) {}
    },
    async toggleHeartbeat() {
      await API.post('/api/v4/settings/heartbeat', { enabled: !this.heartbeat.enabled })
      this.heartbeat.enabled = !this.heartbeat.enabled
    },
    async updateHeartbeatInterval() {
      await API.post('/api/v4/settings/heartbeat', { interval: this.heartbeatInterval })
      alert('心跳间隔已更新为 ' + this.heartbeatInterval + ' 分钟')
    }
  }
}
</script>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-field label {
  font-size: 12px;
  color: var(--fg2);
  font-weight: 500;
}
.form-field .input {
  padding: 7px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.04);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.form-field .input:focus { border-color: var(--accent); }

.cron-task {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.cron-task:last-child { border-bottom: none; }
.task-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}
.status-dot.running { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.4); }
.status-dot.paused { background: #6b7280; }
.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 13px; color: #fff; font-weight: 500; }
.task-meta { font-size: 11px; color: var(--fg2); display: flex; gap: 8px; margin-top: 2px; }
.task-action { padding: 1px 6px; border-radius: 3px; background: rgba(78,205,196,0.1); color: var(--accent); }
.task-actions { display: flex; gap: 2px; opacity: 0.4; transition: opacity 0.15s; }
.cron-task:hover .task-actions { opacity: 1; }
.task-desc { font-size: 11px; color: var(--fg3); margin-top: 4px; }
.task-footer { font-size: 11px; color: var(--fg3); margin-top: 4px; display: flex; flex-wrap: wrap; }
</style>
