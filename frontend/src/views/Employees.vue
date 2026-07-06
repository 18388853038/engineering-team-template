<template>
  <div class="page">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">👥 {{ __('employeesTitle') }} ({{ filtered.length }})</h2>
      <div style="display:flex;gap:8px">
        <button v-if="!showScores" class="quick-btn" @click="showScores=true;loadScores()" style="font-size:12px;padding:6px 12px">🏆 {{ __('empScoreRank') }}</button>
        <button v-else class="quick-btn" @click="showScores=false" style="font-size:12px;padding:6px 12px">👥 {{ __('empListView') }}</button>
      </div>
    </div>

    <!-- ====== {{ __('empScoreRank') }}视图 ====== -->
    <div v-if="showScores">
      <div class="settings-section">
        <h3>🏆 {{ __('employeesScoreRanking') }}</h3>
        <p style="font-size:12px;color:var(--fg3);margin-bottom:12px">{{ __('empScoreDesc') }}</p>
        <div v-if="scoresLoading" style="text-align:center;padding:24px;color:var(--fg2)">{{ __('loading') }}</div>
        <table class="dt" v-if="!scoresLoading && scoreList.length>0">
          <thead><tr><th>#</th><th>{{ __('empName') }}</th><th>{{ __('empTitle') }}</th><th>{{ __('empScore') }}</th><th>{{ __('empDone') }}</th><th>{{ __('empTotal') }}</th><th>{{ __('empRate') }}</th><th>{{ __('status') }}</th></tr></thead>
          <tbody>
            <tr v-for="(s,i) in scoreList" :key="s.id" class="score-row" :class="{top3:i<3,first:i===0}" @click="showAgentDetail(s.id)">
              <td>
                <span v-if="i===0" style="font-size:16px">🥇</span>
                <span v-else-if="i===1" style="font-size:16px">🥈</span>
                <span v-else-if="i===2" style="font-size:16px">🥉</span>
                <span v-else>{{ i+1 }}</span>
              </td>
              <td><strong>{{ s.name }}</strong></td>
              <td style="font-size:11px;color:var(--fg3)">{{ s.title || '-' }}</td>
              <td>
                <div class="score-bar-wrap">
                  <div class="score-bar" :style="{width:(s.overall||0)+'%',background:scoreColor((s.overall||0))}"></div>
                  <span class="score-num" :style="{color:scoreColor((s.overall||0))}">{{ (s.overall||0) }}</span>
                </div>
              </td>
              <td>{{ (s.done||0) }}</td>
              <td>{{ (s.total||0) }}</td>
              <td>{{ (s.total||0)>0 ? Math.round((s.done||0)/(s.total||0)*100)+'%' : '-' }}</td>
              <td><span class="status-dot-sm" :class="s.status||'online'"></span></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!scoresLoading && scoreList.length===0" style="text-align:center;padding:24px;color:var(--fg2)">{{ __('employeesNoScoreData') }}</p>
      </div>

      <!-- {{ __('empScore') }}分布 -->
      <div class="settings-section" v-if="scoreList.length">
        <h3>📊 {{ __('employeesScoreDist') }}</h3>
        <div class="dist-chart">
          <div class="dist-bar-wrap">
            <span class="dist-label">S (90-100)</span>
            <div class="dist-bar"><div class="dist-fill" :style="{width:distPct('S')+'%',background:'#22c55e'}"></div></div>
            <span class="dist-num">{{ distCount('S') }}{{ __('employeesPerson') }}</span>
          </div>
          <div class="dist-bar-wrap">
            <span class="dist-label">A (70-89)</span>
            <div class="dist-bar"><div class="dist-fill" :style="{width:distPct('A')+'%',background:'#3b82f6'}"></div></div>
            <span class="dist-num">{{ distCount('A') }}{{ __('employeesPerson') }}</span>
          </div>
          <div class="dist-bar-wrap">
            <span class="dist-label">B (50-69)</span>
            <div class="dist-bar"><div class="dist-fill" :style="{width:distPct('B')+'%',background:'#eab308'}"></div></div>
            <span class="dist-num">{{ distCount('B') }}{{ __('employeesPerson') }}</span>
          </div>
          <div class="dist-bar-wrap">
            <span class="dist-label">C (&lt;50)</span>
            <div class="dist-bar"><div class="dist-fill" :style="{width:distPct('C')+'%',background:'#ef4444'}"></div></div>
            <span class="dist-num">{{ distCount('C') }}{{ __('employeesPerson') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== 员工列表视图 ====== -->
    <template v-if="!showScores">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button v-for="f in filters" :key="f.key" class="quick-btn" :class="{active:activeFilter===f.key}" @click="activeFilter=f.key;detail=null" style="font-size:12px;padding:6px 12px">
          {{ f.label }} <span style="color:var(--fg3)">({{ f.count }})</span>
        </button>
      </div>

      <input v-model="search" :placeholder="__('employeesSearch')" style="width:100%;max-width:400px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:13px;outline:none;margin-bottom:16px">

      <!-- 员工详情 -->
      <div v-if="detail" class="settings-section" style="margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <span style="font-size:48px">{{ detail.icon || '🤖' }}</span>
          <div style="flex:1;min-width:200px">
            <h3 style="font-size:18px;color:#fff">{{ detail.name_cn }}</h3>
            <p style="font-size:13px;color:var(--fg2)">{{ detail.title }}</p>
            <p style="font-size:11px;color:var(--fg3);margin-top:4px;line-height:1.5">{{ detail.description }}</p>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
              <span class="badge">⚡ {{ detail.category }}</span>
              <span class="badge" :class="detail.status==='online'?'status-online':''">{{ detail.status === 'online' ? '🟢 ' + __('online') : '⚫ ' + __('offline') }}</span>
              <span v-if="detail.reports_to" class="badge">📋 {{ __('employeesReportsTo') }}: {{ (agents.find(function(a){return a.id===detail.reports_to})||{}).name_cn || detail.reports_to }}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary" @click="$router.push('/chat?agent='+detail.id)">💬 {{ __('employeesChat') }}</button>
            <button class="btn btn-ghost" @click="detail=null">✕</button>
          </div>
        </div>
        <!-- 技能标签 -->
        <div v-if="detail.skills && detail.skills.length" style="margin-top:12px">
          <div style="font-size:11px;color:var(--fg3);margin-bottom:4px">🛠️ {{ __('employeesSkills') }}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            <span v-for="(s,i) in detail.skills" :key="s" class="skill-tag">
              {{ s }}
              <span v-if="detail.skill_levels && detail.skill_levels[i]" class="skill-lvl" :class="detail.skill_levels[i]">
                {{ lvlLabel(detail.skill_levels[i]) }}
              </span>
            </span>
          </div>
        </div>
        <!-- 技能雷达图 (CSS 星级) -->
        <div v-if="detail.skills && detail.skills.length" style="margin-top:12px;">
          <div style="font-size:11px;color:var(--fg3);margin-bottom:6px">📡 {{ __('employeesRadar') }}</div>
          <div class="radar-grid">
            <div v-for="(s,i) in detail.skills.slice(0,6)" :key="s" class="radar-item">
              <div class="radar-label">{{ s }}</div>
              <div class="radar-stars">
                <span v-for="n in 5" :key="n" class="star" :class="{filled:n <= starLevel(detail,i)}">★</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 员工卡片网格 -->
      <div class="card-grid">
        <div v-for="a in filtered" :key="a.id" class="card" @click="detail=a" :class="{active:detail && detail.id===a.id}">
          <div class="icon">{{ a.icon || '🤖' }}</div>
          <h3>{{ a.name_cn }}</h3>
          <p>{{ a.title }}</p>
          <div><span class="status" :class="a.status||'online'"></span>{{ a.status === 'online' ? __('online') : __('offline') }}</div>
          <div v-if="a.skills"><span v-for="s in a.skills.slice(0,4)" :key="s" class="tag">{{ s }}</span></div>
        </div>
      </div>
      <div v-if="!filtered.length" class="empty-state"><div class="icon">🔍</div><p>{{ __('employeesNoMatch') }}</p></div>
    </template>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      agents: [], search: '', activeFilter: 'all', detail: null,
      filters: [], showScores: false, scoresLoading: false, scoreList: []
    }
  },
  computed: {
    filtered() {
      let result = this.agents
      if (this.activeFilter !== 'all') {
        result = result.filter(a => a.category === this.activeFilter)
      }
      if (this.search) {
        const q = this.search.toLowerCase()
        result = result.filter(a => (a.name_cn||'').toLowerCase().includes(q) || (a.title||'').toLowerCase().includes(q))
      }
      return result
    }
  },
  methods: {
    scoreColor(score) {
      if (score >= 90) return '#22c55e'
      if (score >= 70) return '#3b82f6'
      if (score >= 50) return '#eab308'
      return '#ef4444'
    },
    distCount(tier) {
      if (!this.scoreList.length) return 0
      if (tier === 'S') return this.scoreList.filter(function(s) { return (s.overall||0) >= 90 }).length
      if (tier === 'A') return this.scoreList.filter(function(s) { return (s.overall||0) >= 70 && (s.overall||0) < 90 }).length
      if (tier === 'B') return this.scoreList.filter(function(s) { return (s.overall||0) >= 50 && (s.overall||0) < 70 }).length
      return this.scoreList.filter(function(s) { return (s.overall||0) < 50 }).length
    },
    distPct(tier) {
      const total = this.scoreList.length || 1
      return Math.round(this.distCount(tier) / total * 100)
    },
    starLevel(agent, idx) {
      if (agent.skill_levels && agent.skill_levels[idx]) {
        const map = { beginner: 1, intermediate: 2, advanced: 3, expert: 4, master: 5 }
        return map[agent.skill_levels[idx]] || 3
      }
      return 3
    },
    lvlLabel(lvl) {
      const map = { beginner: '初', intermediate: '中', advanced: '进', expert: '专', master: '大师' }
      return map[lvl] || lvl
    },
    showAgentDetail(id) {
      const a = this.agents.find(function(x) { return x.id === id })
      if (a) { this.showScores = false; this.detail = a }
    },
    async loadScores() {
      this.scoresLoading = true
      try {
        const d = await API.get('/api/agents/scores')
        if (d && d.scores) this.scoreList = d.scores
      } catch(e) {}
      this.scoresLoading = false
    }
  },
  mounted() {
    API.get('/api/agents').then(d => {
      if (!d.agents) return
      this.agents = d.agents
      const catMap = {}
      d.agents.forEach(a => { catMap[a.category] = (catMap[a.category]||0) + 1 })
      this.filters = [
        { key: 'all', label: '全部', count: d.agents.length },
        { key: 'ceo', label: 'CEO', count: catMap.ceo||0 },
        { key: 'c_suite', label: '高管', count: catMap.c_suite||0 },
        { key: 'director', label: '总监', count: catMap.director||0 },
        { key: 'senior', label: '资深', count: catMap.senior||0 },
        { key: 'staff', label: '工程师', count: catMap.staff||0 },
        { key: 'fullstack', label: '全栈', count: catMap.fullstack||0 },
      ].filter(f => f.count > 0)
      // 从 URL 参数自动选择员工
      const agentId = this.$route.query.agent
      if (agentId) { const a = d.agents.find(function(x) { return x.id === agentId }); if (a) this.detail = a }
    })
  }
}
</script>

