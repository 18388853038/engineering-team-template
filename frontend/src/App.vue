<template>
  <div class="app-layout">
    <aside class="sidebar" v-if="isLoggedIn" :class="{ collapsed: sidebarCollapsed }" @mouseenter="onSidebarEnter" @mouseleave="onSidebarLeave">
      <div class="sb-header">
        <img src="/logo.jpg" class="sb-logo-img" alt="eCompany" width="28" height="28" />
        <div v-show="!sidebarCollapsed"><h1 style="font-size:14px">🐉 eCompany</h1><span class="sb-sub">{{ __('appSub', empCount) }}</span></div>
        <button class="sidebar-toggle" @click="toggleSidebar" :title="sidebarCollapsed ? '展开导航' : '收缩导航'">
          {{ sidebarCollapsed ? '▶' : '◀' }}
        </button>
      </div>

      <div class="sb-section" v-show="!sidebarCollapsed"><span class="sb-section-title">{{ __("nav.core") }}</span></div>
      <nav class="sb-nav">
        <router-link to="/dashboard" class="nav-item" title="仪表盘">
          <span class="nav-icon">📊</span><span v-show="!sidebarCollapsed">{{ __("nav.dashboard") }}</span>
        </router-link>
        <router-link to="/chat" class="nav-item" title="对话">
          <span class="nav-icon">💬</span><span v-show="!sidebarCollapsed">{{ __("nav.chat") }}</span>
        </router-link>
        <router-link to="/employees" class="nav-item" title="员工">
          <span class="nav-icon">👥</span><span v-show="!sidebarCollapsed">{{ __("nav.employees") }}</span>
        </router-link>
        <router-link to="/tasks" class="nav-item" title="任务">
          <span class="nav-icon">📋</span><span v-show="!sidebarCollapsed">{{ __("nav.tasks") }}</span>
        </router-link>
      <router-link to="/harness" class="nav-item" title="Harness">
          <span class="nav-icon">🧠</span><span v-show="!sidebarCollapsed">{{ __("nav.harness") }}</span>
        </router-link>
      </nav>

      <div class="sb-section" v-show="!sidebarCollapsed"><span class="sb-section-title">{{ __("nav.system") }}</span></div>
      <nav class="sb-nav">
        <router-link to="/profile" class="nav-item" title="个人账户">
          <span class="nav-icon">👤</span><span v-show="!sidebarCollapsed">个人账户</span>
        </router-link>
        <router-link to="/settings" class="nav-item" title="设置">
          <span class="nav-icon">⚙️</span><span v-show="!sidebarCollapsed">{{ __("nav.settings") }}</span>
        </router-link>
        <router-link to="/files" class="nav-item" title="文件">
          <span class="nav-icon">📁</span><span v-show="!sidebarCollapsed">{{ __("nav.files") }}</span>
        </router-link>
        <router-link to="/health" class="nav-item" title="健康">
          <span class="nav-icon">❤️</span><span v-show="!sidebarCollapsed">{{ __("nav.health") }}</span>
        </router-link>
      </nav>

      <div class="sb-section" v-show="!sidebarCollapsed" @click="showMore=!showMore" style="cursor:pointer;user-select:none">
        <span class="sb-section-title">{{ showMore ? '▼' : '▶' }} 更多</span>
      </div>
      <nav v-if="showMore" class="sb-nav" style="max-height: 300px; overflow-y: auto;">
        <router-link to="/skills" class="nav-item" title="技能">
          <span class="nav-icon">🎯</span><span>技能系统</span>
        </router-link>
        <router-link to="/automation" class="nav-item" title="自动化">
          <span class="nav-icon">⚡</span><span>自动化设置</span>
        </router-link>
        <router-link to="/workflows" class="nav-item" title="工作流">
          <span class="nav-icon">📋</span><span>工作流</span>
        </router-link>
        <router-link to="/mcp" class="nav-item" title="MCP">
          <span class="nav-icon">🔌</span><span>MCP 协议</span>
        </router-link>
        <router-link to="/audit" class="nav-item" title="审计">
          <span class="nav-icon">📋</span><span>合规审计</span>
        </router-link>
        <router-link to="/boundary" class="nav-item" title="边界">
          <span class="nav-icon">🔒</span><span>行为边界</span>
        </router-link>
        <router-link to="/dag" class="nav-item" title="依赖图">
          <span class="nav-icon">🔗</span><span>任务依赖图</span>
        </router-link>
        <router-link to="/plugins" class="nav-item" title="插件">
          <span class="nav-icon">🧩</span><span>插件系统</span>
        </router-link>
        <router-link to="/abtest" class="nav-item" title="A/B 测试">
          <span class="nav-icon">🧪</span><span>A/B 测试</span>
        </router-link>
        <router-link to="/ceo" class="nav-item" title="CEO权限">
          <span class="nav-icon">👑</span><span>CEO权限</span>
        </router-link>
        <router-link to="/file-permissions" class="nav-item" title="文件权限">
          <span class="nav-icon">🔐</span><span>文件权限</span>
        </router-link>
        <router-link to="/memory" class="nav-item" title="记忆">
          <span class="nav-icon">🧠</span><span>记忆系统</span>
        </router-link>
        
        
        
        

        <a href="/agent-models.html" class="nav-item ext-nav-item" title="AI模型策略">
          <span class="nav-icon">🤖</span><span>AI模型策略</span>
        </a>
        <a href="/wechat-bind.html" class="nav-item ext-nav-item" title="微信绑定">
          <span class="nav-icon">💬</span><span>微信绑定</span>
        </a>
        <a href="/qqbot-bind.html" class="nav-item ext-nav-item" title="QQ绑定">
          <span class="nav-icon">🐧</span><span>QQ绑定</span>
        </a>
        <a href="/tencent-config.html" class="nav-item ext-nav-item" title="腾讯云">
          <span class="nav-icon">☁️</span><span>腾讯云</span>
        </a>
      </nav>

      <div class="sb-footer" v-show="!sidebarCollapsed">
        <div class="lang-bar">
          <div class="heartbeat-indicator" :title="'系统: ' + (serverStatus || '检查中...')">
            <span class="heartbeat-dot" :class="serverStatus"></span>
            <span class="heartbeat-label">{{ serverStatus === 'online' ? '运行中' : serverStatus === 'busy' ? '处理中' : '检查中' }}</span>
          </div>
        </div>
        <div class="lang-bar">
          <span class="lang-btn" :class="{active: lang==='zh-CN'}" @click="setLang('zh-CN')">简</span>
          <span class="lang-div">|</span>
          <span class="lang-btn" :class="{active: lang==='zh-TW'}" @click="setLang('zh-TW')">繁</span>
          <span class="lang-div">|</span>
          <span class="lang-btn" :class="{active: lang==='en-US'}" @click="setLang('en-US')">EN</span>
          <span class="lang-div">|</span>
          <span class="lang-btn" :class="{active: lang==='ja-JP'}" @click="setLang('ja-JP')">日</span>
          <span class="lang-div">|</span>
          <span class="lang-btn" :class="{active: lang==='ko-KR'}" @click="setLang('ko-KR')">韩</span>
        </div>
        <div class="nav-item" @click="logout" style="cursor:pointer">
          <span class="nav-icon">🚪</span><span>{{ __("nav.logout") }}</span>
        </div>
      </div>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
    <!-- Global Error Toast -->
    <div v-if="errorMsg" class="error-toast" @click="errorMsg=''">
      <span>⚠️ {{ errorMsg }}</span>
      <span style="font-size:10px;margin-left:8px;opacity:0.7">点击关闭</span>
    </div>
  </div>
