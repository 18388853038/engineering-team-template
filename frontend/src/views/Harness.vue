<template>
  <div class="page">
    <h2>🧠 {{ __('harnessTitle') }}</h2>
    <p class="desc">{{ __('harnessDesc') }}</p>

    <div class="status-bar">
      <span :class="['badge', connected ? 'badge-online' : 'badge-offline']">{{ connected ? __('harnessRealtime') : __('harnessOffline') }}</span>
      <span class="badge badge-info">{{ __('harnessUpdated') }} {{ lastUpdate }}</span>
      <button class="refresh-btn" @click="fetchAll">↻ {{ __('harnessRefresh') }}</button>
    </div>

    <div class="stats-row">
      <div class="stat-card" @click="tab='overview'">
        <div class="num" :style="{color: (health.failRate||0) > 0.1 ? '#ef4444' : '#22c55e'}">{{ (((health.completionRate||0)||0) * 100).toFixed(1) }}%</div>
        <div class="label">{{ __('harnessTaskRate') }}</div>
      </div>
      <div class="stat-card" @click="tab='metrics'">
        <div class="num">{{ (m.totalTokens||0) ? ((m.totalTokens||0) / 1000).toFixed(1) + 'K' : '0' }}</div>
        <div class="label">{{ __('harnessTokenUsage') }}</div>
      </div>
      <div class="stat-card" @click="tab='errors'">
        <div class="num" :style="{color: (m.errorRate||0) > 0.15 ? '#ef4444' : '#22c55e'}">{{ (((m.errorRate||0)||0) * 100).toFixed(1) }}%</div>
        <div class="label">{{ __('harnessErrorRate') }}</div>
      </div>
      <div class="stat-card" @click="tab='retention'">
        <div class="num" style="color:#22c55e">{{ kr.summary.keepRate || '0%' }}</div>
        <div class="label">{{ __('harnessRetention') }}</div>
      </div>
      <div class="stat-card" @click="tab='sink'">
        <div class="num" :style="{color: (errs.openCases||0) > 0 ? '#ef4444' : '#22c55e'}">{{ errs.openCases || 0 }}</div>
        <div class="label">{{ __('harnessPendingCases') }}</div>
      </div>
      <div class="stat-card" @click="tab='alerts'">
        <div class="num" :style="{color: m.activeAlerts && m.activeAlerts.length > 0 ? '#ef4444' : '#6b7280'}">{{ m.activeAlerts ? m.activeAlerts.length : 0 }}</div>
        <div class="label">{{ __('harnessAlerts') }}</div>
      </div>
    </div>

    <div class="tab-nav">
      <button :class="['tab-btn', tab==='overview'&&'active']" @click="tab='overview'">📊 {{ __('harnessTabOverview') }}</button>
      <button :class="['tab-btn', tab==='metrics'&&'active']" @click="tab='metrics'">📈 {{ __('harnessTabMetrics') }}</button>
      <button :class="['tab-btn', tab==='errors'&&'active']" @click="tab='errors'">🚨 {{ __('harnessTabErrors') }}</button>
      <button :class="['tab-btn', tab==='leaderboard'&&'active']" @click="tab='leaderboard'">🏆 {{ __('harnessTabLeaderboard') }}</button>
      <button :class="['tab-btn', tab==='cost'&&'active']" @click="tab='cost'">💰 {{ __('harnessTabCost') }}</button>
      <button :class="['tab-btn', tab==='retention'&&'active']" @click="tab='retention'">📈 {{ __('harnessTabRetention') }}</button>
      <button :class="['tab-btn', tab==='sink'&&'active']" @click="tab='sink'">🗑️ {{ __('harnessTabSink') }}</button>
      <button :class="['tab-btn', tab==='habits'&&'active']" @click="tab='habits'">🧠 习惯</button>
      <button :class="['tab-btn', tab==='rules'&&'active']" @click="tab='rules'">🛡️ 规则引擎</button>
      <button :class="['tab-btn', tab==='proposal'&&'active']" @click="tab='proposal'">📋 提案系统</button>
    </div>

    <div v-if="tab==='overview'" class="tab-content">
      <div class="settings-section">
        <h3>{{ __('harnessSystemHealth') }}</h3>
        <div class="simple-gauges">
          <div class="sg">
            <div class="sg-val" style="color:#22c55e">{{ (((health.completionRate||0)||0) * 100).toFixed(0) }}%</div>
            <div class="sg-bar"><div class="sg-fill" style="background:#22c55e" :style="'width:' + ((health.completionRate||0)*100) + '%'"></div></div>
            <div class="sg-lbl">{{ __('harnessCompletionRate') }}</div>
          </div>
          <div class="sg">
            <div class="sg-val" style="color:#eab308">{{ (((m.errorRate||0)||0) * 100).toFixed(1) }}%</div>
            <div class="sg-bar"><div class="sg-fill" style="background:#eab308" :style="'width:' + ((m.errorRate||0)*100) + '%'"></div></div>
            <div class="sg-lbl">{{ __('harnessErrorRateSmall') }}</div>
          </div>
          <div class="sg">
            <div class="sg-val" style="color:#3b82f6">{{ s && s.state ? s.state.roundCount : 0 }}</div>
            <div class="sg-bar"><div class="sg-fill" style="background:#3b82f6" :style="'width:' + (s && s.state ? Math.min(s.state.roundCount/Math.max(s.options.maxRoundsPerConversation,1),1)*100 : 0) + '%'"></div></div>
            <div class="sg-lbl">{{ __('harnessRoundCalls') }}</div>
          </div>
          <div class="sg">
            <div class="sg-val" style="color:#a855f7;font-size:14px">${{ m.cost ? m.cost.estimatedCost.toFixed(4) : '0' }}</div>
            <div class="sg-bar"><div class="sg-fill" style="background:#a855f7" :style="'width:' + (m.cost ? Math.min(m.cost.estimatedCost/0.1,1)*100 : 0) + '%'"></div></div>
            <div class="sg-lbl">{{ __('harnessFee') }}</div>
          </div>
        </div>
        <div class="info-row">
          <span>{{ health.totalTasks }} 个任务 · {{ health.completedTasks }} 已完成 · {{ health.pendingTasks }} 待处理</span>
          <span>已评分员工: {{ health.scoredAgents || 0 }}</span>
        </div>
      </div>
    </div>

    <div v-if="tab==='metrics'" class="tab-content">
      <div class="settings-section">
        <h3>工具调用统计</h3>
        <table class="dt" v-if="m.toolStats && m.toolStats.length > 0">
          <thead><tr><th>{{ __('harnessTool') }}</th><th>{{ __('harnessCalls') }}</th><th>{{ __('harnessErrors') }}</th><th>{{ __('harnessErrorPct') }}</th><th>{{ __('harnessLatency') }}</th></tr></thead>
          <tbody>
            <tr v-for="t in m.toolStats" :key="t.name">
              <td><code>{{ t.name }}</code></td>
              <td>{{ t.calls }}</td>
              <td :style="{color:t.errors>0?'#ef4444':'#22c55e'}">{{ t.errors }}</td>
              <td>{{ (t.errorRate*100).toFixed(1) }}%</td>
              <td>{{ (t.avgLatency/1000).toFixed(1) }}s</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">{{ __('harnessNoToolData') }}</p>
      </div>
    </div>

    <div v-if="tab==='errors'" class="tab-content">
      <div class="settings-section">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>🚨 {{ __('harnessErrorClassification') }}</h3>
          <button class="refresh-btn" @click="createErrorTickets" :disabled="genTickets.loading" style="font-size:11px">
            {{ genTickets.loading ? '生成中...' : '📋 生成改进工单' }}
          </button>
        </div>
        
        <!-- Error Trend Chart -->
        <div v-if="errorTrend.trend && errorTrend.trend.length>0" style="margin:8px 0">
          <h4 style="font-size:12px;color:var(--fg2);margin-bottom:4px">📈 错误趋势（按日）</h4>
          <div style="display:flex;gap:3px;align-items:end;padding:8px 0;min-height:60px">
            <div v-for="(d,i) in errorTrend.trend.slice(-7)" :key="i" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px">
              <div style="font-size:9px;color:var(--fg3)">{{ d.total }}</div>
              <div style="width:100%;border-radius:3px 3px 0 0;transition:height 0.3s"
                   :style="{height: Math.max(3, d.total*3)+'px', background: d.total > 0 ? '#ef4444' : 'var(--bg2)'}"></div>
              <div style="font-size:8px;color:var(--fg3)">{{ d.date ? d.date.substring(5) : '' }}</div>
            </div>
          </div>
          <div v-if="genTickets.result" class="alert-banner" style="background:rgba(34,197,94,0.1);color:#22c55e;border:none;margin:4px 0">
            ✓ 已生成 {{ genTickets.result.created }} 个改进工单
          </div>
        </div>
        
        <!-- E1-E9 Table -->
        <h4 style="font-size:12px;color:var(--fg2);margin:8px 0 4px">分类明细</h4>
        <table class="dt">
          <thead><tr><th>{{ __('harnessType') }}</th><th>{{ __('harnessName') }}</th><th>{{ __('harnessSeverity') }}</th><th>{{ __('harnessCount') }}</th><th>{{ __('harnessRatio') }}</th></tr></thead>
          <tbody>
            <tr v-for="b in (err.breakdown||[])" :key="b.code" :style="{background:b.count>0&&b.code==='E9'?'rgba(239,68,68,0.1)':''}">
              <td><span class="bd" :class="'sev-'+b.severity">{{ b.code }}</span></td>
              <td>{{ b.name }}</td>
              <td><span :style="{color:b.severity>=3?'#ef4444':b.severity>=2?'#eab308':'#6b7280'}">{{ ['信息','低','中','高','危险'][b.severity]||'-' }}</span></td>
              <td>{{ b.count }}</td>
              <td>{{ b.pct }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="err.pendingCount>0" class="alert-banner">{{ err.pendingCount }} {{ __('harnessUnknownPending') }}</div>
        <div v-if="errs && errs.recentCases && errs.recentCases.length > 0" style="margin-top:8px">
          <h4 style="font-size:12px;color:var(--fg2);margin-bottom:4px">{{ __('harnessRecentCases') }}</h4>
          <div v-for="c in errs.recentCases.slice(0,5)" :key="c.id" style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:6px">
            <span :style="{color:c.level === 'E1' ? '#ef4444' : c.level === 'E7' ? '#eab308' : '#3b82f6', fontWeight:600}">{{ c.level }}</span>
            <span style="flex:1;color:var(--fg)">{{ (c.sampleMessage || c.description || '').substring(0, 40) }}</span>
            <span style="color:var(--fg3);font-size:10px">{{ (c.errorCount || 1) + 'x' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="tab==='leaderboard'" class="tab-content">
      <div class="settings-section">
        <h3>{{ __('harnessEmployeeRanking') }}</h3>
        <div class="hint">{{ __('harnessRankFormula') }}</div>
        <table class="dt" v-if="lb.rankings&&lb.rankings.length>0">
          <thead><tr><th>{{ __('harnessRank') }}</th><th>{{ __('harnessName') }}</th><th>{{ __('harnessScore') }}</th><th>{{ __('harnessKeepRate') }}</th><th>{{ __('harnessCompletionRate') }}</th><th>{{ __('harnessTotalTasks') }}</th></tr></thead>
          <tbody>
            <tr v-for="(r,i) in lb.rankings" :key="r.id">
              <td>{{ i+1 }}</td>
              <td>{{ r.name||r.id }}</td>
              <td :style="{fontWeight:700,color:r.score>=80?'#22c55e':r.score>=60?'#eab308':'#ef4444'}">{{ r.score }}</td>
              <td>{{ (r.keepRate*100).toFixed(0) }}%</td>
              <td>{{ (r.completionRate*100).toFixed(0) }}%</td>
              <td>{{ r.taskCount }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">暂无评估数据</p>
      </div>
    </div>

    <div v-if="tab==='cost'" class="tab-content">
      <div class="settings-section">
        <h3>💰 {{ __('harnessCostEstimate') }}</h3>
        <div class="simple-gauges">
          <div class="sg"><div class="sg-val" style="color:#eab308;font-size:14px">${{ m.cost?m.cost.estimatedCost.toFixed(4):'0.0000' }}</div><div class="sg-lbl">{{ __('harnessTotalCost') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#3b82f6">{{ m.totalTokens ? (m.totalTokens/1000).toFixed(1)+'K' : '0' }}</div><div class="sg-lbl">总 Tokens</div></div>
          <div class="sg"><div class="sg-val" style="color:#22c55e">{{ m.cost && m.cost.inputTokens ? m.cost.inputTokens : 0 }}</div><div class="sg-lbl">{{ __('harnessInputTokens') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#a855f7">{{ m.cost && m.cost.outputTokens ? m.cost.outputTokens : 0 }}</div><div class="sg-lbl">{{ __('harnessOutputTokens') }}</div></div>
          <div class="sg"><div class="sg-val" style="font-size:13px">{{ m.avgTokensPerTask ? m.avgTokensPerTask : '-' }}</div><div class="sg-lbl">Token/任务平均</div></div>
          <div class="sg"><div class="sg-val" :style="{color:m.errorRate>0.15?'#ef4444':'#22c55e'}">{{ (m.errorRate*100).toFixed(1) }}%</div><div class="sg-lbl">Token 浪费率</div></div>
        </div>

        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">🔧 工具调用成本</h4>
        <table class="dt" v-if="m.toolStats && m.toolStats.length > 0">
          <thead><tr><th>{{ __('harnessTool') }}</th><th>{{ __('harnessCalls') }}</th><th>{{ __('harnessErrors') }}</th><th>{{ __('harnessLatency') }}</th><th>Token/次</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="t in m.toolStats" :key="t.name">
              <td><code>{{ t.name }}</code></td>
              <td>{{ t.calls }}</td>
              <td :style="{color:t.errors>0?'#ef4444':'#22c55e'}">{{ t.errors }}</td>
              <td>{{ (t.avgLatency/1000).toFixed(1) }}s</td>
              <td>{{ m.totalTokens && t.calls ? Math.round(m.totalTokens/t.calls) : '-' }}</td>
              <td>{{ t.errors > 5 ? '⚠️ 高频失败' : t.calls > 20 ? '⚡ 高频调用' : '✓' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">{{ __('harnessNoToolData') }}</p>

        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">📈 效率分析</h4>
        <div class="health-grid">
          <div class="health-item" style="grid-column:1/-1">
            <div class="lbl">Token 效率</div>
            <div class="val" style="font-size:12px">
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <div style="flex:1;height:8px;background:var(--bg2);border-radius:4px;overflow:hidden">
                  <div style="height:100%;border-radius:4px;transition:width 0.3s"
                       :style="{width: m.totalTokens ? Math.min((m.totalTokens/5000)*100,100)+'%' : '0%', background: 'linear-gradient(90deg,#22c55e,#eab308)'}"></div>
                </div>
                <span style="color:var(--fg2);font-size:11px;min-width:60px">{{ m.totalTokens }}/5000</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="m.activeAlerts && m.activeAlerts.length > 0" style="margin-top:8px">
          <div v-for="(a,i) in m.activeAlerts" :key="i" style="padding:6px;background:rgba(239,68,68,0.08);border-radius:4px;margin-bottom:4px;font-size:11px">
            <span style="font-weight:600">⚠️ {{ a.type }}</span>: {{ a.data ? (a.data.message||JSON.stringify(a.data)) : '' }}
          </div>
        </div>
      </div>
    </div>
  </div>

    <div v-if="tab==='retention'" class="tab-content">
      <div class="settings-section">
        <h3>📈 {{ __('harnessRetentionEfficiency') }}</h3>
        <div class="simple-gauges">
          <div class="sg"><div class="sg-val" style="color:#22c55e">{{ kr.summary.keepRate || '0%' }}</div><div class="sg-lbl">{{ __('harnessKeepRate') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#3b82f6">{{ kr.summary.completionRate || '0%' }}</div><div class="sg-lbl">{{ __('harnessCompletionRate') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#eab308">{{ kr.summary.redoRate || '0%' }}</div><div class="sg-lbl">{{ __('harnessRedoRate') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#a855f7">{{ kr.summary.totalTasks || '0' }}</div><div class="sg-lbl">{{ __('harnessTotalTasks') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#22c55e">{{ kr.summary.completedTasks || '0' }}</div><div class="sg-lbl">{{ __('harnessCompleted') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#ef4444">{{ kr.summary.failedTasks || '0' }}</div><div class="sg-lbl">{{ __('harnessFailed') }}</div></div>
        </div>
        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">📊 {{ __('harnessFeatureRanking') }}</h4>
        <div v-if="kr.features && kr.features.length>0">
          <div v-for="(f,i) in kr.features.slice(0,6)" :key="i" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
            <span style="color:var(--fg3);min-width:20px">{{ i+1 }}</span>
            <span style="flex:1;color:var(--fg)">{{ f.feature }}</span>
            <span style="color:var(--accent);font-weight:600">{{ f.count }}</span>
          </div>
        </div>
        <div v-else style="padding:16px 0;color:var(--fg3);font-size:12px">{{ __('harnessNoUsageData') }}</div>

        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">📈 {{ __('harnessDailyTrend') }}</h4>
        <div v-if="kr.dailyTrend && kr.dailyTrend.length>0" style="display:flex;gap:4px;align-items:end;padding:12px 0;min-height:80px">
          <div v-for="(d,i) in kr.dailyTrend.slice(-7)" :key="i" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="font-size:10px;color:var(--fg3)">{{ d.total||0 }}</div>
            <div style="width:100%;border-radius:4px 4px 0 0;transition:height 0.3s"
                 :style="{height: Math.max(4, (d.keepRate||0)*60)+'px', background: (d.keepRate||0) > 0.6 ? 'var(--accent)' : (d.keepRate||0) > 0.3 ? '#eab308' : '#ef4444'}"></div>
            <div style="font-size:9px;color:var(--fg3)">{{ d.date ? d.date.substring(5) : '' }}</div>
          </div>
        </div>
        <div v-else style="padding:8px 0;color:var(--fg3);font-size:12px">{{ __('harnessNoTrendData') }}</div>
      </div>
    </div>

    <div v-if="tab==='sink'" class="tab-content">
      <div class="settings-section">
        <h3>🗑️ {{ __('harnessSinkCases') }}</h3>
        <div class="simple-gauges">
          <div class="sg"><div class="sg-val" style="color:#22c55e">{{ errs.totalCases || '0' }}</div><div class="sg-lbl">{{ __('harnessTotalCases') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#ef4444">{{ errs.openCases || '0' }}</div><div class="sg-lbl">{{ __('harnessOpenCases') }}</div></div>
          <div class="sg"><div class="sg-val" style="color:#22c55e">{{ errs.resolveRate || '0%' }}</div><div class="sg-lbl">{{ __('harnessResolveRate') }}</div></div>
          <div class="sg"><div class="sg-val" style="font-size:13px">{{ errs.byLevel ? Object.keys(errs.byLevel).join(', ') : '-' }}</div><div class="sg-lbl">错误等级</div></div>
        </div>
        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">📋 {{ __('harnessRecentCases') }}</h4>
        <div v-if="errs.recentCases && errs.recentCases.length>0">
          <div v-for="(c,i) in errs.recentCases" :key="i" style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
            <div style="display:flex;gap:6px;align-items:center">
              <span :style="{color:c.level==='E1'?'#ef4444':c.level==='E7'?'#eab308':'#3b82f6',fontWeight:600}">{{ c.level }}</span>
              <span style="flex:1;color:var(--fg)">{{ (c.message||'').substring(0,40) }}</span>
              <span :style="{color:c.status==='open'?'#ef4444':'#22c55e'}">{{ c.status }}</span>
              <span v-if="c.errorCount>1" style="color:var(--fg3)">x{{ c.errorCount }}</span>
            </div>
          </div>
        </div>
        <div v-else style="padding:16px 0;color:var(--fg3);font-size:12px">{{ __('harnessNoCases') }}</div>
      </div>
    
    </div>

    <div v-if="tab==='rules'" class="tab-content">
      <div class="settings-section">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>🛡️ 规则引擎</h3>
          <button class="refresh-btn" @click="showRuleForm" style="font-size:11px">+ 新建规则</button>
        </div>
        <div class="simple-gauges" style="margin-bottom:12px">
          <div class="sg"><div class="sg-val" style="color:#22c55e;font-size:18px">{{ rules.stats.byStatus ? rules.stats.byStatus.active : 0 }}</div><div class="sg-lbl">活跃规则</div></div>
          <div class="sg"><div class="sg-val" style="color:#eab308;font-size:18px">{{ rules.stats.byStatus ? rules.stats.byStatus.proposed : 0 }}</div><div class="sg-lbl">待确认</div></div>
          <div class="sg"><div class="sg-val" style="color:#ef4444;font-size:18px">{{ rules.stats.byStatus ? rules.stats.byStatus.rejected : 0 }}</div><div class="sg-lbl">已驳回</div></div>
          <div class="sg"><div class="sg-val" style="color:#6b7280;font-size:18px">{{ rules.stats.total || 0 }}</div><div class="sg-lbl">总计</div></div>
        </div>
        <table class="dt">
          <thead><tr><th>规则名称</th><th>类型</th><th>严重度</th><th>状态</th><th>条件</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in rules.rules" :key="r.id" :style="{background:r.status==='proposed'?'rgba(234,179,8,0.08)':''}">
              <td style="font-weight:600">{{ r.name }}</td>
              <td><span class="bd" :class="'sev-'+({rate_limit:1,permission:3,compliance:0,operation:2}[r.type]||0)">{{ r.type }}</span></td>
              <td><span :style="{color:r.severity==='high'?'#ef4444':r.severity==='medium'?'#eab308':'#6b7280'}">{{ r.severity }}</span></td>
              <td><span :style="{color:r.status==='active'?'#22c55e':r.status==='proposed'?'#eab308':r.status==='rejected'?'#ef4444':'#6b7280'}">{{ r.status }}</span></td>
              <td style="font-size:11px;color:var(--fg3)"><code>{{ r.condition }}</code></td>
              <td>
                <button v-if="r.status==='proposed'" class="refresh-btn" @click="confirmRule(r.id)" style="font-size:10px;padding:2px 8px;color:#22c55e;border-color:#22c55e">确认</button>
                <button v-if="r.status==='proposed'" class="refresh-btn" @click="rejectRule(r.id)" style="font-size:10px;padding:2px 8px;color:#ef4444;border-color:#ef4444;margin-left:4px">驳回</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="rules.rules.length===0" class="empty">暂无规则数据</p>

        <div v-if="ruleForm.show" class="settings-section" style="margin-top:12px;border:1px solid rgba(59,130,246,0.3)">
          <h4 style="font-size:13px;color:var(--fg);margin-bottom:8px">新建规则</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div><label style="color:var(--fg2);display:block;margin-bottom:2px">规则名称</label><input v-model="ruleForm.name" placeholder="规则名称" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)"></div>
            <div><label style="color:var(--fg2);display:block;margin-bottom:2px">类型</label>
              <select v-model="ruleForm.type" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)">
                <option value="rate_limit">频率限制</option>
                <option value="permission">权限规则</option>
                <option value="compliance">合规规则</option>
                <option value="operation">操作规则</option>
              </select></div>
            <div style="grid-column:1/-1"><label style="color:var(--fg2);display:block;margin-bottom:2px">条件 (如: agent.callsPerMinute >= 20)</label><input v-model="ruleForm.condition" placeholder="agent.callsPerMinute >= 20" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)"></div>
            <div><label style="color:var(--fg2);display:block;margin-bottom:2px">动作</label>
              <select v-model="ruleForm.action" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)">
                <option value="block">禁止 (直接拦截)</option>
                <option value="warn">警告 (允许但提醒)</option>
              </select></div>
            <div><label style="color:var(--fg2);display:block;margin-bottom:2px">严重度</label>
              <select v-model="ruleForm.severity" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)">
                <option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="critical">致命</option>
              </select></div>
            <div style="grid-column:1/-1"><label style="color:var(--fg2);display:block;margin-bottom:2px">原因</label><input v-model="ruleForm.reason" placeholder="规则说明" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--fg)"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
            <button class="refresh-btn" @click="ruleForm.show=false">取消</button>
            <button class="refresh-btn" @click="doProposeRule" :disabled="!ruleForm.condition" style="background:rgba(59,130,246,0.2);border-color:#3b82f6;color:#60a5fa">提议规则</button>
          </div>
          <div v-if="propResult" :style="{color:propResult.success?'#22c55e':'#ef4444',fontSize:'12px',marginTop:'8px'}">{{ propResult.success ? '✓ 规则已提议，等待安全Agent确认' : propResult.error }}</div>
        </div>
      </div>
    </div>

    <div v-if="tab==='proposal'" class="tab-content">
      <div class="settings-section">
        <h3>📋 提案系统</h3>
        <div class="simple-gauges" style="margin-bottom:12px">
          <div class="sg"><div class="sg-val" style="color:#22c55e;font-size:18px">{{ proposal.stats.byStatus ? proposal.stats.byStatus.approved : 0 }}</div><div class="sg-lbl">已通过</div></div>
          <div class="sg"><div class="sg-val" style="color:#ef4444;font-size:18px">{{ proposal.stats.byStatus ? proposal.stats.byStatus.blocked : 0 }}</div><div class="sg-lbl">被阻断</div></div>
          <div class="sg"><div class="sg-val" style="color:#eab308;font-size:18px">{{ proposal.stats.pendingAppeals || 0 }}</div><div class="sg-lbl">待审批申诉</div></div>
          <div class="sg"><div class="sg-val" style="color:#3b82f6;font-size:18px">{{ proposal.stats.total || 0 }}</div><div class="sg-lbl">总计</div></div>
        </div>
        <h4 v-if="proposal.pendingAppeals && proposal.pendingAppeals.length > 0" style="font-size:13px;color:#eab308;margin-bottom:8px">⚠️ 待审批申诉 ({{ proposal.pendingAppeals.length }})</h4>
        <div v-if="proposal.pendingAppeals && proposal.pendingAppeals.length > 0">
          <div v-for="(a,i) in proposal.pendingAppeals" :key="'a'+i" style="padding:8px;background:rgba(234,179,8,0.08);border-radius:6px;margin-bottom:6px;font-size:12px">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-weight:600;color:var(--fg)">{{ a.agentName || a.agentId }}</span>
              <span style="color:var(--fg3)">申诉理由: {{ (a.appeal && a.appeal.justification) || '-' }}</span>
              <span style="color:#ef4444;font-size:10px" v-if="a.originalBlock">原因: {{ a.originalBlock.substring(0,30) }}</span>
            </div>
            <div style="display:flex;gap:4px;margin-top:4px">
              <button class="refresh-btn" @click="reviewAppeal(a.id,'approve')" style="font-size:10px;padding:2px 8px;color:#22c55e;border-color:#22c55e">✓ 罗免</button>
              <button class="refresh-btn" @click="reviewAppeal(a.id,'deny')" style="font-size:10px;padding:2px 8px;color:#ef4444;border-color:#ef4444">✗ 驳回</button>
            </div>
          </div>
        </div>
        <h4 style="font-size:13px;color:var(--fg);margin:12px 0 8px">近期提案审计日志</h4>
        <div v-if="proposal.audit && proposal.audit.length > 0">
          <div v-for="(e,i) in proposal.audit" :key="'e'+i" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
            <span :style="{color:e.type==='proposal_submitted'?'#3b82f6':e.type==='appeal_submitted'?'#eab308':e.type==='appeal_approved'?'#22c55e':'#ef4444',fontWeight:600}">{{ e.type.replace('_',' ') }}</span>
            <span style="color:var(--fg3);flex:1">{{ e.agentName || e.agentId || '' }} {{ e.justification ? '- '+e.justification.substring(0,20) : '' }}</span>
            <span style="color:var(--fg3);font-size:10px">{{ e.timestamp ? e.timestamp.substring(11,19) : '' }}</span>
          </div>
        </div>
        <p v-else class="empty">暂无提案记录</p>
      </div>
    

    <div v-if="tab==='habits'" class="tab-content">
      <div class="settings-section">
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button @click="habTab='analyze'" :class="{active:habTab==='analyze'}" class="btn btn-ghost" style="font-size:12px;padding:4px 12px">📊 趋势分析</button>
          <button @click="habTab='pending'" :class="{active:habTab==='pending'}" class="btn btn-ghost" style="font-size:12px;padding:4px 12px">
            ⏳ 待确认 <span v-if="pendingList.length" style="background:var(--accent);color:#fff;border-radius:10px;padding:0 6px;font-size:10px;margin-left:4px">{{ pendingList.length }}</span>
          </button>
          <button @click="habTab='confirmed'" :class="{active:habTab==='confirmed'}" class="btn btn-ghost" style="font-size:12px;padding:4px 12px">✅ 已确认偏好</button>
          <button @click="habTab='record'" :class="{active:habTab==='record'}" class="btn btn-ghost" style="font-size:12px;padding:4px 12px">✏️ 手动记录</button>
          <button @click="generateConfirmations" class="btn btn-primary" style="margin-left:auto;font-size:11px">🤖 AI 推测偏好</button>
        </div>

        <div v-if="habTab==='analyze'">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="margin:0;font-size:14px">📊 习惯趋势（带记忆衰减）</h3>
            <button @click="loadAnalysis" class="btn btn-ghost" style="font-size:11px">🔄 刷新</button>
          </div>
          <div v-if="!analysis" style="text-align:center;padding:24px;color:var(--fg3);font-size:13px">
            <p>点击「AI 推测偏好」或加载趋势数据</p>
            <button @click="loadAnalysis" class="btn btn-primary" style="margin-top:8px">📊 加载趋势</button>
          </div>
          <div v-else>
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:var(--fg3)">
              <span>📊 总事件: {{ (analysis.analysis || {}).totalEvents || 0 }}</span>
              <span>📅 分析范围: {{ (analysis.analysis || {}).daysAnalyzed || '-' }} 天</span>
              <span>📈 活跃趋势: {{ ((analysis.analysis || {}).topTrends || []).length }} 条</span>
              <span>✅ 已确认偏好: {{ (analysis.confirmedPreferences || []).length }} 条</span>
            </div>
            <div v-for="t in ((analysis.analysis || {}).topTrends || [])" :key="t.action" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <span :style="{fontSize:'10px',padding:'1px 6px',borderRadius:'4px',marginRight:'6px',fontWeight:600,color:catColor(t.category)}">{{ catLabel(t.category) }}</span>
                  <span style="font-weight:500;font-size:13px">{{ t.action }}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--fg3)">
                  <span>频次: {{ t.frequency }}</span>
                  <span>权重: {{ t.weightedScore }}</span>
                  <span v-if="t.lastSeenDaysAgo <= 7" style="color:#22c55e">🔥 活跃</span>
                  <span v-else-if="t.lastSeenDaysAgo <= 30" style="color:#eab308">🌙 近月</span>
                  <span v-else style="color:var(--fg3)">💤 衰减</span>
                </div>
              </div>
              <div v-if="(t.samples || []).length" style="font-size:11px;color:var(--fg3);margin-top:2px">
                💡 {{ t.samples.join(' · ') }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="habTab==='pending'">
          <h3 style="font-size:14px;margin-bottom:12px">⏳ 待确认的偏好推测 ({{ pendingList.length }})</h3>
          <div v-if="!pendingList.length" style="text-align:center;padding:24px;color:var(--fg3);font-size:13px">
            <p>暂无待确认的偏好推测</p>
            <button @click="generateConfirmations" class="btn btn-primary">🤖 让 AI 分析偏好</button>
          </div>
          <div v-for="p in pendingList" :key="p.id" style="margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
              <div style="flex:1">
                <div style="font-weight:500;font-size:13px">{{ p.inferredLabel }}</div>
                <div style="font-size:11px;color:var(--fg3);margin-top:4px">
                  置信度: {{ Math.round((p.confidence || 0) * 100) }}% · 
                  出现 {{ ((p.evidence || {}).occurrences || 0) }} 次 · 
                  加权分 {{ ((p.evidence || {}).weightedScore || 0) }}
                </div>
                <div v-if="((p.evidence || {}).samples || []).length" style="font-size:11px;color:var(--fg2);margin-top:4px">
                  样本: {{ (p.evidence.samples || []).join(' · ') }}
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button @click="confirmPreference(p.id, true, '')" style="font-size:11px;padding:4px 10px;background:rgba(34,197,94,0.2);color:#22c55e;border:1px solid #22c55e;border-radius:4px;cursor:pointer">✅ 确认</button>
                <button @click="rejectPreference(p.id)" style="font-size:11px;padding:4px 10px;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid #ef4444;border-radius:4px;cursor:pointer">❌ 拒绝</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="habTab==='confirmed'">
          <h3 style="font-size:14px;margin-bottom:12px">✅ 已确认的偏好 ({{ confirmedList.length }})</h3>
          <div v-if="!confirmedList.length" style="text-align:center;padding:24px;color:var(--fg3);font-size:13px">暂无已确认的偏好</div>
          <div v-for="p in confirmedList" :key="p.id" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px">
            <div>{{ p.inferredLabel }}</div>
            <div style="font-size:11px;color:var(--fg3)">
              置信度: {{ Math.round((p.confidence || 0) * 100) }}% · 
              {{ new Date(p.confirmedAt).toLocaleDateString() }} 确认
              <span v-if="p.note"> · 备注: {{ p.note }}</span>
            </div>
          </div>
        </div>

        <div v-if="habTab==='record'">
          <h3 style="font-size:14px;margin-bottom:12px">✏️ 手动记录一条习惯</h3>
          <div style="display:flex;flex-direction:column;gap:8px;max-width:500px">
            <select v-model="recordForm.category" style="padding:8px;border-radius:6px;background:var(--bg2);color:var(--fg);border:1px solid var(--border)">
              <option value="command">命令习惯</option>
              <option value="preference">日常偏好</option>
              <option value="format">格式风格</option>
              <option value="report">报表偏好</option>
              <option value="workflow">工作流程</option>
            </select>
            <input v-model="recordForm.action" placeholder="行为描述（如 prefer_concise）" style="padding:8px;border-radius:6px;background:var(--bg2);color:var(--fg);border:1px solid var(--border)">
            <input v-model="recordForm.detail" placeholder="详情（可选）" style="padding:8px;border-radius:6px;background:var(--bg2);color:var(--fg);border:1px solid var(--border)">
            <button @click="manualRecord" :disabled="!recordForm.action" class="btn btn-primary" style="align-self:flex-start">✏️ 记录</button>
            <div v-if="recordMsg" style="font-size:12px;color:#22c55e">{{ recordMsg }}</div>
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
      m: {}, s: {}, err: { breakdown: [] }, health: { completionRate: 0 }, rules: { rules: [], total: 0, stats: { byStatus: {}, byType: {} } }, proposal: { proposals: [], total: 0, stats: {}, pendingAppeals: [], audit: [] }, ruleForm: { show: false, type: 'compliance', name: '', condition: '', action: 'warn', reason: '', severity: 'medium' }, propResult: null, habTab: 'analyze', analysis: null, pendingList: [], confirmedList: [], recordForm: { category: 'command', action: '', detail: '' }, recordMsg: '',
      lb: { rankings: [] }, kr: { summary: {}, features: [], dailyTrend: [] }, errs: { totalCases: 0, openCases: 0, recentCases: [] }, errorTrend: { trend: [] }, genTickets: { loading: false, result: null }, slaStats: { totalCalls: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, avgLatency: 0, latencyDistribution: {} },
      tab: 'overview', connected: false,
      lastUpdate: '-', ws: null, rt: null
    }
  },
  mounted() {
    this.fetchAll()
    this.connectWS()
  },
  beforeDestroy() {
    if (this.ws) this.ws.close()
    if (this.rt) clearTimeout(this.rt)
  },
  methods: {
    async fetchAll() {
      try {
        const r = await Promise.all([
          API.get('/api/harness/metrics'), API.get('/api/harness/scheduler'),
          API.get('/api/harness/errors/stats'), API.get('/api/harness/evaluation/health'),
          API.get('/api/harness/evaluation/leaderboard'),
          API.get('/api/harness/keeprate/report'),
          API.get('/api/harness/errors/cases'),
          API.get('/api/harness/errors/stats'),
          API.get('/api/harness/errors/trend'), API.get('/api/harness/sla/stats'),
          API.get('/api/harness/rules/stats'),
          API.get('/api/harness/rules'),
          API.get('/api/harness/proposal/stats'),
          API.get('/api/harness/proposal/appeals/pending'),
          API.get('/api/harness/proposal/audit?limit=20')
        ])
        this.m = r[0]||{}; this.s = r[1]||{}; this.err = r[2]||{breakdown:[]};
        var rRulesStats = r[10]||{}; var rRules = r[11]||{}; var rPropStats = r[12]||{}; var rPropAppeals = r[13]||{}; var rPropAudit = r[14]||{};
        this.rules = { stats: rRulesStats, total: rRules.total || 0, rules: (rRules.rules || []).filter(function(x){return x.status!=='deprecated';}) };
        this.proposal = { stats: rPropStats, pendingAppeals: rPropAppeals.pending || [], audit: (rPropAudit.audit || []).slice(0, 20) };
        this.health = r[3]||{completionRate:0}; this.lb = r[4]||{rankings:[]}
        this.kr = r[5]||{summary:{},features:[],dailyTrend:[]}
        // Error Trend
        var trendResp = r[8]||{}; var slaResp = r[9]||{}; if (slaResp.sla) this.slaStats = slaResp.sla;
        this.errorTrend = trendResp.trend || { trend: [] };
        if (trendResp.trend) this.errorTrend = trendResp.trend;
        // Error Sink: cases list
        var casesResp = r[6]||{};
        this.errs = { cases: casesResp.cases || [], recentCases: [] };
        // Error Sink: stats
        var es = r[7]||{};
        this.errs.totalCases = es.totalCases || es.totalErrors || 0;
        this.errs.openCases = es.openCases || 0;
        this.errs.resolveRate = es.resolveRate || '0%';
        this.errs.byLevel = es.byLevel || {};
        this.errs.recentCases = (es.recentCases || []).slice(0, 8);
        this.lastUpdate = new Date().toLocaleTimeString()
      } catch(e) {}
    },
    async createErrorTickets() {
      this.genTickets.loading = true
      this.genTickets.result = null
      try {
        const r = await API.post('/api/harness/errors/tickets')
        this.genTickets.result = r
      } catch(e) {}
      this.genTickets.loading = false
      this.fetchAll()
    },
    
    showRuleForm() {
      this.ruleForm = { show: true, type: 'compliance', name: '', condition: '', action: 'warn', reason: '', severity: 'medium' };
    },
    async doProposeRule() {
      this.propResult = null;
      try {
        var r = await API.post('/api/harness/rules/propose', { type: this.ruleForm.type, name: this.ruleForm.name || '未命名', condition: this.ruleForm.condition, action: this.ruleForm.action, reason: this.ruleForm.reason, severity: this.ruleForm.severity, proposedBy: 'frontend' });
        this.propResult = r;
        if (r.success) { this.ruleForm.show = false; this.fetchAll(); }
      } catch(e) { this.propResult = { success: false, error: e.message }; }
    },
    async confirmRule(ruleId) {
      try { await API.post('/api/harness/rules/' + ruleId + '/confirm', { confirmedBy: 'admin', note: '前端确认' }); this.fetchAll(); } catch(e) {}
    },
    async rejectRule(ruleId) {
      try { await API.post('/api/harness/rules/' + ruleId + '/reject', { rejectedBy: 'admin', reason: '前端驳回' }); this.fetchAll(); } catch(e) {}
    },
    async reviewAppeal(proposalId, decision) {
      try { await API.post('/api/harness/proposal/' + proposalId + '/review', { reviewer: 'admin', role: 'vp', decision: decision, note: '前端操作' }); this.fetchAll(); } catch(e) {}
    },
connectWS() {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        this.ws = new WebSocket(proto + '//' + window.location.host + '/ws')
        this.ws.onopen = () => { this.connected = true; this.wsRetry = 0 }
        this.ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.channel === 'harness' && msg.data) {
              if (msg.data.type === 'metrics') this.m = msg.data.data||this.m
              if (msg.data.type === 'scheduler') this.s = msg.data.data||this.s
              this.lastUpdate = new Date().toLocaleTimeString()
            }
          } catch(e2) {}
        }
        this.ws.onclose = () => { this.connected = false; this.wsRetry = (this.wsRetry||0) + 1; this.rt = setTimeout(() => this.connectWS(), Math.min(30000, this.wsRetry * 5000)) }
        this.ws.onerror = () => { this.connected = false }
      } catch(e) {}
    }
  }
}
</script>

<style scoped>
.status-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
.badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-online { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge-offline { background: rgba(107,114,128,0.15); color: #6b7280; }
.badge-info { background: rgba(59,130,246,0.15); color: #3b82f6; }
.refresh-btn { padding: 4px 12px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #ccc; cursor: pointer; font-size: 12px; margin-left: auto; }
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.tab-btn { padding: 6px 14px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); color: #9ca3af; cursor: pointer; font-size: 13px; }
.tab-btn.active { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: #60a5fa; }
.gauge-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin-bottom: 12px; }
.gauge-card { display: flex; justify-content: center; padding: 8px; }
.gauge-circle { text-align: center; }
.gauge-ring { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
.gauge-hole { width: 60px; height: 60px; border-radius: 50%; background: var(--bg,#1a1a2e); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; }
.gauge-label { font-size: 11px; color: #6b7280; margin-top: 6px; }
.hint { font-size: 12px; color: #6b7280; margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 8px; }
.dt { width: 100%; border-collapse: collapse; font-size: 13px; }
.dt th, .dt td { padding: 6px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
.dt th { font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; }
.bd { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.sev-0 { background: rgba(107,114,128,0.2); color: #9ca3af; }
.sev-1 { background: rgba(34,197,94,0.2); color: #22c55e; }
.sev-2 { background: rgba(234,179,8,0.2); color: #eab308; }
.sev-3 { background: rgba(239,68,68,0.2); color: #ef4444; }
.sev-4 { background: rgba(239,68,68,0.3); color: #ef4444; }
.empty { color: #6b7280; text-align: center; padding: 24px; }
.alert-banner { margin-top: 12px; padding: 10px 16px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; color: #ef4444; font-size: 13px; }
.info-row { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; padding: 8px 0; }
code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.simple-gauge{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}.simple-gauge .sg-val{font-size:22px;font-weight:700;margin-bottom:4px}.simple-gauge .sg-lbl{font-size:11px;color:var(--fg2)}
.sg{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}
</style>