<style scoped>
/* Score table */
.dt { width: 100%; border-collapse: collapse; font-size: 13px; }
.dt th { text-align: left; padding: 6px 8px; font-size: 11px; color: var(--fg3); border-bottom: 1px solid var(--border); font-weight: 500; }
.dt td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.03); }
.score-row { transition: background 0.1s; cursor: pointer; }
.score-row:hover { background: rgba(255,255,255,0.03); }
.score-row.top3 { background: rgba(255,255,255,0.02); }
.score-row.first { background: rgba(234,179,8,0.04); }

.score-bar-wrap { display: flex; align-items: center; gap: 8px; }
.score-bar { height: 6px; border-radius: 3px; min-width: 20px; max-width: 100px; transition: width 0.3s; }
.score-num { font-weight: 700; font-size: 13px; min-width: 24px; }

.status-dot-sm { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.status-dot-sm.online { background: #22c55e; }
.status-dot-sm.offline { background: #6b7280; }

/* Distribution chart */
.dist-chart { display: flex; flex-direction: column; gap: 8px; }
.dist-bar-wrap { display: flex; align-items: center; gap: 8px; }
.dist-label { font-size: 11px; color: var(--fg2); min-width: 50px; }
.dist-bar { flex: 1; height: 12px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
.dist-fill { height: 100%; border-radius: 6px; transition: width 0.5s; }
.dist-num { font-size: 11px; color: var(--fg2); min-width: 30px; text-align: right; }

/* Skill tags */
.skill-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(78,205,196,0.08);
  color: var(--accent);
}
.skill-lvl {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255,255,255,0.08);
  color: var(--fg2);
}
.skill-lvl.expert { background: rgba(78,205,196,0.2); color: var(--accent); }
.skill-lvl.master { background: rgba(234,179,8,0.2); color: #eab308; }

/* Radar chart (CSS stars) */
.radar-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.radar-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: rgba(255,255,255,0.02); border-radius: 4px; }
.radar-label { font-size: 11px; color: var(--fg); min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.radar-stars { white-space: nowrap; }
.star { font-size: 12px; color: rgba(255,255,255,0.1); }
.star.filled { color: #eab308; }

.active.card { border-color: var(--accent); }
.badge.status-online { background: rgba(34,197,94,0.15); color: #22c55e; }
</style>