</template>

<script>
import { API } from './main.js'
import { setLang, translateDOM, getLang } from './i18n.js'
export default {
  data() { return { empCount: 0, lang: 'zh-CN', errorMsg: '', serverStatus: 'idle', busyCount: 0, showMore: false, sidebarCollapsed: false, autoCollapseTimer: null } },
  computed: {
    isLoggedIn() { return !!API.token }
  },
  methods: {
    setLang(l) { this.lang = l; setLang(l); this.$nextTick(function() { translateDOM(); }); try { API.put('/api/profile', {lang: l}); } catch(e) {} },
    logout() { API.setToken(''); this.$router.push('/login') },
    toggleSidebar() { this.sidebarCollapsed = !this.sidebarCollapsed; this.resetAutoCollapse(); },
    resetAutoCollapse() { if (this.autoCollapseTimer) { clearTimeout(this.autoCollapseTimer); this.autoCollapseTimer = null; } if (!this.sidebarCollapsed) { this.autoCollapseTimer = setTimeout(function() { this.sidebarCollapsed = true; }.bind(this), 30000); } },
    onSidebarEnter() { if (this.sidebarCollapsed) { this.sidebarCollapsed = false; this.resetAutoCollapse(); } },
    onSidebarLeave() { this.resetAutoCollapse(); }
  },
  mounted() {
    this.lang = getLang();
    if (API.token) {
      this.resetAutoCollapse();
      window.__appError = function(msg) { this.errorMsg = msg; setTimeout(function() { this.errorMsg = ''; }.bind(this), 6000); }.bind(this);
    window.addEventListener('unhandledrejection', function(e) { this.errorMsg = '请求异常: ' + (e.reason && e.reason.message ? e.reason.message : '网络错误'); }.bind(this));
    API.get('/api/agents').then(d => { if (d.total) this.empCount = d.total });
      API.get('/api/profile').then(function(d) { if (d && d.lang) { setLang(d.lang); this.lang = d.lang; translateDOM(); } }.bind(this)).catch(function() {});
    this.$nextTick(function() { translateDOM(); });
      // 系统心跳监控
      var _hb = this;
      setInterval(function() {
        fetch('/api/health').then(function(r){return r.json()}).then(function(d){
          _hb.serverStatus = (d.status === 'healthy' || d.ok) ? 'online' : 'busy';
        }).catch(function(){_hb.serverStatus='offline'});
      }, 10000);
        }
  }
}
</script>

