<template>
  <div class="page" style="max-width:900px">
    <h2>🧠 老板习惯记忆库</h2>
    <p style="color:var(--fg3);font-size:13px;margin:4px 0 16px">
      记录和分析操作习惯，带记忆衰减。仅 CEO 和安全总监可查看。AI 推测的偏好需要您确认后才写入核心库。
    </p>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button @click="tab='analyze'" :class="{active:tab==='analyze'}" class="btn btn-ghost">📊 趋势分析</button>
      <button @click="tab='pending'" :class="{active:tab==='pending'}" class="btn btn-ghost">
        ⏳ 待确认 <span v-if="pendingList.length" class="badge">{{ pendingList.length }}</span>
      </button>
      <button @click="tab='confirmed'" :class="{active:tab==='confirmed'}" class="btn btn-ghost">✅ 已确认偏好</button>
      <button @click="tab='record'" :class="{active:tab==='record'}" class="btn btn-ghost">✍️ 手动记录</button>
      <button @click="generateConfirmations" class="btn btn-primary" style="margin-left:auto;font-size:11px">
        🤖 AI 推测偏好
      </button>
    </div>

    <!-- 趋势分析 -->
    <div v-if="tab==='analyze'" class="settings-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">📊 习惯趋势（带记忆衰减）</h3>
        <button @click="loadAnalysis" class="btn btn-ghost" style="font-size:11px">🔄 刷新</button>
      </div>
      <div v-if="!analysis" style="text-align:center;padding:24px;color:var(--fg3)">
        <p>点击「AI 推测偏好」或加载趋势数据</p>
        <button @click="loadAnalysis" class="btn btn-primary" style="margin-top:8px">📊 加载趋势</button>
      </div>
      <div v-else>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:var(--fg3)">
          <span>📈 总事件: {{ analysis?.analysis?.totalEvents || 0 }}</span>
          <span>📅 分析范围: {{ analysis?.analysis?.daysAnalyzed || '-' }} 天</span>
          <span>⚡ 活跃趋势: {{ analysis?.analysis?.topTrends?.length || 0 }} 条</span>
          <span>✅ 已确认偏好: {{ analysis?.confirmedPreferences?.length || 0 }} 条</span>
        </div>
        <div v-for="t in (analysis?.analysis?.topTrends || [])" :key="t.action" class="trend-item" 
             :style="{opacity: Math.min(1, t.weightedScore/10 + 0.2)}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span class="trend-cat" :style="catColor(t.category)">{{ catLabel(t.category) }}</span>
              <span style="font-weight:500;font-size:13px">{{ t.action }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--fg3)">
              <span>频次: {{ t.frequency }}</span>
              <span>权重: {{ t.weightedScore }}</span>
              <span v-if="t.lastSeenDaysAgo <= 7" style="color:#22c55e">🔥 活跃</span>
              <span v-else-if="t.lastSeenDaysAgo <= 30" style="color:#eab308">⏳ 近月</span>
              <span v-else style="color:var(--fg3)">💤 衰减</span>
            </div>
          </div>
          <div v-if="t.samples.length" style="font-size:11px;color:var(--fg3);margin-top:2px">
            📝 {{ t.samples.join(' · ') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 待确认 -->
    <div v-if="tab==='pending'" class="settings-section">
      <h3>⏳ 待确认的偏好推测 ({{ pendingList.length }})</h3>
      <div v-if="!pendingList.length" style="text-align:center;padding:24px;color:var(--fg3)">
        <p>暂无待确认的偏好推测</p>
        <button @click="generateConfirmations" class="btn btn-primary">🤖 让 AI 分析偏好</button>
      </div>
      <div v-for="p in pendingList" :key="p.id" class="pending-item" style="margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="flex:1">
            <div style="font-weight:500;font-size:13px">{{ p.inferredLabel }}</div>
            <div style="font-size:11px;color:var(--fg3);margin-top:4px">
              置信度: {{ Math.round(p.confidence * 100) }}% · 
              出现 {{ p.evidence.occurrences }} 次 · 
              加权分 {{ p.evidence.weightedScore }}
            </div>
            <div v-if="p.evidence.samples && p.evidence.samples.length" style="font-size:11px;color:var(--fg2);margin-top:4px">
              样本: {{ p.evidence.samples.join(' · ') }}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button @click="confirmPreference(p.id, true, '')" class="btn btn-primary" style="font-size:11px;padding:4px 10px">✅ 确认</button>
            <button @click="rejectPreference(p.id)" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;color:#ef4444">❌ 拒绝</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 已确认偏好 -->
    <div v-if="tab==='confirmed'" class="settings-section">
      <h3>✅ 已确认的偏好 ({{ confirmedList.length }})</h3>
      <div v-if="!confirmedList.length" style="text-align:center;padding:24px;color:var(--fg3)">暂无已确认的偏好</div>
      <div v-for="p in confirmedList" :key="p.id" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="font-size:13px">{{ p.inferredLabel }}</div>
        <div style="font-size:11px;color:var(--fg3)">
          置信度: {{ Math.round(p.confidence * 100) }}% · 
          {{ new Date(p.confirmedAt).toLocaleDateString() }} 确认
          <span v-if="p.note"> · 备注: {{ p.note }}</span>
        </div>
      </div>
    </div>

    <!-- 手动记录 -->
    <div v-if="tab==='record'" class="settings-section">
      <h3>✍️ 手动记录一条习惯</h3>
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
        <button @click="manualRecord" :disabled="!recordForm.action" class="btn btn-primary">📝 记录</button>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      tab: 'analyze',
      analysis: null,
      pendingList: [],
      confirmedList: [],
      recordForm: { category: 'command', action: '', detail: '' }
    }
  },
  methods: {
    catLabel(cat) {
      return { command:'命令', preference:'偏好', format:'格式', report:'报表', workflow:'流程' }[cat] || cat;
    },
    catColor(cat) {
      const colors = { command:'#3b82f6', preference:'#22c55e', format:'#eab308', report:'#a855f7', workflow:'#ec4899' };
      return { color: colors[cat] || '#6b7280' };
    },
    async loadAnalysis() {
      try {
        var r = await API.get('/api/harness/habits/analyze?days=90');
        if (r) this.analysis = r;
      } catch(e) { alert('加载失败: ' + e.message); }
    },
    async generateConfirmations() {
      try {
        var r = await API.post('/api/harness/habits/generate');
        var count = r.pending ? r.pending.length : 0;
        alert('AI 分析完成，新增 ' + count + ' 条待确认偏好');
        this.loadPending();
      } catch(e) { alert('分析失败: ' + e.message); }
    },
    async loadPending() {
      try {
        var r = await API.get('/api/harness/habits/pending');
        if (Array.isArray(r)) this.pendingList = r;
      } catch(e) {}
    },
    async loadConfirmed() {
      try {
        if (this.analysis && this.analysis.confirmedPreferences) {
          this.confirmedList = this.analysis.confirmedPreferences;
        }
      } catch(e) {}
    },
    async confirmPreference(prefId, confirmed, note) {
      try {
        await API.post('/api/harness/habits/confirm', { prefId, confirmed, note });
        this.loadPending();
        this.loadAnalysis();
      } catch(e) { alert('操作失败: ' + e.message); }
    },
    rejectPreference(prefId) {
      this.confirmPreference(prefId, false, '');
    },
    async manualRecord() {
      try {
        await API.post('/api/harness/habits/record', this.recordForm);
        alert('已记录');
        this.recordForm = { category: 'command', action: '', detail: '' };
        this.loadAnalysis();
      } catch(e) { alert('记录失败: ' + e.message); }
    }
  },
  mounted() {
    this.loadAnalysis();
    this.loadPending();
  }
}
</script>

<style scoped>
.trend-item { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.trend-cat { font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-right: 6px; font-weight: 600; }
.badge { background: var(--accent); color: #fff; border-radius: 10px; padding: 0 8px; font-size: 11px; margin-left: 4px; }
</style>
