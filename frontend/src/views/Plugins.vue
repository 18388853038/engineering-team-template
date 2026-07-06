<template>
  <div class="page">
    <h2>🧩 {{ __('pluginsTitle') }}</h2>
    <p class="desc">{{ __('pluginsDesc') }}</p>

    <div class="status-bar">
      <span class="badge">{{ __('pluginsLoadedCount') }} {{ plugins.length }}</span>
      <span class="badge">{{ __('pluginsCustomToolsCount') }} {{ customTools.length }}</span>
      <button class="refresh-btn" @click="fetchStatus">↻ {{ __('pluginsRefresh') }}</button>
      <button class="reload-btn" @click="reloadPlugins">⟳ {{ __('pluginsReload') }}</button>
    </div>

    <!-- Load Result -->
    <div v-if="loadResult" class="settings-section">
      <h3>📥 {{ __('pluginsLoadResult') }}</h3>
      <div class="result-grid">
        <div class="result-item" v-if="loadResult.loaded !== undefined">
          <span style="color:#22c55e">✓ {{ __('pluginsLoaded') }} {{ loadResult.loaded }}</span>
          <span v-if="loadResult.failed > 0" style="color:#ef4444"> | {{ __('pluginsFailed') }} {{ loadResult.failed }}</span>
        </div>
        <div v-for="(e,i) in loadResult.errors" :key="i" style="color:#ef4444;font-size:11px;padding:2px 0">{{ e }}</div>
      </div>
    </div>

    <!-- Installed Plugins -->
    <div class="settings-section">
      <h3>📦 {{ __('pluginsInstalled') }}</h3>
      <table class="dt" v-if="plugins.length > 0">
        <thead><tr><th>{{ __('pluginsHeaderPlugin') }}</th><th>{{ __('pluginsHeaderVersion') }}</th><th>{{ __('pluginsHeaderDesc') }}</th><th>{{ __('pluginsHeaderTools') }}</th><th>{{ __('pluginsHeaderStatus') }}</th><th>{{ __('pluginsHeaderAction') }}</th></tr></thead>
        <tbody>
          <tr v-for="p in plugins" :key="p.id">
            <td>
              <div style="font-weight:500">{{ p.name }}</div>
              <div style="font-size:10px;color:var(--fg3)">{{ p.id }}</div>
            </td>
            <td style="font-size:11px">{{ p.version }}</td>
            <td style="font-size:11px;color:var(--fg2)">{{ p.description }}</td>
            <td style="text-align:center">{{ p.toolCount }}</td>
            <td>
              <span :style="{color:p.enabled?'#22c55e':'#6b7280',fontSize:'11px'}">
                {{ p.enabled ? __('pluginsEnabledCheck') : __('pluginsDisabledCircle') }}
              </span>
            </td>
            <td>
              <button class="tiny-btn" :style="{background:p.enabled?'#6b7280':'var(--accent)'}" @click="togglePlugin(p.id, !p.enabled)">
                {{ p.enabled ? __('pluginsDisable') : __('pluginsEnable') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">{{ __('pluginsNoPlugins') }}</p>
    </div>

    <!-- Custom Tools -->
    <div class="settings-section">
      <h3>🔧 {{ __('pluginsCustomTools') }}（{{ customTools.length }}）</h3>
      <div v-if="customTools.length > 0">
        <div v-for="t in customTools" :key="t.name" class="tool-card">
          <div class="tool-header">
            <code class="tool-name">{{ t.name }}</code>
            <span class="tool-plugin">{{ __('pluginsFrom') }}: {{ t.pluginId }}</span>
          </div>
          <div class="tool-desc">{{ t.desc }}</div>
          <div v-if="t.params && t.params.properties" class="tool-params">
            <span v-for="(v,k) in t.params.properties" :key="k" class="param-tag">
              {{ k }}: {{ v.type }}
            </span>
          </div>
          <button class="tiny-btn" @click="execTool(t.name)" style="margin-top:4px">▶ {{ __('pluginsTestExec') }}</button>
          <div v-if="toolResults[t.name]" class="tool-result">
            <pre>{{ typeof toolResults[t.name] === 'string' ? toolResults[t.name] : JSON.stringify(toolResults[t.name], null, 2) }}</pre>
          </div>
        </div>
      </div>
      <p v-else class="empty">{{ __('pluginsNoTools') }}</p>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() {
    return {
      plugins: [],
      customTools: [],
      loadResult: null,
      toolResults: {}
    }
  },
  mounted() { this.fetchStatus() },
  methods: {
    async fetchStatus() {
      try {
        const d = await API.get('/api/harness/plugins/status')
        if (d.ok) {
          this.plugins = d.config.plugins || []
          this.customTools = d.config.customTools || []
          this.loadResult = d.loadResult
        }
      } catch(e) {}
    },
    async reloadPlugins() {
      try {
        const d = await API.post('/api/harness/plugins/reload')
        if (d.ok) this.loadResult = d.loadResult
        this.fetchStatus()
      } catch(e) {}
    },
    async togglePlugin(id, enabled) {
      try {
        await API.post('/api/harness/plugins/toggle', { id, enabled })
        this.fetchStatus()
      } catch(e) {}
    },
    async execTool(name) {
      try {
        const d = await API.post('/api/harness/plugins/exec/' + name, { args: {} })
        if (d.ok) {
          this.toolResults[name] = d.result
          this.$forceUpdate()
        }
      } catch(e) {}
    }
  }
}
</script>

<style scoped>
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--bg2); color: var(--fg2); }
.refresh-btn, .reload-btn {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  font-size: 12px; cursor: pointer;
}
.refresh-btn { background: var(--accent); color: #fff; }
.reload-btn { background: var(--bg2); color: var(--fg); }
.tiny-btn {
  padding: 2px 8px; border-radius: 3px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-size: 10px; cursor: pointer;
}
.tool-card {
  border: 1px solid var(--border); border-radius: 8px; padding: 10px;
  margin-bottom: 8px; background: var(--bg2);
}
.tool-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tool-name { font-family: monospace; font-size: 12px; font-weight: 600; }
.tool-plugin { font-size: 10px; color: var(--fg3); }
.tool-desc { font-size: 11px; color: var(--fg2); margin-bottom: 4px; }
.tool-params { display: flex; gap: 4px; flex-wrap: wrap; }
.param-tag {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: rgba(59,130,246,0.1); color: #3b82f6;
}
.tool-result {
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
  padding: 6px; margin-top: 4px;
}
.tool-result pre { margin: 0; font-size: 10px; color: var(--fg2); overflow-x: auto; }
.result-grid { padding: 4px 0; font-size: 12px; }
.result-item { margin-bottom: 4px; }
</style>
