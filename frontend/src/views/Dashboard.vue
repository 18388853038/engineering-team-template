<template>
  <div class="page">
    <!-- 公司文化 Banner -->
    <div class="culture-banner">
      <div class="culture-bg"></div>
      <div class="culture-content">
        <div class="culture-icon"><img src="/logo.jpg" class="dashboard-logo" alt="eCompany" /></div>
        <h1>{{ __('dashboardTitle') }}</h1>
        <p class="culture-tagline">"{{ __('dashboardTagline') }}"</p>
        <div class="culture-stats">
          <div class="cstat"><span class="cnum">{{ stats.employees }}</span><span class="clabel">{{ __('dashboardEmployees') }}</span></div>
          <div class="cstat"><span class="cnum">{{ stats.online }}</span><span class="clabel">{{ __('dashboardOnline') }}</span></div>
          <div class="cstat"><span class="cnum">{{ stats.tasks }}</span><span class="clabel">{{ __('dashboardTasks') }}</span></div>
          <div class="cstat"><span class="cnum">{{ stats.done }}</span><span class="clabel">{{ __('dashboardDone') }}</span></div>
        </div>
      </div>
    </div>

    <!-- {{ __("dashboardRealtime") }}{{ __('dashboardStatus') }} -->
    <div class="stats-row">
      <div class="stat-card" style="cursor:default"><div class="num" :style="{color:serverOk?'var(--accent)':'#ef4444'}">{{ serverOk ? '🟢' : '🔴' }}</div><div class="label">{{ serverOk ? __('dashboardServerRunning') : __('dashboardServerError') }}</div></div>
      <div class="stat-card" style="cursor:default"><div class="num">{{ uptime }}</div><div class="label">{{ __('dashboardRunning') }}</div></div>
      <div class="stat-card" style="cursor:default"><div class="num">{{ pendingCount }}</div><div class="label">{{ __('dashboardPending') }}</div></div>
      <div class="stat-card" style="cursor:default" @click="$router.push('/tasks')"><div class="num">{{ stats.done }}</div><div class="label">✅ {{ __('dashboardDone') }}</div></div>
    </div>

    <!-- {{ __('dashboardCeoStatus') }} -->
    <div class="settings-section" v-if="ceoStatus">
      <h3>🤖 {{ __('dashboardCeoStatus') }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">{{ __('dashboardStatus') }}</div>
          <div class="val" :style="{color:ceoStatus.status==='online'?'#22c55e':'#6b7280'}">{{ ceoStatus.status==='online' ? __('dashboardCeoOnline') : __('dashboardCeoOffline') }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('dashboardName') }}</div>
          <div class="val">{{ ceoStatus.name_cn }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('dashboardTitle') }}</div>
          <div class="val" style="font-size:12px">{{ ceoStatus.title }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('dashboardSkills') }}</div>
          <div class="val" style="font-size:11px;color:var(--fg2)">{{ (ceoStatus.skills||[]).join(' · ') }}</div>
        </div>
      </div>
    </div>

    <!-- {{ __('dashboardTraffic') }} -->
    <div class="settings-section" v-if="traffic.total !== undefined">
      <h3>📊 {{ __('dashboardTraffic') }}</h3>
      <div class="health-grid">
        <div class="health-item"><div class="lbl">{{ __('dashboardTotal') }}</div><div class="val">{{ traffic.total }}</div></div>
        <div class="health-item"><div class="lbl">{{ __('dashboardSuccess') }}</div><div class="val" style="color:#22c55e">{{ traffic.success }}</div></div>
        <div class="health-item"><div class="lbl">{{ __('dashboardFailed') }}</div><div class="val" style="color:#ef4444">{{ traffic.failed }}</div></div>
        <div class="health-item"><div class="lbl">{{ __('dashboardInputTokens') }}</div><div class="val">{{ traffic.inputTokens || 0 }}</div></div>
        <div class="health-item"><div class="lbl">{{ __('dashboardOutputTokens') }}</div><div class="val">{{ traffic.outputTokens || 0 }}</div></div>
        <div class="health-item"><div class="lbl">{{ __('dashboardCost') }}</div><div class="val" style="color:#eab308">${{ traffic.cost || '0.0000' }}</div></div>
      </div>
    </div>

    <!-- {{ __('dashboardChannels') }} -->
    <div class="settings-section" style="margin-top:12px">
      <h3>🔌 {{ __('dashboardChannels') }}</h3>
      <div class="health-grid">
        <div v-for="ch in channelStatus" :key="ch.id" class="health-item">
          <div class="lbl">{{ ch.icon }} {{ ch.name }}</div>
          <div>
            <span v-if="ch.loading" style="color:var(--fg3)">{{ __('channelChecking') }}</span>
            <span v-else :style="{color:ch.connected?'#22c55e':'#ef4444'}" style="font-weight:500">
              {{ ch.connected ? __('channelConnected') : __('channelDisconnected') }}
            </span>
          </div>
          <div style="font-size:11px;color:var(--fg3);margin-top:2px">{{ ch.desc }} <code style='font-size:10px;background:var(--bg2);padding:1px 4px;border-radius:3px'>{{ ch.port }}</code></div>
        </div>
      </div>
    </div>

    <!-- System Health -->
    <div class="settings-section" style="margin-top:12px">
      <h3>🩺 系统自检</h3>
      <div class="health-grid">
        <div class="health-item"><div class="lbl">服务器</div><div class="val" :style="{color:serverOk?'#22c55e':'#ef4444'}">{{ serverOk ? '运行中' : '异常' }}</div></div>
        <div class="health-item"><div class="lbl">已运行</div><div class="val">{{ uptime }}</div></div>
        <div class="health-item"><div class="lbl">AI 员工</div><div class="val">{{ stats.employees }}</div></div>
        <div class="health-item"><div class="lbl">在线</div><div class="val" style="color:#22c55e">{{ stats.online }}</div></div>
        <div class="health-item"><div class="lbl">任务总数</div><div class="val">{{ stats.tasks }}</div></div>
        <div class="health-item"><div class="lbl">已完成</div><div class="val" style="color:#22c55e">{{ stats.done }}</div></div>
        <div class="health-item"><div class="lbl">模型提供商</div><div class="val">14 家</div></div>
        <div class="health-item"><div class="lbl">技能</div><div class="val">22 个</div></div>
      </div>
    </div>

    <!-- {{ __('dashboardCoreValues') }} -->
    <h2>💎 {{ __('dashboardCoreValues') }}</h2>
    <div class="values-row">
      <div class="value-card"><div class="v-icon">🤝</div><h3>{{ __('valueCollaboration') }}</h3><p>41 名 {{ __('dashboardEmployees') }}跨部门{{ __('valueCollaboration') }}，从架构到部署全链路覆盖</p></div>
      <div class="value-card"><div class="v-icon">🧠</div><h3>{{ __('valueIntelligence') }}</h3><p>每个员工都是独立 Agent，具备专业{{ __('dashboardSkills') }}和自主工作能力</p></div>
      <div class="value-card"><div class="v-icon">🔒</div><h3>{{ __('valueSecurity') }}</h3><p>{{ __("dashboard.valuesDesc.security") }}</p></div>
      <div class="value-card"><div class="v-icon">🚀</div><h3>{{ __('valueEfficiency') }}</h3><p>{{ __('dashboardTasks') }}并行分发、{{ __('valueIntelligence') }}匹配、自动验收，7×24 小时运转</p></div>
    </div>

    <!-- {{ __("dashboardCore") }} -->
    <h2>👥 {{ __('dashboardCoreTeam') }}</h2>
    <div class="card-grid">
      <div v-for="a in coreAgents" :key="a.id" class="card" @click="$router.push('/chat?agent='+a.id)">
        <div class="icon">{{ a.icon || '🤖' }}</div>
        <h3>{{ a.name_cn }}</h3>
        <p>{{ a.title }}</p>
        <div><span class="status" :class="a.status||'online'"></span>{{ a.status === 'online' ? __('dashboardOnline') : __('offline') }}</div>
        <div v-if="a.skills"><span v-for="s in a.skills.slice(0,3)" :key="s" class="tag">{{ s }}</span></div>
      </div>
    </div>

    <!-- 最近动态 -->
    <h2>📌 {{ __('dashboardActivities') }}</h2>
    <div v-if="!activities.length" class="empty-state" style="padding:20px"><p style="color:var(--fg3);font-size:12px">{{ __('noActivity') }}</p></div>
    <div v-for="(act,i) in activities" :key="i" class="task-item" style="margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:8px">
        <span>{{ act.icon }}</span>
        <span style="font-size:12px;color:var(--fg)">{{ act.text }}</span>
        <span style="font-size:10px;color:var(--fg3);margin-left:auto">{{ act.time }}</span>
      </div>
    </div>

    <!-- {{ __("dashboardQuickEntry") }} -->
    <h2 style="margin-top:16px">⚡ {{ __('dashboardQuickActions') }}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="quick-btn" @click="$router.push('/chat')">💬 {{ __('dashboardChatStart') }}</button>
      <button class="quick-btn" @click="$router.push('/tasks')">📋 {{ __('dashboardViewTasks') }}</button>
      <button class="quick-btn" @click="$router.push('/employees')">👥 {{ __('dashboardBrowseEmployees') }}</button>
      <button class="quick-btn" @click="$router.push('/settings')">⚙️ {{ __('dashboardSystemSettings') }}</button>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      stats: { employees:0,online:0,tasks:0,done:0 },
      coreAgents: [], serverOk: false, uptime: '-',
      activities: [], ceoStatus: null, pendingCount: 0,
      traffic: {},
      channelStatus: [
        { id:'feishu', name:'飞书', icon:'📘', desc:'消息通知', port:18002, connected:false, loading:true },
        { id:'personal_wx', name:'个人微信', icon:'💬', desc:'扫码绑定', port:18001, connected:false, loading:true },
        { id:'dingtalk', name:'钉钉', icon:'📱', desc:'消息推送', port:18003, connected:false, loading:true },
        { id:'wecom', name:'企业微信', icon:'🏢', desc:'企业通讯', port:18004, connected:false, loading:true },
        { id:'qqbot', name:'QQ 机器人', icon:'🐧', desc:'QQ 群消息', connected:false, loading:true },
      ]
    }
  },
  mounted() {
    API.get('/api/health').then(h => {
      this.serverOk = h.ok
      if (h.uptime) {
        const s = Math.floor(h.uptime)
        this.uptime = s > 86400 ? Math.floor(s/86400)+'天' : s > 3600 ? Math.floor(s/3600)+'小时' : Math.floor(s/60)+'分钟'
      }
    })
    API.get('/api/agents').then(d => {
      if (!d.agents) return
      this.stats.employees = d.total || d.agents.length
      this.stats.online = d.agents.filter(a => a.status === 'online').length
      this.coreAgents = d.agents.filter(a => ['ceo','c_suite','director','senior'].includes(a.category)).slice(0,8)
      const ceo = d.agents.find(a => a.id === 'ai_ceo' || a.role === 'ceo')
      if (ceo) this.ceoStatus = ceo
    })
    API.get('/api/tasks').then(d => {
      const tasks = d.tasks || d || []
      if (Array.isArray(tasks)) {
        this.stats.tasks = tasks.length
        this.stats.done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length
        this.pendingCount = tasks.filter(t => t.status !== 'done' && t.status !== 'completed').length
      }
    })
    // 真实动态
    API.get('/api/activities').then(d => {
      if (d.ok && d.activities) this.activities = d.activities
    }).catch(() => {})
    // 真实流量
    API.get('/api/v4/traffic').then(d => {
      if (d.total !== undefined) this.traffic = d
    }).catch(() => {})
    // 渠道{{ __('dashboardStatus') }}
    API.get('/api/channels').then(d => {
      if (d && d.channels) {
        this.channelStatus.forEach(c => {
          c.connected = !!d.channels[c.id]
          c.loading = false
        })
      }
    }).catch(() => {
      this.channelStatus.forEach(c => { c.loading = false })
    })
  }
}
</script>

<style scoped>
.dashboard-logo{width:36px;height:36px;border-radius:8px;object-fit:cover}
</style>