<style scoped>
.sb-logo-img{width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;max-width:28px;max-height:28px}
.lang-bar{display:flex;align-items:center;gap:4px;padding:4px 10px;justify-content:center}
.lang-btn{font-size:11px;padding:2px 6px;cursor:pointer;border-radius:3px;color:var(--fg2);user-select:none}
.lang-btn.active{color:var(--accent);font-weight:600}
.lang-div{color:var(--fg3);font-size:10px}
.error-toast{position:fixed;bottom:20px;right:20px;z-index:9999;background:rgba(239,68,68,0.95);color:#fff;padding:10px 16px;border-radius:8px;font-size:12px;cursor:pointer;max-width:400px;backdrop-filter:blur(8px);animation:fadeIn 0.3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* 系统心跳指示器 */
.heartbeat-indicator{display:flex;align-items:center;gap:6px;font-size:10px}
.heartbeat-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
.heartbeat-dot.online{background:#10b981;box-shadow:0 0 4px rgba(16,185,129,0.5);animation:pulse-dot 2s infinite}
.heartbeat-dot.busy{background:#f59e0b;box-shadow:0 0 4px rgba(245,158,11,0.5);animation:pulse-dot 0.8s infinite}
.heartbeat-dot.offline{background:#ef4444}
.heartbeat-label{color:var(--fg3)}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.5)}}

.sidebar-toggle{background:none;border:none;color:var(--fg3);font-size:14px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:all 0.2s;flex-shrink:0;line-height:1}
.sidebar-toggle:hover{background:var(--bg1);color:var(--fg)}
.sidebar.collapsed{width:56px;min-width:56px}
.sidebar.collapsed .sb-header{justify-content:center;padding:12px 8px}
.sidebar.collapsed .nav-item{justify-content:center;padding:8px}
.sidebar.collapsed .sb-section-title{display:none}
</style>
