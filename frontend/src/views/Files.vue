<template>
  <div class="page">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="margin:0">📁 {{ __('fileMgr') }}</h2>
        <p class="desc" style="margin:4px 0 0">{{ __('fileDesc') }}</p>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" @click="showNewFile = !showNewFile">➕ {{ __('fileNew') }}</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" @click="loadFiles('')">🏠 {{ __('fileRoot') }}</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" @click="goBack" :disabled="!currentDir">⬆ {{ __('fileParent') }}</button>
        <span style="font-size:11px;color:var(--fg3)">{{ currentDir || '/' }}</span>
      </div>
    </div>

    <div v-if="showNewFile" class="settings-section" style="margin-bottom:12px;padding:12px 16px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select v-model="newType" style="padding:6px 8px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px;outline:none">
          <option value="file">{{ __('fileFile') }}</option>
          <option value="dir">{{ __('fileFolder') }}</option>
        </select>
        <input v-model="newName" class="input" style="flex:1;min-width:150px;padding:6px 10px;font-size:12px" :placeholder="newType === 'file' ? 'readme.md' : 'dirname'" @keydown.enter.prevent="createItem" />
        <button class="btn btn-primary" style="padding:6px 12px;font-size:11px" @click="createItem" :disabled="!newName">{{ __('fileCreateBtn') }}</button>
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" @click="showNewFile=false">{{ __('fileCancel') }}</button>
      </div>
      <div v-if="newError" style="color:#ef4444;font-size:11px;margin-top:6px">{{ newError }}</div>
    </div>

    <div class="settings-section">
      <div v-if="loading" style="text-align:center;padding:24px;color:var(--fg2)">{{ __('loading') }}</div>
      <template v-if="!loading">
        <div v-if="!dirs.length && !files.length" class="empty-state" style="padding:24px">
          <div class="icon">📂</div>
          <p style="color:var(--fg3)">{{ __('fileEmpty') }}</p>
        </div>
        <div v-for="d in dirs" :key="d.path" class="file-row" @click="loadFiles(d.path)">
          <span class="file-icon">📁</span>
          <span class="file-name">{{ d.name }}</span>
          <span class="file-meta">{{ formatDate(d.modified) }}</span>
          <span class="file-actions"><button class="file-btn" @click.stop="showDeleteConfirm(d)">🗑️</button></span>
        </div>
        <div v-for="f in files" :key="f.path" class="file-row" @click="readFile(f)">
          <span class="file-icon">{{ fileIcon(f.name) }}</span>
          <span class="file-name">{{ f.name }}</span>
          <span class="file-meta"><span style="margin-right:8px">{{ formatSize(f.size) }}</span><span style="color:var(--fg3)">{{ formatDate(f.modified) }}</span></span>
          <span class="file-actions"><button class="file-btn" @click.stop="showDeleteConfirm(f)">🗑️</button></span>
        </div>
      </template>
    </div>

    <div v-if="content" class="settings-section" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:6px">
        <div><h3 style="margin:0;display:flex;align-items:center;gap:6px">{{ fileIcon(content.name) }} {{ content.name }}<span style="font-size:11px;color:var(--fg3);font-weight:400">{{ formatSize(content.size) }}</span></h3></div>
        <div style="display:flex;gap:6px"><button class="btn btn-ghost" @click="content=null" style="font-size:11px">✕ {{ __('fileClose') }}</button></div>
      </div>
      <pre class="file-preview" style="background:rgba(0,0,0,0.2);padding:12px;border-radius:6px;font-size:12px;line-height:1.6;overflow:auto;max-height:500px;color:#c0c0c0;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Courier New,monospace">{{ content.text }}</pre>
    </div>

    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget=null">
      <div class="modal-box">
        <h3 style="margin:0 0 8px">{{ __('fileConfirmDel') }}</h3>
        <p style="font-size:13px;color:var(--fg2);margin-bottom:16px">{{ __('fileDelWarn') }}<strong style="color:#fff">{{ deleteTarget.name }}</strong>？</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" @click="deleteTarget=null">{{ __('fileCancel') }}</button>
          <button class="btn btn-danger" @click="doDelete">{{ __('fileConfirmDel') }}</button>
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
      files: [], dirs: [], currentDir: '',
      content: null, loading: false,
      showNewFile: false, newType: 'file', newName: '', newError: '',
      deleteTarget: null
    }
  },
  methods: {
    fileIcon(name) {
      const ext = (name.split('.').pop() || '').toLowerCase()
      const map = { js:'📜', json:'📋', md:'📝', txt:'📄', html:'🌐', css:'🎨', vue:'🟢', py:'🐍', java:'☕', go:'🔷', yml:'⚙️', yaml:'⚙️', cfg:'⚙️', log:'📊', sh:'💻', bat:'🪟', conf:'🔧', xml:'📃', lock:'🔒' }
      return map[ext] || '📄'
    },
    formatSize(bytes) {
      if (!bytes && bytes !== 0) return ''
      if (bytes < 1024) return bytes + 'B'
      if (bytes < 1048576) return (bytes/1024).toFixed(1) + 'KB'
      return (bytes/1048576).toFixed(1) + 'MB'
    },
    formatDate(ts) {
      if (!ts) return ''
      try { return new Date(ts).toLocaleDateString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) } catch { return '' }
    },
    goBack() {
      if (!this.currentDir) return
      const parts = this.currentDir.replace(/\\/g, '/').split('/').filter(Boolean)
      parts.pop()
      this.loadFiles(parts.join('/'))
    },
    async loadFiles(dir) {
      this.loading = true; this.content = null; this.showNewFile = false
      this.currentDir = dir || ''
      try {
        const params = dir ? '?dir=' + encodeURIComponent(dir) : ''
        const d = await API.get('/api/files' + params)
        if (d && d.files !== undefined) { this.dirs = d.dirs || []; this.files = d.files || [] }
      } catch (e) { this.dirs = []; this.files = [] }
      this.loading = false
    },
    async readFile(f) {
      this.content = null
      try {
        const d = await API.post('/api/files/read', { path: f.path })
        if (d && d.ok) { this.content = { name: d.name || f.name, text: d.content || '( )', size: d.size }; return }
      } catch(e) {}
      this.content = { name: f.name, text: '( )', size: f.size }
    },
    async createItem() {
      if (!this.newName) return
      this.newError = ''
      const filepath = this.currentDir ? this.currentDir + '/' + this.newName : this.newName
      try {
        const d = await API.post('/api/files/create', { path: filepath, type: this.newType })
        if (d && d.ok) { this.newName = ''; this.showNewFile = false; this.loadFiles(this.currentDir) }
        else { this.newError = d.error || '' }
      } catch(e) { this.newError = e.message || '' }
    },
    showDeleteConfirm(item) { this.deleteTarget = item },
    async doDelete() {
      if (!this.deleteTarget) return
      try {
        const d = await API.post('/api/files/delete', { path: this.deleteTarget.path })
        if (d && d.ok) { this.deleteTarget = null; this.loadFiles(this.currentDir) }
        else { this.deleteTarget = null }
      } catch(e) { this.deleteTarget = null }
    }
  },
  mounted() { this.loadFiles('') }
}
</script>

<style scoped>
.file-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
.file-row:hover { background: rgba(255,255,255,0.03); }
.file-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
.file-name { flex: 1; font-size: 13px; color: var(--fg); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-meta { font-size: 11px; color: var(--fg2); white-space: nowrap; flex-shrink: 0; }
.file-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.file-row:hover .file-actions { opacity: 1; }
.file-btn { background: none; border: none; cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.file-btn:hover { background: rgba(255,255,255,0.08); }
.file-preview { font-family: Consolas, Courier New, monospace; }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 380px; max-width: 90vw; }
.btn-danger { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 500; background: rgba(239,68,68,0.2); color: #ef4444; }
.btn-danger:hover { background: rgba(239,68,68,0.3); }
</style>
