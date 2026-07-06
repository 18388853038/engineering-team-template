<template>
  <div class="setup-page">
    <div class="setup-card">
      <div class="setup-header">
        <img src="/logo.jpg" class="setup-logo" alt="eCompany" />
        <h1>🚀 eCompany {{ __('setupTitle') }}</h1>
        <p class="setup-tagline">迎接你的 AI 团队 — 三步完成启动</p>
      </div>

      <!-- Step indicator -->
      <div class="steps">
        <div v-for="n in 4" :key="n" class="step-dot" :class="{ active: step >= n, done: step > n }">
          <div class="step-circle">{{ step > n ? '✓' : n }}</div>
          <div class="step-label">{{ [__('setupStep1'), __('setupStep2'), __('setupStep3'), __('setupStep4')][n-1] }}</div>
        </div>
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="step === 1" class="step-content">
        <h2>👋 {{ __('setupWelcome') }}</h2>
        <p>{{ __('setupDesc') }}</p>
        <div class="feature-list">
          <div class="feature-item">📊 <span>{{ __('setupFeature1') }}</span></div>
          <div class="feature-item">💬 <span>{{ __('setupFeature2') }}</span></div>
          <div class="feature-item">🧠 <span>{{ __('setupFeature3') }}</span></div>
          <div class="feature-item">🔌 <span>{{ __('setupFeature4') }}</span></div>
        </div>
        <div class="step-actions">
          <button class="btn-primary" @click="step = 2">{{ __('setupNext') }} →</button>
        </div>
      </div>

      <!-- Step 2: Provider Config -->
      <div v-if="step === 2" class="step-content">
        <h2>🔑 {{ __('setupConfigureProvider') }}</h2>
        <p>选择 AI 提供商并输入 API Key，这是 AI 员工的大脑。</p>
        <div class="form-group">
          <label>AI 提供商</label>
          <select v-model="provider" class="form-select">
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="siliconflow">SiliconFlow</option>
            <option value="tongyi">通义千问 (Qwen)</option>
            <option value="zhipu">智谱 (GLM)</option>
            <option value="moonshot">Moonshot (Kimi)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div class="form-group">
          <label>API Key</label>
          <div class="input-row">
            <input type="password" v-model="apiKey" class="form-input" placeholder="sk-..." />
            <button v-if="apiKey" class="btn-sm" @click="testKey">测试连接</button>
          </div>
          <span v-if="testResult" :style="{color: testResult.ok ? '#22c55e' : '#ef4444', fontSize:'11px'}">
            {{ testResult.msg }}
          </span>
        </div>
        <div class="form-group" v-if="provider === 'deepseek'">
          <label>模型</label>
          <select v-model="model" class="form-select">
            <option value="deepseek-chat">DeepSeek Chat (默认)</option>
            <option value="deepseek-reasoner">DeepSeek Reasoner</option>
          </select>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="step = 1">← {{ __('setupPrev') }}</button>
          <button class="btn-primary" @click="saveProvider">{{ __('setupNext') }} →</button>
        </div>
      </div>

      <!-- Step 3: Admin Profile -->
      <div v-if="step === 3" class="step-content">
        <h2>👤 运营者信息</h2>
        <p>你是谁？这将显示在系统各处。</p>
        <div class="form-group">
          <label>姓名</label>
          <input v-model="adminName" class="form-input" :placeholder="__('setupEnterName')" />
        </div>
        <div class="form-group">
          <label>职位</label>
          <input v-model="adminTitle" class="form-input" :placeholder="__('setupEnterTitle')" />
        </div>
        <div class="form-group">
          <label>邮箱</label>
          <input v-model="adminEmail" class="form-input" type="email" :placeholder="__('setupEnterEmail')" />
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="step = 2">← {{ __('setupPrev') }}</button>
          <button class="btn-primary" @click="saveProfile">{{ __('setupFinish') }} →</button>
        </div>
      </div>

      <!-- Step 4: Done -->
      <div v-if="step === 4" class="step-content">
        <div class="done-icon">🎉</div>
        <h2>{{ __('setupSetupComplete') }}</h2>
        <p>你现在可以开始使用 eCompany 了。</p>
        <div class="done-links">
          <div class="done-link" @click="$router.push('/dashboard')">📊 {{ __('setupGotoDashboard') }}</div>
          <div class="done-link" @click="$router.push('/chat')">💬 {{ __('setupStartChat') }}</div>
          <div class="done-link" @click="$router.push('/employees')">👥 {{ __('setupBrowseEmployees') }}</div>
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
      step: 1,
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      adminName: '',
      adminTitle: '运营者',
      adminEmail: '',
      testResult: null
    }
  },
  mounted() {
    // Check if already configured
    API.get('/api/setup/status').then(d => {
      if (d.configured) this.$router.push('/dashboard')
    }).catch(() => {})
  },
  methods: {
    async testKey() {
      this.testResult = { ok: false, msg: '测试中...' }
      try {
        const r = await API.post('/api/provider/test', { apiKey: this.apiKey, provider: this.provider })
        this.testResult = r.ok ? { ok: true, msg: '连接成功 ✓' } : { ok: false, msg: r.error || '连接失败' }
      } catch(e) {
        this.testResult = { ok: false, msg: '网络错误: ' + e.message }
      }
    },
    async saveProvider() {
      try {
        await API.post('/api/provider/config', { provider: this.provider, apiKey: this.apiKey, model: this.model })
        this.step = 3
      } catch(e) {
        alert('保存失败: ' + e.message)
      }
    },
    async saveProfile() {
      try {
        await API.put('/api/profile', { name: this.adminName, title: this.adminTitle, email: this.adminEmail })
        this.step = 4
      } catch(e) {
        alert('保存失败: ' + e.message)
      }
    }
  }
}
</script>

