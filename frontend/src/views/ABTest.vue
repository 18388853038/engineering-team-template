<template>
  <div class="page">
    <h2>🧪 {{ __('abtestTitle') }}</h2>
    <p class="desc">{{ __('abtestDesc') }}</p>

    <div class="status-bar">
      <span class="badge">{{ experiments.length }} {{ __('abtestExperiments') }}</span>
      <span v-if="activeExp" class="badge" style="background:rgba(34,197,94,0.15);color:#22c55e">● {{ activeExp.name }} {{ __('abtestRunning') }}</span>
      <button class="refresh-btn" @click="fetchAll">↻ {{ __('abtestRefresh') }}</button>
      <button class="create-btn" @click="showCreate = true">➕ {{ __('abtestNewExperiment') }}</button>
    </div>

    <!-- Create Experiment Modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>{{ __('abtestNewExperimentTitle') }}</h3>
        <div class="form-group">
          <label>{{ __('abtestExperimentName') }}</label>
          <input v-model="newExp.name" class="form-input" :placeholder="__('abtestNamePlaceholder')" />
        </div>
        <div class="form-group">
          <label>{{ __('abtestVariantA') }}</label>
          <div class="variant-row">
            <select v-model="newExp.vAProvider" class="form-select"><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select>
            <input v-model="newExp.vAModel" class="form-input" :placeholder="__('abtestModelName')" />
          </div>
        </div>
        <div class="form-group">
          <label>{{ __('abtestVariantB') }}</label>
          <div class="variant-row">
            <select v-model="newExp.vBProvider" class="form-select"><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select>
            <input v-model="newExp.vBModel" class="form-input" :placeholder="__('abtestModelName')" />
          </div>
        </div>
        <div class="form-group">
          <label>{{ __('abtestTrafficSplit') }}</label>
          <input type="number" v-model.number="newExp.trafficSplit" class="form-input-sm" min="0" max="100" />%
        </div>
        <div class="modal-footer">
          <button class="btn-primary" @click="createExp">{{ __('abtestCreate') }}</button>
          <button class="btn-secondary" @click="showCreate = false">{{ __('abtestCancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Experiments List -->
    <div class="settings-section" v-for="e in experiments" :key="e.id">
      <div class="exp-header">
        <h3 style="margin:0;font-size:14px">{{ e.name }}</h3>
        <span class="exp-status" :class="e.status">{{ statusLabel(e.status) }}</span>
      </div>
      <div class="exp-meta">
        <span>{{ __('abtestCreated') }}: {{ formatTime(e.createdAt) }}</span>
        <span v-if="e.activatedAt">{{ __('abtestActivated') }}: {{ formatTime(e.activatedAt) }}</span>
        <span v-if="e.winner">{{ __('abtestWinner') }}: {{ e.winner }}</span>
      </div>

      <!-- Variants -->
      <div class="variant-grid">
        <div v-for="(v,i) in e.variants" :key="i" class="variant-card" :class="{winner: e.winner === v.name}">
          <div class="variant-label">{{ __('abtestVariant') }} {{ ['A','B'][i] || i }}</div>
          <div class="variant-detail">{{ v.provider }} / {{ v.model }}</div>
          <div class="variant-stats" v-if="e.results && e.results.byVariant">
            <div>{{ __('abtestCalls') }}: {{ (e.results.byVariant[v.name || v.id] || {}).calls || 0 }}</div>
            <div>{{ __('abtestSuccessRate') }}: {{ calcRate(e.results.byVariant[v.name || v.id], 'success') }}%</div>
            <div>{{ __('abtestLatency') }}: {{ (e.results.byVariant[v.name || v.id] || {}).avgLatency || 0 }}ms</div>
          </div>
          <div v-if="e.winner === v.name" class="winner-badge">🏆 胜出</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="exp-actions" v-if="e.status === 'draft' || e.status === 'inactive'">
        <button class="tiny-btn" @click="activateExp(e.id)">▶ {{ __('abtestActivate') }}</button>
      </div>
      <div class="exp-actions" v-if="e.status === 'active'">
        <button class="tiny-btn" @click="concludeExp(e.id, e.variants[0].name)">🏆 {{ __('abtestChooseA') }}</button>
        <button class="tiny-btn" @click="concludeExp(e.id, e.variants[1].name)">🏆 {{ __('abtestChooseB') }}</button>
      </div>
    </div>
    <div v-if="!experiments.length" class="empty-state" style="padding:40px;text-align:center">
      <p style="color:var(--fg3);font-size:12px">{{ __('abtestNoExperiments') }}</p>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'

const PROVIDERS = ['deepseek','openai','siliconflow','tongyi','zhipu','gemini','moonshot','baichuan','minimax','doubao','step','openrouter','claude']

export default {
  data() {
    return {
      experiments: [], activeExp: null, providers: PROVIDERS,
      showCreate: false,
      newExp: { name: '', vAProvider: 'deepseek', vAModel: 'deepseek-chat', vBProvider: 'openai', vBModel: 'gpt-4o-mini', trafficSplit: 50 }
    }
  },
  mounted() { this.fetchAll() },
  methods: {
    async fetchAll() {
      try {
        const d = await API.get('/api/harness/abtest/experiments')
        if (d.ok) { this.experiments = d.experiments || []; this.activeExp = d.active; }
      } catch(e) {}
    },
    async createExp() {
      var variants = [
        { name: 'A', provider: this.newExp.vAProvider, model: this.newExp.vAModel },
        { name: 'B', provider: this.newExp.vBProvider, model: this.newExp.vBModel }
      ]
      await API.post('/api/harness/abtest/create', { name: this.newExp.name, variants: variants, trafficSplit: this.newExp.trafficSplit })
      this.showCreate = false
      this.fetchAll()
    },
    async activateExp(id) { await API.post('/api/harness/abtest/activate/' + id); this.fetchAll() },
    async concludeExp(id, winner) { await API.post('/api/harness/abtest/conclude/' + id, { winner }); this.fetchAll() },
    statusLabel(s) { return { draft: '草稿', active: '运行中', inactive: '已停用', concluded: '已结束' }[s] || s },
    formatTime(ts) { if (!ts) return '-'; return new Date(ts).toLocaleString() },
    calcRate(stats, key) { if (!stats || !stats[key]) return 0; return ((stats[key] / Math.max(1, stats.calls)) * 100).toFixed(0) }
  }
}
</script>

<style scoped>
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--bg2); color: var(--fg2); }
.refresh-btn, .create-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border); font-size: 12px; cursor: pointer; }
.refresh-btn { background: var(--accent); color: #fff; }
.create-btn { background: #22c55e; color: #fff; }
.exp-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.exp-status { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.exp-status.active { background: rgba(34,197,94,0.15); color: #22c55e; }
.exp-status.draft { background: rgba(107,114,128,0.15); color: #6b7280; }
.exp-status.concluded { background: rgba(59,130,246,0.15); color: #3b82f6; }
.exp-meta { font-size: 10px; color: var(--fg3); display: flex; gap: 12px; margin-bottom: 8px; }
.variant-grid { display: flex; gap: 8px; margin: 8px 0; }
.variant-card { flex: 1; border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: var(--bg2); position: relative; }
.variant-card.winner { border-color: #22c55e; }
.variant-label { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.variant-detail { font-size: 11px; color: var(--fg2); font-family: monospace; }
.variant-stats { font-size: 10px; color: var(--fg3); margin-top: 4px; }
.winner-badge { position: absolute; top: -8px; right: -8px; font-size: 16px; }
.exp-actions { display: flex; gap: 4px; margin-top: 8px; }
.tiny-btn { padding: 2px 8px; border-radius: 3px; border: 1px solid var(--border); background: var(--accent); color: #fff; font-size: 10px; cursor: pointer; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; }
.form-group { margin-bottom: 10px; }
.form-group label { display: block; font-size: 12px; color: var(--fg2); margin-bottom: 3px; }
.form-input, .form-select { width: 100%; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg2); color: var(--fg); font-size: 12px; outline: none; box-sizing: border-box; }
.form-input-sm { width: 60px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg2); color: var(--fg); font-size: 12px; outline: none; }
.variant-row { display: flex; gap: 6px; }
.variant-row .form-select { flex: 1; }
.variant-row .form-input { flex: 2; }
.modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.btn-primary { padding: 6px 16px; border-radius: 4px; border: none; background: var(--accent); color: #fff; font-size: 12px; cursor: pointer; }
.btn-secondary { padding: 6px 16px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--fg2); font-size: 12px; cursor: pointer; }
</style>
