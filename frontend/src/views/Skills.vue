<template>
  <div class="page">
    <h2>{{ __('skillsTitle') }}</h2>
    <p class="desc">{{ __('skillsDesc') }}</p>

    <!-- 安装技能 -->
    <div class="settings-section">
      <h3>📦 {{ __('skillsInstallTitle') }}</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input v-model="installUrl" class="input" style="flex:1;min-width:200px" :placeholder="__('skillsUrlPlaceholder')" />
        <button class="save-btn" @click="installSkill" :disabled="installing">{{ installing ? __('skillsInstalling') : __('skillsInstall') }}</button>
        <a href="https://clawhub.ai" target="_blank" class="quick-btn" style="text-decoration:none;font-size:12px">{{ __('skillsBrowseMarket') }}</a>
      </div>
    </div>

    <!-- {{ __("skillsList") }} -->
    <div v-if="loading" style="text-align:center;padding:40px;color:var(--fg2)">{{ __('loading') }}</div>
    <div v-for="s in skills" :key="s.id" style="padding:12px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>{{ s.name || s.id }}</strong>
          <span v-if="s.version" style="font-size:11px;color:var(--fg3);margin-left:6px">v{{ s.version }}</span>
        </div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <span :style="{color:s.enabled?'#22c55e':'#6b7280'}">{{ s.enabled ? __('skillsEnabled') : __('skillsDisabled') }}</span>
          <input type="checkbox" :checked="s.enabled" @change="toggleSkill(s)" style="width:16px;height:16px;cursor:pointer;accent-color:#22c55e" />
        </label>
      </div>
      <div style="font-size:12px;color:var(--fg2);margin-top:4px">{{ s.description||'-' }}</div>
    </div>
    <p v-if="!loading && skills.length===0" style="color:var(--fg2);text-align:center;padding:24px">{{ __('skillsNoSkills') }}</p>
  </div>
</template>
<script>
import { API } from '../main.js'
export default {
  data() { return { skills: [], loading: true, installUrl: '', installing: false } },
  mounted() { this.loadSkills() },
  methods: {
    async loadSkills() {
      try { var d = await API.get('/api/skills'); this.skills = d.skills || d || [] } catch(e) {}
      this.loading = false
    },
    async toggleSkill(s) {
      const newEnabled = !s.enabled
      try {
        await API.post('/api/skills', { name: s.id || s.name, enabled: newEnabled })
        s.enabled = newEnabled
      } catch(e) {
        alert('切换失败: ' + (e.message || e))
      }
    },
    async installSkill() {
      if (!this.installUrl.trim()) { alert('请输入技能 URL 或名称'); return }
      this.installing = true
      try {
        await API.post('/api/skills', { name: this.installUrl.trim(), action: 'install' })
        this.installUrl = ''
        await this.loadSkills()
        alert('安装成功！')
      } catch(e) {
        alert('安装失败: ' + (e.message || e))
      }
      this.installing = false
    }
  }
}
</script>
