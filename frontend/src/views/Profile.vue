<template>
  <div class="page">
    <!-- 页面标题 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="margin:0">{{ __('profileTitle') }}</h2>
        <p class="desc" style="margin:4px 0 0">{{ __('profileDesc') }}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" @click="saveProfile" :disabled="saving">
          {{ saving ? __('profileSaving') : __('profileSave') }}
        </button>
      </div>
    </div>

    <!-- 保存反馈 -->
    <div v-if="saveMsg" class="save-toast" :class="{error: saveError}" style="margin-bottom:12px">
      {{ saveMsg }}
    </div>

    <!-- 个人资料卡片 -->
    <div class="settings-section profile-header-card">
      <div class="profile-header">
        <div class="profile-avatar">
          <span class="avatar-icon">{{ profile.icon || '👤' }}</span>
        </div>
        <div class="profile-info">
          <h2>{{ profile.name || '管理员' }}</h2>
          <div class="profile-title">{{ profile.title || '系统运营者' }}</div>
          <div class="profile-badge-row">
            <span class="badge status-online">🟢 {{ __('online') }}</span>
            <span class="badge">{{ __('profileAdmin') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 个人信息 -->
    <div class="settings-section">
      <h3>{{ __('profileInfo') }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>{{ __('profileIcon') }}</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input v-model="profile.icon" class="input" style="flex:1;font-size:20px" placeholder="👤" maxlength="4" />
            <span style="font-size:10px;color:var(--fg3)">{{ __('profileEmojiHint') }}</span>
          </div>
        </div>
        <div class="form-field">
          <label>{{ __('profileName') }}</label>
          <input v-model="profile.name" class="input" :placeholder="'管理员'" />
        </div>
        <div class="form-field">
          <label>{{ __('profileNameEn') }}</label>
          <input v-model="profile.name_en" class="input" placeholder="Admin" />
        </div>
        <div class="form-field">
          <label>{{ __('profileTitle2') }}</label>
          <input v-model="profile.title" class="input" :placeholder="'系统运营者'" />
        </div>
        <div class="form-field" style="grid-column: 1 / -1">
          <label>{{ __('profileBio') }}</label>
          <textarea v-model="profile.bio" class="input" rows="3" :placeholder="__('profileBioPlaceholder')" style="resize:vertical;font-size:13px;padding:10px;line-height:1.6"></textarea>
        </div>
      </div>
    </div>

    <!-- 联系方式 -->
    <div class="settings-section">
      <h3>{{ __('profileContact') }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>{{ __('profileEmail') }}</label>
          <input v-model="profile.email" class="input" type="email" placeholder="admin@example.com" />
        </div>
        <div class="form-field">
          <label>{{ __('profilePhone') }}</label>
          <input v-model="profile.phone" class="input" type="tel" placeholder="138-0000-0000" />
        </div>
      </div>
    </div>

    <!-- 偏好设置 -->
    <div class="settings-section">
      <h3>{{ __('profilePreferences') }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>{{ __('profileTheme') }}</label>
          <select v-model="profile.theme" class="input" @change="applyTheme">
            <option value="dark">{{ __('profileThemeDark') }}</option>
            <option value="light">{{ __('profileThemeLight') }}</option>
            <option value="auto">{{ __('profileThemeAuto') }}</option>
          </select>
        </div>
        <div class="form-field">
          <label>{{ __('profileLanguage') }}</label>
          <select v-model="profile.lang" class="input" @change="applyLang">
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 账户信息 -->
    <div class="settings-section">
      <h3>{{ __('profileAccountInfo') }}</h3>
      <div class="health-grid">
        <div class="health-item">
          <div class="lbl">{{ __('profileTitle2') }}</div>
          <div class="val" style="font-size:14px">{{ __('profileAdminFull') }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('profileCreatedAt') }}</div>
          <div class="val" style="font-size:13px;color:var(--fg)">{{ formatDate(profile.createdAt) }}</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('profileSystemName') }}</div>
          <div class="val" style="font-size:13px;color:var(--fg)">eCompany-Claw v3.0</div>
        </div>
        <div class="health-item">
          <div class="lbl">{{ __('profileLicenseStatus') }}</div>
          <div class="val" style="font-size:13px;color:#22c55e">{{ __('profileLicenseLocal') }}</div>
        </div>
      </div>
    </div>

    <!-- 微信渠道 & 开发者公众号 -->
    <div class="settings-section">
      <h3>微信渠道 &amp; 开发者公众号</h3>
      <div class="qr-grid">
        <!-- 微信渠道二维码 -->
        <div class="qr-card">
          <div class="qr-placeholder" style="position:relative">
            <div class="qr-code-box qr-img-box">
              <img v-if="wxQrUrl" :src="wxQrUrl" alt="微信渠道二维码" class="qr-img" />
              <div v-else class="qr-loading">
                <span v-if="wxLoading">⏳ 加载中...</span>
                <span v-else-if="wxBound">✅ 已绑定</span>
                <span v-else-if="wxError" style="color:#ef4444;font-size:11px">{{ wxError }}</span>
                <span v-else>📱 扫码绑定微信</span>
              </div>
            </div>
            <button v-if="!wxBound" class="qr-refresh-btn" @click="refreshWxQR" :title="'刷新二维码'">🔄</button>
          </div>
          <div class="qr-card-info">
            <div class="qr-title" v-if="wxBound">✅ 微信已绑定</div>
            <div class="qr-title" v-else>微信渠道绑定</div>
            <p>扫码绑定微信账号，可作为消息通知渠道</p>
          </div>
        </div>

        <!-- 开发者公众号二维码 -->
        <div class="qr-card">
          <div class="qr-placeholder">
            <div class="qr-code-box qr-img-box">
              <img src="/qrcode_for_gh.jpg" alt="开发者公众号" class="qr-img" />
            </div>
          </div>
          <div class="qr-card-info">
            <div class="qr-title">🐉 开发者公众号</div>
            <p>关注公众号，获取系统更新、使用技巧与最新动态</p>
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
      profile: {
        name: '管理员',
        name_en: 'Admin',
        title: '系统运营者',
        icon: '👤',
        email: '',
        phone: '',
        bio: 'eCompany 系统管理员',
        theme: 'dark',
        lang: 'zh-CN'
      },
      saving: false,
      saveMsg: '',
      saveError: false,
      currentLang: 'zh-CN',
      wxQrUrl: null,
      wxLoading: false,
      wxBound: false,
      wxError: '',
      wxRefreshTimer: null
    }
  },
  methods: {
    applyLang() {
      this.currentLang = this.profile.lang || 'zh-CN'
    },
    applyTheme() {
      const theme = this.profile.theme || 'dark'
      if (theme === 'light') {
        document.documentElement.style.setProperty('--bg', '#f0f0f0')
        document.documentElement.style.setProperty('--bg2', '#ffffff')
        document.documentElement.style.setProperty('--fg', '#1a1a2e')
        document.documentElement.style.setProperty('--fg2', '#555')
        document.documentElement.style.setProperty('--border', 'rgba(0,0,0,0.08)')
      } else {
        document.documentElement.style.setProperty('--bg', '#0f0c29')
        document.documentElement.style.setProperty('--bg2', '#1a1740')
        document.documentElement.style.setProperty('--fg', '#e0e0e0')
        document.documentElement.style.setProperty('--fg2', '#8892b0')
        document.documentElement.style.setProperty('--border', 'rgba(255,255,255,0.06)')
      }
    },
    loadProfile() {
      API.get('/api/profile').then(data => {
        if (data && data.name) {
          this.profile = data
          this.currentLang = data.lang || 'zh-CN'
          if (data.theme) this.applyTheme()
        }
      }).catch(() => {})
    },
    saveProfile() {
      this.saving = true
      this.saveMsg = ''
      this.saveError = false
      API.put('/api/profile', this.profile).then(data => {
        if (data && data.profile) {
          this.profile = data.profile
          this.saveMsg = '✅ ' + (this.currentLang === 'en' ? 'Profile saved!' : '资料已保存')
          this.saveError = false
        } else if (data && data.error) {
          this.saveMsg = data.error
          this.saveError = true
        } else {
          this.saveMsg = this.currentLang === 'en' ? 'Save failed, please retry' : '保存失败，请重试'
          this.saveError = true
        }
      }).catch(e => {
        this.saveMsg = this.currentLang === 'en' ? 'Network error' : '网络错误'
        this.saveError = true
      }).finally(() => {
        this.saving = false
        setTimeout(() => { this.saveMsg = '' }, 3000)
      })
    },
    async refreshWxQR() {
      this.wxLoading = true
      this.wxError = ''
      try {
        // 先检查绑定状态
        var status = await API.get('/api/wechat/status')
        if (status && status.bound) {
          this.wxBound = true
          this.wxLoading = false
          return
        }
        // 获取二维码
        var d = await API.get('/api/wechat/qrcode')
        if (d && d.ok && d.qrcode) {
          this.wxQrUrl = d.qrcode
          this.wxBound = false
          this.wxLoading = false
          // 每 60 秒自动刷新二维码（二维码有时效）
          this.wxRefreshTimer = setTimeout(() => this.refreshWxQR(), 60000)
        } else {
          this.wxError = d && d.error ? d.error : '获取二维码失败'
          this.wxLoading = false
          // 失败后 15 秒重试
          this.wxRefreshTimer = setTimeout(() => this.refreshWxQR(), 15000)
        }
      } catch(e) {
        this.wxError = '网络错误'
        this.wxLoading = false
        this.wxRefreshTimer = setTimeout(() => this.refreshWxQR(), 15000)
      }
    },
    formatDate(dateStr) {
      if (!dateStr) return this.currentLang === 'en' ? 'Unknown' : '未知'
      try {
        const d = new Date(dateStr)
        const locale = this.currentLang === 'en' ? 'en-US' : 'zh-CN'
        return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      } catch { return dateStr }
    }
  },
  mounted() {
    this.loadProfile()
    this.refreshWxQR()
  },
  beforeUnmount() {
    if (this.wxRefreshTimer) clearTimeout(this.wxRefreshTimer)
  },
}
</script>