<style scoped>
.setup-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); padding: 20px;
}
.setup-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 40px; width: 520px; max-width: 100%;
}
.setup-header { text-align: center; margin-bottom: 20px; }
.setup-logo { width: 48px; height: 48px; border-radius: 12px; }
.setup-header h1 { font-size: 20px; color: #fff; margin: 8px 0 4px; }
.setup-tagline { font-size: 12px; color: #6b7294; }
.steps { display: flex; justify-content: center; gap: 24px; margin: 24px 0; }
.step-dot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.step-circle {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.06); color: #6b7294; border: 1px solid rgba(255,255,255,0.1);
}
.step-dot.active .step-circle { background: var(--accent, #4ecdc4); color: #fff; border-color: var(--accent, #4ecdc4); }
.step-dot.done .step-circle { background: #22c55e; color: #fff; border-color: #22c55e; }
.step-label { font-size: 10px; color: #6b7294; }
.step-content { padding: 12px 0; }
.step-content h2 { font-size: 16px; color: #fff; margin: 0 0 8px; }
.step-content p { font-size: 12px; color: #6b7294; margin: 0 0 16px; line-height: 1.6; }
.feature-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.feature-item { font-size: 12px; color: #e0e0e0; padding: 6px 0; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: #e0e0e0; margin-bottom: 4px; font-weight: 500; }
.form-input, .form-select {
  width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: #e0e0e0; font-size: 13px; outline: none; box-sizing: border-box;
}
.form-input:focus, .form-select:focus { border-color: var(--accent, #4ecdc4); }
.input-row { display: flex; gap: 6px; }
.input-row .form-input { flex: 1; }
.btn-sm { padding: 5px 10px; border-radius: 4px; border: none; background: var(--accent, #4ecdc4); color: #fff; font-size: 11px; cursor: pointer; white-space: nowrap; }
.step-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.btn-primary {
  padding: 8px 20px; border-radius: 6px; border: none;
  background: linear-gradient(135deg, #4ecdc4, #44b3ab); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-secondary {
  padding: 8px 20px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
  background: transparent; color: #e0e0e0; font-size: 13px; cursor: pointer;
}
.done-icon { font-size: 48px; text-align: center; margin: 12px 0; }
.done-links { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.done-link {
  padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
  text-align: center; font-size: 13px; color: #e0e0e0; cursor: pointer; transition: background 0.2s;
}
.done-link:hover { background: rgba(255,255,255,0.06); }
</style>
