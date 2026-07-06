<template>
  <div class="page">
    <h2>❤️ {{ __('healthTitle') }}</h2>
    <p class="desc">{{ __('healthDesc') }}</p>

    <div class="stats-row">
      <div class="stat-card"><div class="num">{{ health.ok ? '✅' : '❌' }}</div><div class="label">{{ __('healthServer') }}</div></div>
      <div class="stat-card"><div class="num">{{ health.uptime ? formatUptime(health.uptime) : '-' }}</div><div class="label">{{ __('healthUptime') }}</div></div>
      <div class="stat-card"><div class="num">{{ health.version || '-' }}</div><div class="label">{{ __('healthVersion') }}</div></div>
      <div class="stat-card"><div class="num">{{ traffic.total || 0 }}</div><div class="label">{{ __('healthTodayRequests') }}</div></div>
    </div>

    <!-- {{ __("healthLicense") }} -->
    <div class="settings-section">
      <h3>🔑 {{ __('healthLicenseStatus') }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">{{ __('healthCurrentTier') }}</div>
          <div class="val" :style="{color:license.tier==='professional'?'#a855f7':license.tier==='enterprise'?'#f59e0b':'#22c55e',fontWeight:700}">{{ licenseTierLabel(license.tier) }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('status') }}</div>
          <div class="val" :style="{color:license.valid?'#22c55e':'#ef4444'}">{{ license.valid ? '✅ ' + __('healthValid') : '❌ ' + __('healthInvalid') }}</div>
        </div>
        <div class="health-item" v-if="license.message">
          <div class="lbl">{{ __('healthMessage') }}</div>
          <div class="val" style="font-size:11px;color:var(--fg2)">{{ license.message }}</div>
        </div>
      </div>
    </div>

    <!-- {{ __("healthTraffic") }} -->
    <div class="settings-section">
      <h3>🤖 {{ __('healthTrafficTitle') }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">{{ __('healthApiTotal') }}</div>
          <div class="val">{{ traffic.total || 0 }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthSuccess') }}</div>
          <div class="val" style="color:#22c55e">{{ traffic.success || 0 }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthFailed') }}</div>
          <div class="val" style="color:#ef4444">{{ traffic.failed || 0 }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthInputTokens') }}</div>
          <div class="val">{{ traffic.inputTokens || 'N/A' }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthOutputTokens') }}</div>
          <div class="val">{{ traffic.outputTokens || 'N/A' }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthCost') }}</div>
          <div class="val" style="color:#eab308">${{ traffic.cost || '0.00' }}</div>
        </div>
      </div>
    </div>

    <!-- {{ __("healthResources") }} -->
    <div class="settings-section">
      <h3>💻 {{ __('healthSystemResources') }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">Node.js {{ __('healthVersion') }}</div>
          <div class="val" style="font-size:14px">{{ sysInfo.node || 'N/A' }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthMemoryUsage') }}</div>
          <div class="val" style="font-size:14px">{{ sysInfo.memory || 'N/A' }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthApiRate') }}</div>
          <div class="val" style="font-size:14px">{{ traffic.requestsPerMin || 0 }} {{ __('healthPerMin') }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthAgentCount') }}</div>
          <div class="val">{{ agentCount }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthTaskCount') }}</div>
          <div class="val">{{ taskCount }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('healthSuccessRate') }}</div>
          <div class="val" :style="{color:successRate>=95?'#22c55e':successRate>=80?'#eab308':'#ef4444'}">{{ successRate }}%</div>
        </div>
      </div>
    </div>

    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" @click="refresh">🔄 {{ __('healthRefresh') }}</button>
      <button class="btn btn-ghost" @click="refresh">{{ __('healthDeepCheck') }}</button>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      health: {}, agentCount: 0, taskCount: 0, activeSessions: 0, apiOk: false,
      traffic: { total: 0, success: 0, failed: 0, inputTokens: 0, outputTokens: 0, cost: '0.00', requestsPerMin: 0 },
      sysInfo: { node: '', memory: '', cpu: '' },
      license: { valid: false, tier: 'community', message: '' },
      successRate: 100
    }
  },
  methods: {
    formatUptime(seconds) {
      if (!seconds) return '-'
      const s = Math.floor(seconds)
      if (s > 86400) return Math.floor(s/86400) + '天 ' + Math.floor((s%86400)/3600) + '小时'
      if (s > 3600) return Math.floor(s/3600) + '小时 ' + Math.floor((s%3600)/60) + '分'
      if (s > 60) return Math.floor(s/60) + '分钟'
      return s + '秒'
    },
    licenseTierLabel(tier) {
      const map = { professional:'专业版', enterprise:'企业版', community:'社区版', ultimate:'旗舰版' }
      return map[tier] || tier || '社区版'
    },
    async refresh() {
      // 健康检查
      const h = await API.get('/api/health').catch(() => ({}))
      this.health = h
      // 提取系统信息
      if (h.node) this.sysInfo.node = h.node
      if (h.memory) this.sysInfo.memory = h.memory

      // 流量数据
      const t = await API.get('/api/v4/traffic').catch(() => ({}))
      if (t.total !== undefined) {
        this.traffic = t
        const totalReqs = (t.success || 0) + (t.failed || 0)
        this.successRate = totalReqs > 0 ? Math.round((t.success || 0) / totalReqs * 100) : 100
      }

      // 许可证
      const l = await API.post('/api/license/verify', {}).catch(() => ({}))
      if (l && l.valid !== undefined) {
        this.license = l
      }

      // 员工数
      const agents = await API.get('/api/agents').catch(() => ({}))
      if (agents.total) this.agentCount = agents.total
      else if (agents.agents) this.agentCount = agents.agents.length

      // 任务数
      const tasks = await API.get('/api/tasks').catch(() => ({}))
      const taskList = tasks.tasks || tasks || []
      if (Array.isArray(taskList)) this.taskCount = taskList.length
    }
  },
  mounted() { this.refresh() }
}
</script>