<style scoped>
.profile-header-card { padding: 24px; }
.profile-header { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.profile-avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, rgba(78,205,196,0.15), rgba(15,12,41,0.8)); border: 2px solid rgba(78,205,196,0.3); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar-icon { font-size: 36px; line-height: 1; }
.profile-info h2 { font-size: 22px; color: #fff; margin: 0 0 4px; font-weight: 600; }
.profile-title { font-size: 13px; color: var(--fg2); margin-bottom: 8px; }
.profile-badge-row { display: flex; gap: 8px; flex-wrap: wrap; }
.profile-badge-row .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; background: rgba(78,205,196,0.1); color: var(--accent); }
.profile-badge-row .badge.status-online { background: rgba(34,197,94,0.1); color: #22c55e; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field label { font-size: 12px; color: var(--fg2); font-weight: 500; }
.form-field .input { padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--fg); font-size: 13px; outline: none; transition: border-color 0.15s; }
.form-field .input:focus { border-color: var(--accent); }
.form-field textarea.input { font-family: inherit; }
.form-field select.input { cursor: pointer; }

.save-toast { padding: 10px 16px; border-radius: 8px; font-size: 13px; background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.save-toast.error { background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.2); }

/* QR Code Section */
.qr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 600px) { .qr-grid { grid-template-columns: 1fr; } }
.qr-card { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); }
.qr-card-info { text-align: center; }
.qr-card-info .qr-title { font-size: 14px; color: #fff; font-weight: 600; margin-bottom: 4px; }
.qr-card-info p { font-size: 12px; color: var(--fg2); line-height: 1.5; margin: 0; }
.qr-section { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.qr-placeholder { flex-shrink: 0; }
.qr-code-box { width: 160px; height: 160px; border-radius: 12px; background: #fff; display: flex; align-items: center; justify-content: center; padding: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
.qr-img-box { padding: 4px; }
.qr-img { width: 100%; height: 100%; border-radius: 8px; object-fit: contain; }
.qr-loading { display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#8892b0; font-size:12px; text-align:center; padding:8px; }
.qr-refresh-btn { position:absolute; bottom:-8px; right:-8px; width:28px; height:28px; border-radius:50%; border:1px solid var(--border); background:var(--bg2); color:var(--fg2); cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:all .12s; }
.qr-refresh-btn:hover { border-color:var(--accent); color:var(--accent); }
.qr-info { flex: 1; min-width: 200px; }
.qr-title { font-size: 14px; color: #fff; font-weight: 600; margin-bottom: 6px; }
.qr-info p { font-size: 12px; color: var(--fg2); line-height: 1.6; margin: 0; }
</style>
