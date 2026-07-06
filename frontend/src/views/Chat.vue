<template>
  <div class="chat-layout"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onFileDrop"
    @paste="onPaste">
    <!-- Main Chat Area -->
    <div class="chat-main">
      <!-- 主聊天框拖拽遮罩 -->
      <div v-if="dragOver" class="drag-overlay" @dragleave.prevent="dragOver=false" @drop.prevent="handleDrop">
        <div class="drag-overlay-content">
          <p>{{ $t('chat.drop_files') || '释放文件到主聊天框' }}</p>
        </div>
      </div>
      <div class="chat-hdr">
        <span class="chi">{{ current ? (current.icon || '👑') : '👑' }}</span>
        <div>
          <div class="chn">工作台</div>
          <div class="cht" style="display:none">{{ current ? current.title : $t('chat.ready', '就绪') }} <span class="xl-badge">小龙模式</span></div>
        </div>
        <button class="create-avatar-btn" @click="showCreateAvatar = true" :title="$t('chat.new_avatar', '创建新分身')">+ {{ $t('chat.avatar_clone', '分身') }}</button>
        <select v-model="modelName" class="model-select" @change="onModelChange" title="选择模型">
          <option v-for="m in modelList" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <button class="compress-btn" @click="compressHistory" title="压缩历史消息" :disabled="messages.length < 50">📦</button>
        <button class="refresh-btn" @click="refreshHistory" title="刷新消息">🔄</button>
        <span v-if="compressedCount" class="compress-badge" @click="compressHistory">已压缩 {{ compressedCount }} 条</span>
        <!-- WebSocket broadcast notifications -->
        <div class="ws-notif-area" @mouseenter="wsNotifUnread = 0">
          <button class="ws-notif-btn" :class="{ connected: wsConnected }"><span class="ws-dot"></span>🔔</button>
          <span v-if="wsNotifUnread > 0" class="ws-notif-badge">{{ wsNotifUnread > 99 ? '99+' : wsNotifUnread }}</span>
          <div v-if="wsNotifications.length" class="ws-notif-dropdown" @mouseenter.stop>
            <div class="ws-notif-header">实时动态</div>
            <div class="ws-notif-list">
              <div v-for="(n,i) in wsNotifications.slice(-20).reverse()" :key="i" class="ws-notif-item">
                <span class="ws-notif-icon">{{ n.source_icon || '📡' }}</span>
                <div class="ws-notif-body">
                  <div class="ws-notif-text">{{ n.message || n.content || '' }}</div>
                  <div class="ws-notif-meta">{{ n.channel }} · {{ n.from || '' }} · {{ formatMsgTime(n.time) }}</div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="ws-notif-dropdown" @mouseenter.stop>
            <div class="ws-notif-header">实时动态</div>
            <div class="ws-notif-empty">暂无实时动态</div>
          </div>
        </div>
      </div>

      <div class="msg-box" ref="msgBox">
        <div class="msg-spacer"></div>
        <div v-for="(m,i) in messages" :key="i" :class="'msg msg-' + m.role">
          <!-- Tool call card (workflow timeline) -->
          <div v-if="m.type === 'tool_call'" class="tool-call-card" :class="{ collapsed: !m._expanded, 'status-done': m.status==='done', 'status-error': m.status==='error', 'status-running': m.status==='running' }">
            <!-- Timeline connector line (shown when prev msg is also a tool_call) -->
            <div v-if="i>0 && messages[i-1] && messages[i-1].type==='tool_call'" class="timeline-connector"></div>
            <div class="tool-call-header" @click="m._expanded = !m._expanded">
              <span class="tl-step-badge" :class="'step-' + (m.status || 'pending')">{{ m.status === 'running' ? '⚡' : m.status === 'done' ? '✅' : m.status === 'error' ? '❌' : '⏳' }}</span>
              <span class="tool-name">{{ m.toolName }}</span>
              <span class="tool-status" :class="'status-' + (m.status || 'pending')">{{ m.status === 'running' ? '执行中...' : m.status === 'done' ? $t('chat.completed') : m.status === 'error' ? '失败' : '等待' }}</span>
              <span class="tool-toggle">{{ m._expanded ? '▾' : '▸' }}</span>
            </div>
            <!-- Collapsed: show one-line summary -->
            <div v-if="!m._expanded" class="tool-call-preview">
              <span class="tool-preview-text">{{ (m.summary ? m.summary : '(直接执行)') }}</span>
              <span v-if="m.result" class="tool-preview-result">{{ typeof m.result === 'string' ? m.result.substring(0,80) : JSON.stringify(m.result).substring(0,80) }}{{ ((typeof m.result === 'string' ? m.result : JSON.stringify(m.result)) || '').length > 80 ? '…' : '' }}</span>
            </div>
            <!-- Expanded: show full details -->
            <div v-if="m._expanded" class="tool-call-body">
              <div class="tool-call-section">
                <span class="tl-section-label">{{ $t('chat.task_input','📥 输入') }}</span>
                <div class="tool-call-args source-code">{{ m.summary || (m.args ? JSON.stringify(m.args, null, 2) : '无参数') }}</div>
              </div>
              <div v-if="m.result" class="tool-call-section">
                <span class="tl-section-label">{{ $t('chat.task_output','📤 结果') }}</span>
                <div class="tool-call-result" :class="{ 'result-error': m.status === 'error' }">{{ typeof m.result === 'string' ? m.result : JSON.stringify(m.result, null, 2) }}</div>
              </div>
            </div>
          </div>
          <!-- Thinking block -->
          <div v-else-if="m.type === 'thinking'" class="thinking-block">
            <span class="thinking-icon">🧠</span>
            <span class="thinking-text">{{ m.content }}</span>
            <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
          <!-- File operation card -->
          <div v-else-if="m.type === 'file_op'" class="file-op-card">
            <span class="file-op-icon">{{ m.op === 'read' ? '📖' : '📝' }}</span>
            <span class="file-op-text">{{ m.op === 'read' ? '读取文件' : '写入文件' }}</span>
            <code class="file-op-path">{{ m.path }}</code>
            <span v-if="m.status === 'done'" class="file-op-status status-ok">✅</span>
            <span v-else class="file-op-status status-running">⏳</span>
          </div>
          <!-- Regular message -->
          <div v-else class="msg-bubble" :style="bubbleStyle(m.role)"><div class="msg-text" v-html="renderContent(m)"></div></div>
          <div v-if="m.files && m.files.length" class="msg-files">
            <div v-for="(f,fi) in m.files.filter(function(x){return x.isImg&&x.data})" :key="fi" class="msg-img-wrap">
              <img :src="f.data" class="msg-img" @click="previewImg(f.data)" @error="f._imgErr=true" />
            </div>
            <div v-for="(f,fi) in m.files.filter(function(x){return !x.isImg||!x.data})" :key="'nf'+fi" class="msg-file">
              📎 {{ f.name }}
            </div>
          </div>
          <div class="msg-time">{{ formatMsgTime(m.time) }}</div>
          <button v-if="m.content" class="msg-copy-btn" @click="copyMsg(m.content)" title="复制消息">📋</button>
        </div>
        <!-- Live streaming indicator -->
        <div v-if="streaming" class="msg msg-assistant">
          <div class="msg-bubble streaming"><div class="msg-text streaming-content">{{ streamContent }}<span class="streaming-cursor">▊</span></div></div>
        </div>
        <!-- Loading indicator -->
        <div v-if="loading && !streaming" class="msg msg-system">
          <div class="msg-bubble system"><div class="msg-text thinking-indicator">
            <span class="thinking-dot">●</span>
            <span class="thinking-dot">●</span>
            <span class="thinking-dot">●</span>
            <span class="thinking-text">{{ __('chatThinking') }}</span>
          </div></div>
        </div>
      </div>

      <!-- File preview bar for main chat -->
      <div v-if="files.length" class="file-preview-wrap main-file-preview">
        <div v-for="(f,fi) in files" :key="fi" class="file-preview-item">
          <img v-if="f.isImg && f.data" :src="f.data" class="file-preview-img" />
          <span v-else class="file-preview-name">📎 {{ f.name }}</span>
          <button class="file-remove-btn" @click="removeFile(fi)">×</button>
        </div>
      </div>

      <!-- Input Area -->
      <div class="input-area">
        <div class="long-text-indicator" :class="{ show: input.length >= LONG_TEXT_THRESHOLD }">📄 文本较长，将自动转为文件</div>
        <div class="input-row">
          <textarea v-model="input" ref="chatInput" @keydown.enter.exact.prevent="send" :placeholder="__('chatPlaceholder')" rows="1" class="chat-input" :disabled="loading"></textarea>
          <button class="pause-btn" @click="togglePause" :class="{paused:taskPaused}" :title="taskPaused?$t('chat.resume_task','恢复后台任务'):$t('chat.pause_task','暂停后台任务')">{{taskPaused?'▶':'⏸'}}</button>
              <button class="send-btn" @click="send" :disabled="!input.trim() && !files.length && !streaming">➤</button>
        </div>
        <div class="chat-actions">
          <label class="file-label">📎<input type="file" multiple hidden @change="onFileSelect" /></label>
          <button v-if="!recording" @click="startRecording" class="file-label" title="语音输入">🎤</button>
          <button v-else @click="stopRecording" class="file-label" style="color:#ef4444" title="停止录音">⏹️</button>
          <span v-if="files.length" class="file-count">{{ files.length }} 个文件</span>
          <span class="hint-text">{{ $t('chat.file_hint') }}</span>
        </div>
      </div>
    </div>

    <!-- Right Column Toggle -->
    <button class="right-toggle" @click="rightCollapsed = !rightCollapsed" :class="{ collapsed: rightCollapsed }" :title="rightCollapsed ? $t('chat.expand_panel','展开右侧面板') : $t('chat.collapse_panel','收起右侧面板')">
      {{ rightCollapsed ? '▶' : '◀' }}
    </button>

    <!-- Right Column -->
    <div class="chat-right-col" :class="{ collapsed: rightCollapsed }">

            <!-- Team Workbench Panel -->
      <div class="panel workbench-panel" style="flex:1.2;min-height:0;display:flex;flex-direction:column;">
        <div class="panel-header">🐉 团队工作台
          <span style="margin-left:auto;font-size:10px;color:var(--fg3);">
            <span v-if="dispatchStats.queued" style="color:#f59e0b;margin-right:4px;">⏳{{ dispatchStats.queued }}</span>
            <span v-if="dispatchStats.active" style="color:#10b981;margin-right:4px;">⚡{{ dispatchStats.active }}</span>
            <span v-if="dispatchStats.completed" style="color:var(--fg3);">✅{{ dispatchStats.completed }}</span>
          </span>
        </div>
        <div class="panel-body" ref="workbenchPanel" style="overflow-y:auto;flex:1;">
          <div class="emp-search" style="padding:4px 0;margin-bottom:6px;">
            <input v-model="empSearch" placeholder="搜索员工..." style="width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--bd);border-radius:4px;background:var(--bg2);color:var(--fg);" />
          </div>
          <div v-if="employees.length === 0" style="font-size:12px;color:var(--fg3);padding:8px 0;text-align:center;">员工加载中...</div>
          <div v-for="emp in filteredEmployees" :key="emp.id" class="emp-item" :class="{ active: current && current.id === emp.id }" @click="selectAgent(emp)" style="display:flex;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;transition:background 0.15s;">
            <span style="font-size:16px;margin-right:8px;position:relative;">
              {{ emp.icon || '🤖' }}
              <span v-if="teamStatus[emp.id]" :style="{'position':'absolute','bottom':'-2px','right':'-2px','width':'8px','height':'8px','border-radius':'50%','border':'1.5px solid var(--bg)','background':statusColor(teamStatus[emp.id].status)}" :title="statusLabel(teamStatus[emp.id])"></span>
            </span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ emp.name || emp.name_cn || emp.id }}</div>
              <div v-if="emp.title" style="font-size:11px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ emp.title }}</div>
              <div v-if="teamStatus[emp.id] && teamStatus[emp.id].status !== 'idle'" style="font-size:10px;color:var(--ac);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ teamStatus[emp.id].taskTitle || teamStatus[emp.id].status }}
              </div>
            </div>
            <span v-if="current && current.id === emp.id" style="font-size:10px;padding:1px 5px;border-radius:3px;background:var(--ac);color:#fff;">当前</span>
            <span v-else-if="teamStatus[emp.id]" :style="{'font-size':'10px','padding':'1px 5px','border-radius':'3px','background':statusBg(teamStatus[emp.id].status),'color':statusFg(teamStatus[emp.id].status)}">{{ statusLabel(teamStatus[emp.id]) }}</span>
          </div>
        </div>
      </div>

      <!-- Report Panel -->
      <div class="panel report-panel" style="flex:0.8;min-height:120px;display:flex;flex-direction:column;">
        <div class="panel-header">
          📋 最终报告
          <span style="margin-left:auto;font-size:10px;color:var(--fg3);">{{ reportMessages.length > 0 ? reportMessages.length + ' 条' : '' }}</span>
        </div>
        <div class="panel-body" ref="reportPanel" style="overflow-y:auto;flex:1;">
          <div v-if="!reportMessages.length" style="text-align:center;color:var(--fg3);padding:20px 0;font-size:12px;">
            暂无报告内容<br>
            <span style="font-size:11px;">AI回复完成后自动显示在此处</span>
          </div>
          <div v-for="(m,i) in reportMessages" :key="'r'+i" class="report-item" style="padding:8px;margin-bottom:6px;border-radius:6px;background:var(--bg2);border:1px solid var(--bd);">
            <div style="font-size:11px;color:var(--fg3);margin-bottom:4px;">{{ formatMsgTime(m.time) }}</div>
            <div style="font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">{{ m.content }}</div>
          </div>
        </div>
      </div>

    </div>

  </div>

  <!-- Create Avatar Modal --><!-- Create Avatar Modal -->
  <div v-if="showCreateAvatar" class="modal-overlay" @click.self="showCreateAvatar = false">
    <div class="modal-dialog create-avatar-dialog">
      <h3>{{ $t('chat.new_avatar') }}</h3>
      <p class="modal-desc">{{ $t('chat.new_avatar_desc') }}</p>
      <div class="form-group">
        <label>分身名称 *</label>
        <input v-model="avatarForm.name" placeholder="例如: 分析助手" class="modal-input" />
      </div>
      <div class="form-group">
        <label>身份 / 职责</label>
        <input v-model="avatarForm.title" placeholder="例如: 高级数据分析师" class="modal-input" />
      </div>
      <div class="form-group">
        <label>图标</label>
        <input v-model="avatarForm.icon" placeholder="🤖" maxlength="2" class="modal-input icon-input" />
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel" @click="showCreateAvatar = false">取消</button>
        <button class="modal-btn confirm" @click="createAvatar" :disabled="!avatarForm.name.trim()">创建</button>
      </div>
    </div>
  </div>

  <!-- Drag-Drop Overlay (已移至chat-main内) -->
  <!-- Paste Overlay -->
  <div v-if="showPasteOverlay" class="paste-overlay" @click="showPasteOverlay=false">
    <div class="paste-overlay-content">
      <p>{{ $t('chat.paste_notice') }}</p>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'

const LONG_TEXT_THRESHOLD = 500

export default {
  data() {
    return {
      current: null,
      messages: [],
      compressThreshold: 50,
      compressedCount: 0,
      _autoCleanTimer: null,
      input: '',
      loading: false,
      dragOver: false,
      showPasteOverlay: false,
      pasteFiles: [],
      files: [],
      recording: false,
      streaming: false,
      streamContent: '',
      modelName: 'deepseek-chat',
      modelList: [{ value: 'deepseek-chat', label: 'DeepSeek Chat' }, { value: 'deepseek-reasoner', label: 'DeepSeek R1 推理版' }],
      ws: null,
      subchatInput: '',
      subchatMessages: [],
      subchatFiles: [],
      subchatLoading: false,
      subchatCollapsed: false,
      subchatStreaming: false,
      subchatStreamContent: '',
      subchatRecording: false,
      rightCollapsed: false,
      showCreateAvatar: false,
      avatarForm: { name: '', title: '', icon: '🤖' },
      employees: [],
      empSearch: '',
      reportMessages: [],
      activities: [],
      mediaRecorder: null,
      audioChunks: [],
      _saveTimer: null,
      // WebSocket connection for real-time broadcasts
      wsConnected: false,
      wsNotifications: [],
      wsReconnectTimer: null,
      wsNotifUnread: 0,
      taskPaused: false,
      goals: { active: [], completed: [] },
      showAddGoal: false,
      newGoalTitle: '',
      _lastChannelMsgId: null,
      _pollTimer: null,
      newGoalDesc: '',
      _goalsTimer: null,
      _dispatchTimer: null,
      // 团队工作台数据
      dispatchStats: { queued: 0, active: 0, completed: 0 },
      dispatchQueue: [],
      dispatchActive: [],
      dispatchCompleted: [],
      teamStatus: {}, // {agentId: {status, taskTitle, elapsed}}
    }
  },

  // === 生命周期：恢复/保存聊天历史 ===
  created() {
    this.loadMessages('__ceo_main__')
    this.loadSubchatMessages('__ceo_main__')
  },
  mounted() {
    this.loadModelList()
      this.loadEmployees()
    this.$nextTick(function() { this._initWebSocket(); }.bind(this))
    this.loadGoals()
    // 每30秒刷新目标状态
    this._goalsTimer = setInterval(function() { this.loadGoals(); }.bind(this), 30000)
    // 团队工作台状态轮询
    var _self = this;
    this._dispatchTimer = setInterval(function() { _self.loadDispatchStatus(); }, 5000)
    this.loadDispatchStatus()
    // 轮询渠道入消息
    this._pollTimer = setInterval(function() { this._pollChannelMessages(); }.bind(this), 3000)
    this._pollChannelMessages()
    // 自动检查历史积压（每5分钟）
    this._autoCleanTimer = setInterval(function() { this._checkAndAutoClean(); }.bind(this), 300000)
    // 首次检查（延迟2秒避免页面渲染竞态）
    setTimeout(function() { this._checkAndAutoClean(); }.bind(this), 2000)
    // 粘贴文件检测
    document.addEventListener('paste', function(e) {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        this.pasteFiles = Array.from(e.clipboardData.files)
        this.showPasteOverlay = true
        this.$nextTick(function() {
          if (this.$refs.pasteInput) this.$refs.pasteInput.click()
        }.bind(this))
      }
    }.bind(this))
  },
  beforeUnmount() {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveNow()
    if (this._subchatSaveTimer) clearTimeout(this._subchatSaveTimer)
    this._saveSubchatNow()
    if (this._goalsTimer) clearInterval(this._goalsTimer)
    if (this._autoCleanTimer) clearInterval(this._autoCleanTimer)
    if (this._pollTimer) clearInterval(this._pollTimer)
    this._destroyWebSocket()
  },
  watch: {
    messages: { handler: 'scrollToBottom', deep: true },
    subchatMessages: { handler: 'scrollSubchatToBottom', deep: true },
    input: 'onInputChange',
    subchatInput: 'onSubchatInputChange'
  },
  computed: {
    taskPlans() {
      return this.activities.filter(function(a) {
        var kw = (a.action || a.title || a.text || '').toLowerCase()
        return /plan|规划|schedule|task_plan|create_plan|方案|设计|总任务/.test(kw)
      })
    },
    progressItems() {
      return this.activities.filter(function(a) {
        var kw = (a.action || a.title || a.text || '').toLowerCase()
        return /step|进度|步骤|completed|phase|阶段|部署|更新|处理|完成|review|评审/.test(kw)
      })
    },
    reportItems() {
      return this.activities.filter(function(a) {
        var kw = (a.action || a.title || a.text || '').toLowerCase()
        return /report|output|产出|报告|总结|document|result|分析|审查|漏洞|用户行为/.test(kw)
      })
    },
    filteredEmployees() {
      var q = (this.empSearch || '').trim().toLowerCase()
      if (!q) return this.employees
      return this.employees.filter(function(e) {
        var name = (e.name || e.name_cn || '').toLowerCase()
        var title = (e.title || '').toLowerCase()
        return name.indexOf(q) >= 0 || title.indexOf(q) >= 0
      })
    },
        otherActivities() {
      var self = this
      return this.activities.filter(function(a) {
        var kw = (a.action || a.title || a.text || '').toLowerCase()
        return !/plan|规划|方案|step|进度|步骤|部署|更新|处理|完成|review|评审|report|产出|报告|总结|分析|审查/.test(kw)
      })
    }
  },
  methods: {
    __(e) { const _m={chatThinking:'思考中...',chatPlaceholder:'输入消息...'}; return _m[e]||e; },
    async loadEmployees() {
      try {
        var resp = await fetch('/api/agents')
        if (!resp.ok) return
        var data = await resp.json()
        if (data && data.agents) {
          this.employees = data.agents
        }
      } catch(e) {
        console.error('loadEmployees error:', e)
      }
    },
    scrollToBottom() {
      this.$nextTick(function() {
        var box = this.$refs && this.$refs.msgBox
        if (box) box.scrollTop = box.scrollHeight
      }.bind(this))
    },
    scrollSubchatToBottom() {
      this.$nextTick(function() {
        var box = this.$refs && this.$refs.subchatMsgBox
        if (box) box.scrollTop = box.scrollHeight
      }.bind(this))
    },
    copyMsg(content) {
      if (!content) return
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2))
      } else {
        var ta = document.createElement('textarea')
        ta.value = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
    },
    renderContent(m) {
      if (!m || !m.content) return ''
      var text = m.content
      var escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;')
      if (text.length > 8000) {
        return '<div style="white-space:pre-wrap;word-break:break-word;line-height:1.6">' + escaped + '</div>'
      }
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
      escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
      return escaped
    },
    formatMsgTime(ts) {
      if (!ts) return ''
      // 兼容秒级时间戳（小于 1e12 的视为秒而非毫秒）
      if (typeof ts === 'number' && ts < 1e12) { ts = ts * 1000; }
      if (typeof ts === 'string' && ts.length === 10 && /^\d+$/.test(ts)) { ts = parseInt(ts) * 1000; }
      var d = new Date(ts)
      var now = new Date()
      var isToday = d.toDateString() === now.toDateString()
      var time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      if (isToday) return time
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + time
    },
    formatTime(ts) {
      if (!ts) return ''
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    showReportDetail(a) {
      // Show activity detail - expand in main chat or log
      if (a.details) {
        this.messages.push({ role: 'assistant', content: a.details, time: new Date().toISOString() })
        this.$nextTick(this.scrollToBottom)
      } else if (a.summary || a.text) {
        this.messages.push({ role: 'assistant', content: a.summary || a.text, time: new Date().toISOString() })
        this.$nextTick(this.scrollToBottom)
      }
    },
    selectAgent(a) {
      this.current = a
      this.loadMessages(a.id)
      this.$nextTick(this.scrollToBottom)
    },
    loadMessages(agentId) {
      try {
        var key = 'chat_' + (agentId || '__ceo_main__')
        var saved = localStorage.getItem(key)
        this.messages = saved ? JSON.parse(saved) : []
      } catch(e) { this.messages = [] }
    },
    _chatKey() {
      return this.current ? 'chat_' + this.current.id : 'chat___ceo_main__'
    },
    _saveNow() {
      var key = this._chatKey()
      // 先试 localStorage，若失败再压缩
      try {
        localStorage.setItem(key, JSON.stringify(this.messages))
      } catch(e) {
        // localStorage 满了，立即用后端压缩
        console.error('[Cleaner] localStorage full, triggering compress:', e)
        this._compressWithBackend()
      }
    },
    saveMessages() {
      var self = this
      if (this._saveTimer) clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(function() { self._saveNow() }, 300)
    },

    compressHistory() {
      this._compressWithBackend()
    },

    refreshHistory() {
      // 刷新上下文：只保留最近2条消息，其余压缩掉
      var key = this.current ? this.current.id : '__ceo_main__'
      var allMessages = JSON.parse(localStorage.getItem('chat_' + key) || '[]')
      if (allMessages.length > 2) {
        var keep = allMessages.slice(-2)
        var summary = allMessages.slice(0, -2).map(function(m) {
          return (m.role || m.type || '?') + ': ' + (m.content || '').substring(0, 100)
        }).join('\n')
        var compressed = {
          role: 'system', content: '[上下文概览]\n' + summary,
          timestamp: new Date().toISOString(), _compressed: true
        }
        keep.unshift(compressed)
        localStorage.setItem('chat_' + key, JSON.stringify(keep))
        this.loadMessages(key)
        console.log('[Refresh] 上下文已刷新: ' + allMessages.length + ' → 压缩为概览 + 最近2条')
      } else {
        this.loadMessages(key)
      }
      this.$nextTick(this.scrollToBottom)
    },

    // ===== 后端引擎自动清理 =====

    _checkAndAutoClean() {
      if (!this.messages || this.messages.length < 50) return
      var self = this
      // 阈值: >=200 立即压缩, >=100 高优先压缩, >=50 中优先压缩
      var count = this.messages.length
      if (count >= 200) {
        console.log('[Cleaner] 紧急自动压缩: ' + count + ' 条消息')
        self._compressWithBackend()
        return
      }
      // 异步检查后端（backup 判断）
      var estSize = count * 3000
      fetch('/api/chat/history/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageCount: count, estimatedSize: estSize })
      }).then(function(r) { return r.json() }).then(function(d) {
        if (!d || !d.ok) return
        var urg = d.status && d.status.urgency
        if (urg === 'critical' || urg === 'high' || (urg === 'medium' && count >= 80)) {
          console.log('[Cleaner] 后端建议压缩: urgency=' + urg + ', msgCount=' + count)
          self._compressWithBackend()
        }
      }).catch(function() { /* offline, use local threshold */ })
    },

    _compressWithBackend() {
      if (!this.messages || this.messages.length < 30) return
      var self = this
      var msgs = this.messages
      var totalBefore = msgs.length
      // 本地压缩：保留最后 50 条，生成本地摘要
      var keepCount = 50
      var summaryLines = []
      for (var ci = msgs.length - 1; ci >= 0 && summaryLines.length < 3; ci--) {
        var m = msgs[ci]
        if (m.role === 'user' && m.content) summaryLines.push('用户: ' + m.content.substring(0, 60))
        if (m.role === 'assistant' && m.content) summaryLines.push('回复: ' + m.content.substring(0, 80))
      }
      var summaryText = summaryLines.reverse().join(' | ') || '无'
      // 截断长消息
      var kept = msgs.slice(0 - keepCount).map(function(m) {
        if (m.content && typeof m.content === 'string' && m.content.length > 500) {
          return Object.assign({}, m, { content: m.content.substring(0, 200) + '...(截断至200字)' })
        }
        return m
      })
      self.messages = kept
      if (summaryText) {
        self.messages.unshift({
          role: 'system', type: 'summary',
          content: '📋 已自动压缩 ' + totalBefore + '→' + keepCount + ' 条: ' + summaryText,
          time: new Date().toISOString()
        })
      }
      self.saveMessages()
      self.compressedCount = (self.compressedCount || 0) + (totalBefore - keepCount)
      self.$nextTick(self.scrollToBottom)
      console.log('[Cleaner] 本地压缩: ' + totalBefore + '->' + keepCount + ', 摘要: ' + summaryText)
      // 同时异步通知后端记录（失败不影响前端）
      fetch('/api/chat/history/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, keepCount: 50, source: 'chat_workspace' })
      }).then(function(r) { return r.json() }).then(function(d) {
        if (d && d.ok) console.log('[Cleaner] 后端同步压缩确认')
      }).catch(function() {})
    },

    // ===== WebSocket 实时广播连接 =====
    _initWebSocket() {
      if (this.ws && this.ws.readyState === 1) return
      if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null }
      // Port might differ if frontend is served separately; default to 8002
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      var host = window.location.hostname || '127.0.0.1'
      // 如果页面是80/443端口或未指定端口，使用后端 WS 端口 8002
      var port = window.location.port 
        ? (['80','443',''].includes(window.location.port) ? 8002 : window.location.port) 
        : 8002
      var url = protocol + '//' + host + ':' + port + '/ws'
      try {
        this.ws = new WebSocket(url)
        var self = this
        this.ws.onopen = function() {
          self.wsConnected = true
          console.log('[WS] Connected:', url)
          // Subscribe to broadcast channels
          self.ws.send(JSON.stringify({ type: 'subscribe', channels: ['channel','tasks','agents','system','tools','workpath'] }))
          // 轮询已有_pollChannelMessages管理，重连后立即触发一次
          setTimeout(function() { self._pollChannelMessages(); }, 500);
        }
        this.ws.onmessage = function(evt) {
          try {
            var msg = JSON.parse(evt.data)
            self._onWsMessage(msg)
          } catch(e) { /* ignore parse errors */ }
        }
        this.ws.onclose = function() {
          self.wsConnected = false
          console.log('[WS] Disconnected, reconnecting in 5s...')
          self.wsReconnectTimer = setTimeout(function() { self._initWebSocket() }, 5000)
        }
        this.ws.onerror = function() {
          self.wsConnected = false
        }
      } catch(e) {
        console.error('[WS] Connection failed:', e)
        this.wsReconnectTimer = setTimeout(function() { self._initWebSocket() }, 10000)
      }
    },
    // 轮询渠道入消息+CEO回复，显示在前端对话区
    _pollChannelMessages() {
      var self = this;
      // 拉取用户入消息 + CEO回复
      Promise.all([
        fetch('/api/v4/messages?direction=in&limit=5').then(function(r){return r.json()}),
        fetch('/api/v4/messages?direction=out&limit=5').then(function(r){return r.json()})
      ]).then(function(results) {
        // 构建已有内容集合
        var existing = new Set();
        for (var _ei = 0; _ei < self.messages.length; _ei++) {
          var _em = self.messages[_ei];
          if (_em && _em.content) existing.add(_em.content);
        }
        var added = 0;
        for (var ri = 0; ri < results.length; ri++) {
          var data = results[ri];
          if (!data || !data.ok || !data.messages) continue;
          for (var i = 0; i < data.messages.length; i++) {
            var m = data.messages[i];
            if (!m.content) continue;
            if (m.direction === 'in') {
              var contentText = '📡 [' + (m.source || m.channel || 'wechat') + '] ' + (m.from || '') + ': ' + m.content;
              if (existing.has(contentText)) continue;
              var entry = self._formatChannelMsg({channel:m.channel,type:'channel_message',content:m.content,source:m.source||m.channel,from:m.from||'',time:m.timestamp});
              if (entry) { self.messages.push(entry); existing.add(contentText); added++; }
            } else if (m.direction === 'out' && m.type === 'ceo_reply') {
              var contentText = '🤖 [CEO回复] ' + m.content;
              if (existing.has(contentText)) continue;
              var entry = { role: 'system', content: contentText, time: m.timestamp };
              self.messages.push(entry); existing.add(contentText); added++;
            }
          }
        }
        if (added) { try { self.saveMessages(); self.$forceUpdate(); self.$nextTick(self.scrollToBottom); } catch(e){} }
      }).catch(function(){});
    },
    // 将渠道消息格式化为对话条目，支持新旧两种 WS 事件格式
    _formatChannelMsg(msg) {
      var text = msg.content || msg.message || '';
      if (!text) return null;
      var src = msg.srcChannel || msg.source || '外部';
      // 新格式：统一走 channel 频道
      if (msg.channel === 'channel') {
        if (msg.type === 'channel_message') {
          // 小龙/CEO广播是通知性质，HTTP reply已有完整回复，不推入对话
if (msg.source === '小龙' || msg.source === 'ceo' || msg.source.indexOf('ECompany AI') === 0) return null;
          return { role: 'system', content: '📡 [' + src + '] ' + (msg.from || '') + ': ' + text, time: msg.time || new Date().toISOString() };
        }
      }
      // 旧格式兼容：直接识别消息/事件类型
      if (msg.type === 'wechat_message' || msg.type === 'channel_message') {
        return { role: 'system', content: '📡 [' + src + '] ' + (msg.from || '') + ': ' + text, time: msg.time || new Date().toISOString() };
      }
      // ceo_reply/ceo_message 不由WS推入对话区（由SSE对话流展示）
      if (msg.type === 'ceo_reply' || msg.type === 'ceo_message') return null;
      return null;
    },
    _destroyWebSocket() {
      if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null }
      if (this.ws) {
        this.ws.onclose = null
        this.ws.onerror = null
        this.ws.onmessage = null
        this.ws.close()
        this.ws = null
      }
      this.wsConnected = false
    },
    _onWsMessage(msg) { console.log('[Chat][WS] msg channel=' + msg.channel + ' type=' + msg.type + ' source=' + msg.source + ' content=' + (msg.content||'').substring(0,50));
      // ===== 工具调用实时推送（通过WS 'tools' 频道） =====
      if (msg.channel === 'tools' && msg.type === 'tool_call_started') {
        // 在有 SSE 流时已经包含了 tool_call 卡片，WS 只做通知提醒 + 通知栏
        var nm = { role: 'assistant', type: 'tool_call', toolName: msg.toolName, args: msg.args || {}, summary: msg.summary || '', status: 'running', _expanded: true, time: msg.time || new Date().toISOString(), _wsPushed: true }
        this.messages.push(nm);
        try { this.saveMessages(); } catch(e) {}
        try { this.$forceUpdate(); } catch(e) {}
        this.$nextTick(this.scrollToBottom);
        // 通知栏
        var nEntry = { channel: 'tools', message: '🔧 工具调用: ' + (msg.toolName || ''), from: 'CEO', time: msg.time || new Date().toISOString(), source_icon: '🔧' }
        this.wsNotifications.push(nEntry);
        if (this.wsNotifications.length > 100) this.wsNotifications.splice(0, this.wsNotifications.length - 100);
        this.wsNotifUnread++;
        return;
      }
      if (msg.channel === 'tools' && msg.type === 'tool_call_completed') {
        // 更新最后一条对应工具调用的状态
        for (var _ti = this.messages.length - 1; _ti >= 0; _ti--) {
          if (this.messages[_ti].type === 'tool_call' && this.messages[_ti].toolName === msg.toolName && this.messages[_ti].status === 'running') {
            this.messages[_ti].status = msg.status === 'done' ? 'done' : 'error';
            if (msg.result) this.messages[_ti].result = msg.result;
            break;
          }
        }
        try { this.saveMessages(); } catch(e) {}
        try { this.$forceUpdate(); } catch(e) {}
        return;
      }
      // ===== 工作路径实时推送（通过WS 'workpath' 频道） =====
      if (msg.channel === 'workpath' && msg.type === 'workpath_update') {
        var wpEntry = { channel: 'workpath', message: '📂 ' + (msg.path || '') + (msg.detail ? ': ' + msg.detail : ''), from: '工作路径', time: msg.time || new Date().toISOString(), source_icon: '📂' }
        this.wsNotifications.push(wpEntry);
        if (this.wsNotifications.length > 100) this.wsNotifications.splice(0, this.wsNotifications.length - 100);
        this.wsNotifUnread++;
        return;
      }
      // ===== 原有通知处理 =====
      // Add to notification list (max 100)
      var entry = { channel: msg.channel, message: msg.message || msg.content || '', from: msg.from || '系统', time: msg.time || new Date().toISOString(), source_icon: msg.channel === 'tasks' ? '📋' : msg.channel === 'agents' ? '🤖' : msg.channel === 'system' ? '🔧' : msg.channel === 'ceo' ? '👑' : msg.channel === 'tools' ? '🔧' : msg.channel === 'workpath' ? '📂' : '📡' }
      this.wsNotifications.push(entry)
      if (this.wsNotifications.length > 100) this.wsNotifications.splice(0, this.wsNotifications.length - 100)
      this.wsNotifUnread++

      // ===== Loop 引擎广播 → activities（目标追踪窗口） =====
      if (msg.channel === 'channel' && msg.source === 'Loop引擎') {
        this.activities.unshift({
          id: Date.now(),
          icon: '⚙️',
          name: msg.from || 'Loop引擎',
          role: 'loop',
          action: (msg.content || '').replace(/^[🔇📝✅🎉⛔]\s*/, '').substring(0, 30) || '工作流步骤',
          status: 'online',
          time: new Date().toLocaleString('zh-CN')
        });
        if (this.activities.length > 200) this.activities.splice(0, this.activities.length - 200);
        try { this.$forceUpdate(); } catch(e) {}
      }

      // 渠道消息 → 工作台（兼容新旧格式）
      var entry = this._formatChannelMsg(msg);
      console.log('[Chat] channel msg:', JSON.stringify({channel:msg.channel, type:msg.type, content:msg.content?.substring(0,50), source:msg.source, from:msg.from, result: Boolean(entry)}), 'entry:', entry);
      if (entry) {
        this.messages.push(entry);
        try { this.$forceUpdate(); } catch(e) {}
        try { this.saveMessages(); } catch(e) {}
      }
    },

    _doCompress() {
      var keepCount = 30
      var count = 0
      for (var i = 0; i < this.messages.length - keepCount; i++) {
        var m = this.messages[i]
        if (!m._compressed && m.content && typeof m.content === 'string' && m.content.length > 200) {
          m._originalContent = m.content
          m.content = m.content.substring(0, 150) + '... [📦 已压缩]'
          m._compressed = true
          m._expanded = false
          count++
        }
      }
      this.compressedCount = count
    },

    // ---- 聚焦输入框辅助方法 ----
    _removedFocus() {
      // 原生 DOM 方式：遍历所有可见的 textarea，找到主聊天框
      var self = this;
      setTimeout(function() {
        try {
          var tas = document.querySelectorAll('textarea');
          for (var i = 0; i < tas.length; i++) {
            var ta = tas[i];
            // 跳过 disabled/隐藏的 textarea
            if (ta.disabled) continue;
            if (ta.offsetParent === null) continue;
            if (ta.closest('.subchat-input-area')) continue;
            // 找到主聊天的 textarea
            ta.focus();
            return;
          }
        } catch(e) { console.error('[focus]', e); }
        // fallback: $refs
        try {
          if (self.$refs && self.$refs.chatInput) {
            self.$refs.chatInput.focus();
          }
        } catch(e) {}
      }.bind(this), 50);
      // 第二次尝试（100ms后，等 Vue 完成重绘）
      setTimeout(function() {
        try {
          var tas = document.querySelectorAll('textarea');
          for (var i = 0; i < tas.length; i++) {
            var ta = tas[i];
            if (ta.disabled) continue;
            if (ta.offsetParent === null) continue;
            if (ta.closest('.subchat-input-area')) continue;
            ta.focus();
            return;
          }
        } catch(e) {}
      }, 100);
    },
    _focusSubchatInput() {
      this.$nextTick(function() {
        try {
          if (this.$refs && this.$refs.subchatTextarea) {
            this.$refs.subchatTextarea.focus()
          }
        } catch(e) {}
      }.bind(this))
    },

    // ---- Main chat send (SSE streaming for CEO) ----
    async send() {
      if (!this.input.trim() && !this.files.length) return

      // Wait for loading files
      var loadingFiles = this.files.filter(function(f) { return f._loading })
      if (loadingFiles.length > 0) {
        var waitCount = 0
        while (loadingFiles.some(function(f) { return f._loading }) && waitCount < 50) {
          await new Promise(function(r) { setTimeout(r, 100) })
          waitCount++
        }
      }

      let text = this.input.trim()
      let imageData = null
      let textFiles = []

            // (长文本转附件在输入时自动处理，发送时不再截断)


      if (this.files.length) {
        this.files.forEach(f => {
          if (f.isImg && f.data) {
            if (!imageData) imageData = f.data.split(',')[1] || f.data
          } else if (f.data && !f.isImg) {
            let content = f.data
            if (f.data.startsWith('data:')) {
              content = f.data.split(',')[1] || f.data
              try { content = atob(content) } catch(e) {}
            }
            textFiles.push({ name: f.name, type: f.type, content: content.substring(0, 50000) })
          }
        })
      }

      var sendFiles = this.files.length ? this.files.map(function(f) { return { name: f.name, isImg: f.isImg, size: f.size, data: f.data } }) : null
      this.messages.push({ role: 'user', content: text, files: sendFiles, time: new Date().toISOString() })
      this.saveMessages()
      this.input = ''
      this.files = []
      this.$nextTick(this.scrollToBottom)

      // Non-CEO agents use simple API
      if (this.current && this.current.id !== 'ai_ceo') {
        this.loading = true
        try {
          const resp = await API.post('/api/chat', { agentId: this.current ? this.current.id : 'ai_ceo', message: text, image: imageData, files: textFiles })
          if (resp.reply) { this.messages.push({ role: 'assistant', content: resp.reply, time: new Date().toISOString() }); this.saveMessages() }
          else if (resp.error) { this.messages.push({ role: 'assistant', content: '错误: ' + resp.error, isError: true, time: new Date().toISOString() }); this.saveMessages() }
        } catch(e) {
          this.messages.push({ role: 'assistant', content: '网络错误: ' + e.message, isError: true, time: new Date().toISOString() })
          this.saveMessages()
        } finally {
          this.loading = false
          this.$nextTick(this.scrollToBottom)
          this._removedFocus()
          this
        }
        this._checkAndAutoClean()
        return
      }

      // CEO: SSE streaming
      this.loading = true
      this.streaming = true
      this.streamContent = ''
      var self = this

      try {
        const resp = await fetch('/api/chat/sse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'ai_ceo', message: text, image: imageData, files: textFiles, model: this.modelName })
        })

        if (!resp.ok) {
          var errText = await resp.text()
          self.messages.push({ role: 'assistant', content: '错误: ' + (errText || resp.statusText), isError: true, time: new Date().toISOString() })
          self.reportMessages.push({ role: 'assistant', content: '错误: ' + (errText || resp.statusText), time: new Date().toISOString() })
          self.saveMessages()
          self.streaming = false
          self.loading = false
          self.removeLastThinking()
          self.$nextTick(self.scrollToBottom)
          self._removedFocus()
          self
          return
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        var buffer = ''
        var finalReply = ''

        while (true) {
          var { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          var lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (var _l = 0; _l < lines.length; _l++) {
            var line = lines[_l].trim()
            if (!line || !line.startsWith('data: ')) continue
            var data
            try { data = JSON.parse(line.substring(6)) } catch(e) { continue }
            if (data.type === 'thinking') self.addThinkingMsg(data.content)
            else if (data.type === 'tool_call') { self.removeLastThinking(); self.addToolCall(data.name, data.args, data.summary) }
            else if (data.type === 'tool_result') self.updateLastToolCall(data.status, data.result)
            else if (data.type === 'file_read') { self.removeLastThinking(); self.addFileOp('read', data.path) }
            else if (data.type === 'file_write') { self.removeLastThinking(); self.addFileOp('write', data.path) }
            else if (data.type === 'message') { finalReply += data.content || ''; self.streamContent = finalReply }
            else if (data.type === 'done') { finalReply = data.reply || finalReply; self.streamContent = finalReply }
            self.$nextTick(self.scrollToBottom)
          }
        }

        if (finalReply) {
          self.messages.push({ role: 'assistant', content: finalReply, time: new Date().toISOString() })
          self.reportMessages.push({ role: 'assistant', content: finalReply, time: new Date().toISOString() })
          self.saveMessages()
        }
        // Smooth transition: keep streaming visible until msg rendered, then hide all
        self.$nextTick(function() {
          self.streaming = false
          self.loading = false
          self.removeLastThinking()
        })
        self.$nextTick(self.scrollToBottom)
        self._removedFocus()
        self
      } catch(e) {
        console.error('SSE error:', e)
        self.messages.push({ role: 'assistant', content: '网络错误: ' + e.message, isError: true, time: new Date().toISOString() })
        self.saveMessages()
        self.streaming = false
        self.loading = false
        self.removeLastThinking()
        self.$nextTick(self.scrollToBottom)
        self._removedFocus()
        self
      }
      this._checkAndAutoClean()
    },

    addToolCall(name, args, summary) {
      this.messages.push({ role: 'assistant', type: 'tool_call', toolName: name, args: args || {}, summary: summary || '', status: 'running', _expanded: true, time: new Date().toISOString() })
      this.saveMessages()
    },
    updateLastToolCall(status, result) {
      for (var i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].type === 'tool_call') { this.messages[i].status = status || 'done'; if (result) this.messages[i].result = result; break }
      }
    },
    addThinkingMsg(text) {
      this.messages.push({ role: 'assistant', type: 'thinking', content: text || '思考中...', time: new Date().toISOString() })
    },
    removeLastThinking() {
      for (var i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].type === 'thinking') { this.messages.splice(i, 1); break }
      }
    },
    addFileOp(op, path) {
      this.messages.push({ role: 'assistant', type: 'file_op', op: op, path: path, status: 'running', time: new Date().toISOString() })
      setTimeout(() => {
        for (var i = this.messages.length - 1; i >= 0; i--) {
          if (this.messages[i].type === 'file_op' && this.messages[i].op === op && this.messages[i].path === path) { this.messages[i].status = 'done'; break }
        }
      }, 500)
    },
    typewriterEffect(text) {
      var words = text.split('')
      var chunkSize = 3
      var idx = 0
      var msg = { role: 'assistant', content: '', time: new Date().toISOString() }
      this.messages.push(msg)
      msg = this.messages[this.messages.length - 1] /* get reactive proxy */
      this.saveMessages()
      var self = this
      function typeNext() {
        if (idx >= words.length) { msg.content = text; self.saveMessages(); self.$nextTick(self.scrollToBottom); self; return }
        var chunk = words.slice(idx, idx + chunkSize).join('')
        idx += chunkSize
        msg.content = (msg.content || '') + chunk
        self.$nextTick(self.scrollToBottom)
        var delay = chunk.match(/[，。！？；：\n]/) ? 50 : 15
        setTimeout(typeNext, delay)
      }
      typeNext()
    },

    // ---- Subchat (SSE streaming, same as main chat) ----
    async sendSubchat() {
      if (!this.subchatInput.trim() && !this.subchatFiles.length) return
      /* subchat defaults to CEO AI when no employee selected */

      var text = this.subchatInput.trim()
      var textFiles = []
      var imageData = null

            // (长文本转附件在输入时自动处理，发送时不再截断)


      if (this.subchatFiles.length) {
        this.subchatFiles.forEach(f => {
          if (f.isImg && f.data) {
            if (!imageData) imageData = f.data.split(',')[1] || f.data
          } else if (f.data && !f.isImg) {
            let content = f.data
            if (f.data.startsWith('data:')) { content = f.data.split(',')[1] || f.data; try { content = atob(content) } catch(e) {} }
            textFiles.push({ name: f.name, type: f.type, content: content.substring(0, 50000) })
          }
        })
      }

      this.subchatMessages.push({ role: 'user', content: text || '', files: this.subchatFiles.length ? this.subchatFiles.map(function(f) { return { name: f.name, isImg: f.isImg } }) : null, time: new Date().toISOString() })
      this.subchatInput = ''
      this.subchatFiles = []
      this.subchatLoading = true
      this.saveSubchatMessages()
      this.$nextTick(this.scrollSubchatToBottom)

      var self = this
      var agentId = this.current ? this.current.id : 'ai_ceo'

      // Non-CEO agents use simple API
      if (agentId !== 'ai_ceo') {
        try {
          const resp = await API.post('/api/chat', { agentId: agentId, message: text, image: imageData, files: textFiles })
          self.subchatMessages.push({ role: 'assistant', content: resp.reply || resp.response || resp.text || '(无响应)', time: new Date().toISOString() })
          self.saveSubchatMessages()
        } catch(e) {
          self.subchatMessages.push({ role: 'assistant', content: '错误: ' + e.message, isError: true, time: new Date().toISOString() })
          self.saveSubchatMessages()
        } finally {
          self.subchatLoading = false
          self.$nextTick(self.scrollSubchatToBottom)
          self.$nextTick(function() { try { self.$refs.subchatTextarea?.focus() } catch(e) {} })
        }
        return
      }

      // CEO: SSE streaming
      this.subchatLoading = true
      this.subchatStreaming = true
      this.subchatStreamContent = ''
      self.addSubchatThinking('AI CEO 正在分析副窗口问题')

      try {
        const resp = await fetch('/api/chat/sse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'ai_ceo', message: text, image: imageData, files: textFiles, model: this.modelName })
        })

        if (!resp.ok) {
          var errText = await resp.text()
          self.subchatMessages.push({ role: 'assistant', content: '错误: ' + (errText || resp.statusText), isError: true, time: new Date().toISOString() })
          self.saveSubchatMessages()
          self.subchatStreaming = false
          self.subchatLoading = false
          self.removeSubchatLastThinking()
          self.$nextTick(self.scrollSubchatToBottom)
          return
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        var buffer = ''
        var finalReply = ''

        while (true) {
          var { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          var lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (var _l = 0; _l < lines.length; _l++) {
            var line = lines[_l].trim()
            if (!line || !line.startsWith('data: ')) continue
            var data
            try { data = JSON.parse(line.substring(6)) } catch(e) { continue }
            if (data.type === 'thinking') self.addSubchatThinking(data.content)
            else if (data.type === 'tool_call') { self.removeSubchatLastThinking(); self.addSubchatToolCall(data.name, data.args, data.summary) }
            else if (data.type === 'tool_result') self.updateSubchatLastToolCall(data.status, data.result)
            else if (data.type === 'file_read') { self.removeSubchatLastThinking(); self.addSubchatFileOp('read', data.path) }
            else if (data.type === 'file_write') { self.removeSubchatLastThinking(); self.addSubchatFileOp('write', data.path) }
            else if (data.type === 'message') { finalReply += data.content || ''; self.subchatStreamContent = finalReply }
            else if (data.type === 'done') { finalReply = data.reply || finalReply; self.subchatStreamContent = finalReply }
            self.$nextTick(self.scrollSubchatToBottom)
          }
        }

        if (finalReply) {
          var msg = { role: 'assistant', content: finalReply, time: new Date().toISOString() }
          self.subchatMessages.push(msg)
          self.saveSubchatMessages()
        }
        // Smooth transition: keep streaming visible until msg rendered, then hide all
        self.$nextTick(function() {
          self.subchatStreaming = false
          self.subchatLoading = false
          self.removeSubchatLastThinking()
        })
        self.$nextTick(self.scrollSubchatToBottom)
        self.$nextTick(function() { try { self.$refs.subchatTextarea?.focus() } catch(e) {} })
      self._focusSubchatInput()
      } catch(e) {
        console.error('Subchat SSE error:', e)
        self.subchatMessages.push({ role: 'assistant', content: '网络错误: ' + e.message, isError: true, time: new Date().toISOString() })
        self.saveSubchatMessages()
        self.subchatStreaming = false
        self.subchatLoading = false
        self.removeSubchatLastThinking()
        self.$nextTick(self.scrollSubchatToBottom)
        self.$nextTick(function() { try { self.$refs.subchatTextarea?.focus() } catch(e) {} })
      }
    },
    async createAvatar() {
      var form = this.avatarForm
      if (!form.name.trim()) return
      try {
        var resp = await API.post('/api/employees', { name_cn: form.name.trim(), title: form.title.trim(), icon: form.icon || '🤖' })
        if (resp.ok && resp.agent) {
          this.messages.push({ role: 'system', content: '✅ 分身创建成功: ' + form.icon + ' ' + form.name.trim() + (form.title ? ' (' + form.title + ')' : ''), time: new Date().toISOString() })
          var self = this
          this.input = '请认识新同事 ' + (form.icon || '🤖') + ' ' + form.name.trim() + (form.title ? ' (' + form.title + ')' : '') + '，请分配任务和指导。'
          this
        } else {
          this.messages.push({ role: 'system', content: '❌ 创建失败: ' + (resp.error || '未知错误'), isError: true, time: new Date().toISOString() })
        }
      } catch(e) {
        this.messages.push({ role: 'system', content: '❌ 网络错误: ' + e.message, isError: true, time: new Date().toISOString() })
      }
      this.showCreateAvatar = false
      this.avatarForm = { name: '', title: '', icon: '🤖' }
      this.$nextTick(this.scrollToBottom)
    },
    updateSubchatLastToolCall(status, result) {
      for (var i = this.subchatMessages.length - 1; i >= 0; i--)
        if (this.subchatMessages[i].type === 'tool_call') {
          this.subchatMessages[i].status = status || 'done';
          if (result) this.subchatMessages[i].result = result;
          break;
        }
    },

    addSubchatThinking(text) {
      this.subchatMessages.push({ role: 'assistant', type: 'thinking', content: text || '思考中...', time: new Date().toISOString() })
    },

    removeSubchatLastThinking() {
      for (var i = this.subchatMessages.length - 1; i >= 0; i--)
        if (this.subchatMessages[i].type === 'thinking') {
          this.subchatMessages.splice(i, 1);
          break;
        }
    },

    addSubchatFileOp(op, path) {
      this.subchatMessages.push({ role: 'assistant', type: 'file_op', op: op, path: path, status: 'running', time: new Date().toISOString() })
      setTimeout((function() {
        for (var i = this.subchatMessages.length - 1; i >= 0; i--)
          if (this.subchatMessages[i].type === 'file_op') {
            this.subchatMessages[i].status = 'done';
            break;
          }
      }).bind(this), 2000)
    },

    addSubchatToolCall(name, args, summary) {
      this.subchatMessages.push({ role: 'assistant', type: 'tool_call', toolName: name, args: args || {}, summary: summary || '', status: 'running', _expanded: true, time: new Date().toISOString() })
      this.saveSubchatMessages()
    },

    showReportDetail(item) {
      if (item.details) {
        this.messages.push({ role: 'assistant', content: item.details, time: new Date().toISOString() })
        this.$nextTick(this.scrollToBottom)
      } else if (item.summary || item.text) {
        this.messages.push({ role: 'assistant', content: item.summary || item.text, time: new Date().toISOString() })
        this.$nextTick(this.scrollToBottom)
      }
    },

    onFileSelect(e) {
      var files = e.target.files
      if (files && files.length > 0) this.processFiles(files)
      e.target.value = ''
    },

    startRecording() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) { alert('浏览器不支持语音识别，请使用 Chrome/Edge'); return }
      this.recording = true
      var rec = new SR()
      rec.lang = 'zh-CN'
      rec.continuous = false
      rec.interimResults = false
      var self = this
      rec.onresult = function(e) {
        var transcript = e.results[0][0].transcript
        self.input = (self.input || '') + transcript
        self.recording = false
        self
      }
      rec.onerror = function(e) { console.error('Speech error:', e.error); self.recording = false }
      rec.onend = function() { self.recording = false }
      try { rec.start() } catch(e) { self.recording = false }
    },

    stopRecording() { this.recording = false },

    onFileDrop(e) {
      this.dragOver = false
      var files = e.dataTransfer.files
      if (files && files.length > 0) this.processFiles(files)
    },

    onPaste(e) {
      var items = e.clipboardData.items
      if (items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i]
          if (item.type.startsWith('image/') || item.kind === 'file') {
            var file = item.getAsFile()
            if (file) this.processFiles([file])
          }
        }
      }
    },

    processFiles(files) {
      Array.from(files).forEach(function(file) {
        if (file.size > 10 * 1024 * 1024) {
          alert('文件过大，最大支持 10MB: ' + file.name)
          return
        }
        var isImg = file.type.startsWith('image/')
        file._oid = Math.random()
        var blobUrl = URL.createObjectURL(file)
        this.files.push({ name: file.name, size: file.size, type: file.type, isImg: isImg, data: blobUrl, file: file, _oid: file._oid, _loading: true })
        var reader = new FileReader()
        reader.onload = function(e) {
          var idx = this.files.findIndex(function(f) { return f._oid === file._oid })
          if (~idx) { this.files[idx].data = e.target.result; this.files[idx]._loading = false }
        }.bind(this)
        if (isImg) reader.readAsDataURL(file)
        else if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|js|ts|vue|html|css|py|java|go|rs|sh|bat|ps1|yaml|yml|xml|sql|log|csv)$/i)) reader.readAsText(file)
        else reader.readAsDataURL(file)
      }, this)
    },

    removeFile(index) {
      this.files.splice(index, 1)
    },

    previewImg(data) {
      if (data && data.startsWith('data:')) {
        var w = window.open('')
        if (w) { w.document.write('<img src="' + data + '" style="max-width:100%;max-height:100vh" />'); return }
      }
      window.open(data, '_blank')
    },

    onSubchatPaste(e) {
      var items = e.clipboardData.items
      if (items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i]
          if (item.type.startsWith('image/') || item.kind === 'file') {
            var file = item.getAsFile()
            if (file) this.addSubchatFiles([file])
          }
        }
      }
    },

    onSubchatDrop(e) {
      e.preventDefault()
      e.stopPropagation()
      this.dragOver = false
      var files = e.dataTransfer.files
      if (files && files.length > 0) this.addSubchatFiles(files)
    },

    onSubchatFileSelect(e) {
      var files = e.target.files
      if (files && files.length > 0) this.addSubchatFiles(files)
      e.target.value = ''
    },

    addSubchatFiles(files) {
      Array.from(files).forEach(function(file) {
        if (file.size > 10 * 1024 * 1024) {
          alert('文件过大，最大支持 10MB: ' + file.name)
          return
        }
        var isImg = file.type.startsWith('image/')
        var blobUrl = URL.createObjectURL(file)
        this.subchatFiles.push({ name: file.name, size: file.size, type: file.type, isImg: isImg, data: blobUrl, file: file })
        var reader = new FileReader()
        reader.onload = function(e) {
          var idx = this.subchatFiles.findIndex(function(f) { return f.file === file })
          if (~idx) this.subchatFiles[idx].data = e.target.result
        }.bind(this)
        if (isImg) reader.readAsDataURL(file)
        else if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|js|ts|vue|html|css|py|java|go|rs|sh|bat|ps1|yaml|yml|xml|sql|log|csv)$/i)) reader.readAsText(file)
        else reader.readAsDataURL(file)
      }, this)
    },

    removeSubchatFile(index) {
      this.subchatFiles.splice(index, 1)
    },

    startSubchatRecording() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) { alert('浏览器不支持语音识别，请使用 Chrome/Edge'); return }
      this.subchatRecording = true
      var rec = new SR()
      rec.lang = 'zh-CN'
      rec.continuous = false
      rec.interimResults = false
      var self = this
      rec.onresult = function(e) {
        var transcript = e.results[0][0].transcript
        self.subchatInput = (self.subchatInput || '') + transcript
        self.subchatRecording = false
        self._focusSubchatInput()
      }
      rec.onerror = function(e) { console.error('Subchat speech error:', e.error); self.subchatRecording = false }
      rec.onend = function() { self.subchatRecording = false }
      try { rec.start() } catch(e) { self.subchatRecording = false }
    },

    stopSubchatRecording() { this.subchatRecording = false },

    scrollSubchatToBottom() {
      this.$nextTick(function() {
        var el = this.$refs && this.$refs.subchatMsgBox;
        if (el) el.scrollTop = el.scrollHeight;
      }.bind(this))
    },

    // === 副窗口消息持久化 ===
    _subchatKey() {
      return this.current ? 'subchat_' + this.current.id : 'subchat___ceo_main__'
    },
    _saveSubchatNow() {
      try { localStorage.setItem(this._subchatKey(), JSON.stringify(this.subchatMessages)) } catch(e) {}
    },
    saveSubchatMessages() {
      var self = this
      if (this._subchatSaveTimer) clearTimeout(this._subchatSaveTimer)
      this._subchatSaveTimer = setTimeout(function() { self._saveSubchatNow() }, 300)
    },
    loadSubchatMessages(agentId) {
      try {
        var key = 'subchat_' + (agentId || '__ceo_main__')
        var saved = localStorage.getItem(key)
        this.subchatMessages = saved ? JSON.parse(saved) : []
      } catch(e) { this.subchatMessages = [] }
    },
    // 输入时自动检测长文本并转为附件（不拦截发送）
    onInputChange(val, oldVal) {
      this._autoConvertLongText(val, 'files', 'input')
    },
    onSubchatInputChange(val, oldVal) {
      this._autoConvertLongText(val, 'subchatFiles', 'subchatInput')
    },
    _autoConvertLongText(text, filesKey, inputKey) {
      if (!text || text.length < 500 || this[filesKey].length > 0) return
      var blob = new Blob([text], {type: 'text/plain;charset=utf-8'})
      var summary = text.replace(/[\\/:*?"<>|]/g, '_').trim()
      if (summary.length > 40) summary = summary.substring(0, 40)
      var file = new File([blob], '消息_' + summary + '.txt', {type: 'text/plain;charset=utf-8'})
      var me = this
      var reader = new FileReader()
      reader.onload = function(e) {
        me[filesKey].push({ name: file.name, size: file.size, type: 'text/plain', isImg: false, data: e.target.result, file: file })
      }
      reader.readAsDataURL(file)
      me[inputKey] = ''
    },
    bubbleStyle(role) {
      if (role === 'user') {
        return {
          color: '#e0e7ff',
          background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
          borderBottomRightRadius: '4px',
          textAlign: 'left'
        }
      } else {
        return {
          color: '#1f2937',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderBottomLeftRadius: '4px',
          textAlign: 'left'
        }
      }
    },
    _loadActivities() {
      API.get("/api/activities").then(function(d) {
        if (d && d.activities) { this.activities = d.activities; }
      }.bind(this)).catch(function(e) { console.error("Activity load failed", e); });
      // 同时加载报告
      API.get("/api/v4/reports").then(function(d) {
        if (d && d.ok && d.reports) { this.reports = d.reports; }
      }.bind(this)).catch(function() {});
    },
    loadGoals() {
      API.get("/api/v4/goals").then(function(d) {
        if (d && d.ok && d.goals) { this.goals = d.goals; }
      }.bind(this)).catch(function() {});
    },
    createGoal() {
      var title = this.newGoalTitle.trim();
      if (!title) return;
      var desc = this.newGoalDesc.trim();
      API.post("/api/v4/goals", { title: title, description: desc }).then(function(d) {
        if (d && d.ok) {
          this.newGoalTitle = '';
          this.newGoalDesc = '';
          this.showAddGoal = false;
          this.loadGoals();
        }
      }.bind(this)).catch(function() {});
    },
    completeGoal(id) {
      fetch("/api/v4/goals/" + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) }).then(function(r){return r.json()}).then(function(d) {
        if (d && d.ok) this.loadGoals();
      }.bind(this)).catch(function() {});
    },
    togglePauseGoal(id) {
      fetch("/api/v4/goals/" + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) }).then(function(r){return r.json()}).then(function(d) {
        if (d && d.ok) this.loadGoals();
      }.bind(this)).catch(function() {});
    },
    resumeGoal(id) {
      fetch("/api/v4/goals/" + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) }).then(function(r){return r.json()}).then(function(d) {
        if (d && d.ok) this.loadGoals();
      }.bind(this)).catch(function() {});
    },
    deleteGoal(id) {
      fetch("/api/v4/goals/" + id, { method: 'DELETE' }).then(function(r){return r.json()}).then(function(d) {
        if (d && d.ok) this.loadGoals();
      }.bind(this)).catch(function() {});
    },
    clickGoal(g) {
      if (!g || !g.title) return;
      var text = '🎯 目标: ' + g.title;
      if (g.description) text += '\n' + g.description;
      if (g.note) text += '\n📌 ' + g.note;
      text += '\n状态: ' + (g.status === 'active' ? '进行中' : g.status === 'paused' ? '已暂停' : g.status === 'completed' ? '已完成' : g.status);
      this.messages.push({ role: 'assistant', content: text, time: new Date().toISOString() });
      this.$nextTick(this.scrollToBottom);
    },
    togglePause() {
      if (this.taskPaused) {
        API.post("/api/v4/tasks/resume").then(function(d) { if (d && d.ok) { this.taskPaused = false; } }.bind(this)).catch(function() {});
      } else {
        API.post("/api/v4/tasks/pause").then(function(d) { if (d && d.ok) { this.taskPaused = true; } }.bind(this)).catch(function() {});
      }
    },
    onModelChange() {
      var names = {}
      this.modelList.forEach(function(m) { names[m.value] = m.label })
      this.messages.push({ role: 'system', content: '🔄 ' + this.$t('chat.switched_to') + ' ' + (names[this.modelName] || this.modelName), time: new Date().toISOString(), isSystem: true })
      this.saveMessages()
      this.$nextTick(this.scrollToBottom)
    },
    async loadModelList() {
      try {
        var resp = await fetch('/api/router/config')
        if (resp.ok) {
          var data = await resp.json()
          if (data.models && Array.isArray(data.models)) {
            var list = []
            data.models.forEach(function(m) {
              var value = m.model
              var label = m.name || (m.provider + ' \u00b7 ' + m.model)
              list.push({ value: value, label: label })
            })
            if (list.length > 0) {
              this.modelList = list
            }
          }
        }
      } catch(e) {
        // Silently fail, keep defaults
      }
    },
    handleDrop(e) {
      this.dragOver = false
      var droppedFiles = e.dataTransfer.files
      if (droppedFiles.length) {
        for (var i = 0; i < droppedFiles.length; i++) {
          this.files.push(droppedFiles[i])
        }
      }
    },
    handlePasteFiles(e) {
      var pasted = e.target.files
      if (pasted.length) {
        for (var i = 0; i < pasted.length; i++) {
          this.files.push(pasted[i])
        
    }
        this.showPasteOverlay = false
      }
    },
    // ===== 团队工作台方法 =====
    loadDispatchStatus: function() {
      var self = this;
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/api/agent/dispatcher/status", true);
        xhr.onload = function() {
          if (xhr.status === 200) {
            try {
              var resp = JSON.parse(xhr.responseText);
              if (resp && resp.ok && resp.status) {
                self.dispatchStats = resp.status.stats;
                self.dispatchQueue = resp.status.queue || [];
                self.dispatchActive = resp.status.active || [];
                self.dispatchCompleted = resp.status.completed || [];
                var newStatus = {};
                for (var i = 0; i < self.employees.length; i++) {
                  newStatus[self.employees[i].id] = { status: "idle", taskTitle: "", elapsed: 0 };
                }
                for (var a = 0; a < self.dispatchActive.length; a++) {
                  var act = self.dispatchActive[a];
                  newStatus[act.agentId] = { status: "busy", taskTitle: act.title, elapsed: act.elapsed || 0 };
                }
                for (var q = 0; q < self.dispatchQueue.length; q++) {
                  var qItem = self.dispatchQueue[q];
                  if (newStatus[qItem.agentId] && newStatus[qItem.agentId].status === "idle") {
                    newStatus[qItem.agentId] = { status: "queued", taskTitle: qItem.title, elapsed: 0 };
                  }
                }
                self.teamStatus = newStatus;
              }
            } catch(e) { }
          }
        };
        xhr.onerror = function() { };
        xhr.send();
      } catch(e) { }
    },
    statusColor: function(status) {
      return status === "busy" ? "#10b981" : status === "queued" ? "#f59e0b" : "#94a3b8";
    },
    statusBg: function(status) {
      return status === "busy" ? "rgba(16,185,129,0.15)" : status === "queued" ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.15)";
    },
    statusFg: function(status) {
      return status === "busy" ? "#10b981" : status === "queued" ? "#f59e0b" : "#94a3b8";
    },
    statusLabel: function(statusObj) {
      if (!statusObj) return "";
      var s = typeof statusObj === "string" ? statusObj : statusObj.status;
      if (s === "idle") return "空闲";
      if (s === "busy") return "执行中";
      if (s === "queued") return "排队中";
      return s;
    }
  }
    

}
</script>

<style scoped>
/* === FORCE OVERRIDE: user and assistant bubble colors === */
.msg.user .msg-bubble {
  color: #e0e7ff !important;
  background: linear-gradient(135deg, #4f46e5, #3730a3) !important;
  border-bottom-right-radius: 4px !important;
}
.msg.assistant .msg-bubble {
  color: #1f2937 !important;
  background: #f3f4f6 !important;
  border: 1px solid #e5e7eb !important;
  border-bottom-left-radius: 4px !important;
}
/* Layout: force left/right alignment */
.msg.user {
  align-items: flex-end !important;
}
.msg.assistant {
  align-items: flex-start !important;
}

.chat-layout{display:flex;height:100%;position:relative;overflow:hidden;gap:0;background:transparent}.chat-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;flex-shrink:0;flex-wrap:wrap}.chi{font-size:22px;line-height:1}.chn{font-size:14px;font-weight:600;white-space:nowrap}.cht{font-size:11px;opacity:.7}.xl-badge{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:10px;font-weight:600;vertical-align:middle;animation:xlPulse 3s ease-in-out infinite}.xl-badge::before{content:'🐉'}.xl-badge span{display:none}@keyframes xlPulse{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.4)}50%{box-shadow:0 0 0 4px rgba(99,102,241,.1)}}.chat-main,.chat-main-col{flex:1;display:flex;flex-direction:column;min-width:0;position:relative;background:transparent}.chat-right-col{width:320px;min-width:320px;display:flex;flex-direction:column;border-left:1px solid var(--border-color,#e0e0e0);background:rgba(18,16,42,0.85);transition:width .3s ease,min-width .3s ease,opacity .3s ease;overflow:hidden}.chat-right-col.collapsed{width:0;min-width:0;opacity:0;border-left:none;padding:0}.chat-header{padding:12px 16px;border-bottom:1px solid var(--border-color,#e0e0e0);background:rgba(13,11,26,0.6)}.msg-box{flex:1;overflow-y:auto;padding:16px;background:transparent}.drag-overlay{position:absolute;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none}.chat-main{position:relative}.drag-hint{font-size:24px;color:#333;background:rgba(255,255,255,.9);padding:20px 40px;border-radius:12px;border:2px dashed #666}.file-preview{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px}.file-item{position:relative;display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-secondary,var(--bg3));border-radius:4px;font-size:12px}.file-remove-btn{position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;border:none;background:#ef4444;color:white;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}.input-area{padding:8px 16px;border-top:1px solid var(--border-color,#e0e0e0);background:rgba(13,11,26,0.4)}.input-row{display:flex;gap:8px}.chat-input{flex:1;resize:none;border:1px solid var(--border-color,#d0d0d0);border-radius:8px;padding:8px 12px;font-size:14px;outline:none;min-height:40px;max-height:120px;line-height:1.4;color:#e0e8f0}.chat-input::placeholder{color:#8894a8}.chat-input:focus{border-color:var(--accent,#4ecdc4)}.hint-text{font-size:11px;color:var(--fg3,#999);align-self:center}

/* === 按钮颜色按系统全局主色调搭配 === */
/* 背景 #1a1740 深紫，强调色 #4ecdc4 青绿，文字 #e0e0e0 */
.send-btn{background:var(--accent,#4ecdc4)!important;color:#0f0c29!important;border:none;border-radius:8px;width:40px;height:40px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0}.send-btn:disabled{background:#3a3760!important;color:#6b7294!important}.send-btn:hover:not(:disabled){filter:brightness(1.15)!important;box-shadow:0 2px 10px rgba(78,205,196,.35)!important}
.file-label{background:var(--bg3,#24224e)!important;border:1px solid var(--border,rgba(255,255,255,0.1))!important;border-radius:6px!important;cursor:pointer;font-size:18px;padding:4px 8px;line-height:1;display:inline-flex;align-items:center;gap:4px;color:var(--fg2,#8892b0)!important;transition:all .15s}.file-label:hover{background:#2d2a56!important;border-color:var(--accent,#4ecdc4)!important;color:var(--fg,#e0e0e0)!important}
.pause-btn{background:var(--bg3,#24224e)!important;border:1px solid var(--border,rgba(255,255,255,0.1))!important;border-radius:6px!important;padding:4px 8px;cursor:pointer;font-size:14px;color:var(--fg2,#8892b0)!important;display:inline-flex;align-items:center;gap:4px;transition:all .15s}.pause-btn:hover{background:#2d2a56!important;border-color:var(--accent,#4ecdc4)!important;color:var(--fg,#e0e0e0)!important}.pause-btn.paused{background:#2a2a1a!important;border-color:#b8860b!important;color:#ffd700!important}
.ws-notif-btn{background:var(--bg3,#24224e)!important;border:1px solid var(--border,rgba(255,255,255,0.1))!important;border-radius:6px!important;padding:4px 8px;cursor:default;font-size:12px;color:var(--fg2,#8892b0)!important;display:inline-flex;align-items:center;gap:4px}.ws-notif-btn.connected{background:#0d2d1a!important;border-color:var(--accent,#4ecdc4)!important;color:var(--accent,#4ecdc4)!important}.ws-notif-btn:not(.connected){background:var(--bg3,#24224e)!important;border-color:rgba(255,255,255,0.06)!important;color:var(--fg3,#6b7294)!important}
.compress-btn,.refresh-btn{background:var(--bg3,#24224e)!important;border:1px solid var(--border,rgba(255,255,255,0.1))!important;border-radius:6px!important;padding:4px 8px;cursor:pointer;font-size:14px;color:var(--fg2,#8892b0)!important;white-space:nowrap;line-height:1;transition:all .15s;display:inline-flex;align-items:center;gap:4px}.compress-btn:hover,.refresh-btn:hover{background:#2d2a56!important;border-color:var(--accent,#4ecdc4)!important;color:var(--fg,#e0e0e0)!important}.compress-btn:disabled{opacity:.3;cursor:not-allowed}
.create-avatar-btn{background:var(--accent,#4ecdc4)!important;color:#0f0c29!important;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}.create-avatar-btn:hover{filter:brightness(1.15)!important;box-shadow:0 2px 8px rgba(78,205,196,.3)!important}
.msg-copy-btn{opacity:0;transition:opacity .2s;background:var(--bg3,#24224e)!important;border:1px solid var(--border,rgba(255,255,255,0.08))!important;border-radius:4px;cursor:pointer;font-size:12px;padding:2px 5px;color:var(--fg2,#8892b0)!important;display:inline-flex;align-items:center;gap:3px}.msg:hover .msg-copy-btn{opacity:.7}.msg-copy-btn:hover{opacity:1!important;background:#2d2a56!important;border-color:var(--accent,#4ecdc4)!important}

/* ===== 消息布局与气泡卡片 ===== */
.msg{margin-bottom:16px;max-width:85%;position:relative;display:flex;flex-direction:column}
.msg.user{align-items:flex-end}
.msg.assistant{align-items:flex-start}
.msg.system{align-items:center;max-width:100%}

/* 气泡容器 - 宽度自适应 */
.msg-bubble{display:inline-block;position:relative;border-radius:12px;padding:10px 14px;max-width:100%;word-break:break-word;box-shadow:0 1px 3px rgba(0,0,0,.08)}

/* 用户消息气泡 - 绿色渐变 + 右下角尾巴 */
.msg.user .msg-bubble{background:linear-gradient(135deg,#4f46e5,#3730a3);color:#e0e7ff;border-bottom-right-radius:4px;box-shadow:0 2px 8px rgba(79,70,229,.25)}
.msg.user .msg-bubble::after{content:'';position:absolute;bottom:0;right:-6px;width:12px;height:12px;background:#3730a3;border-bottom-right-radius:4px;clip-path:polygon(0 0,100% 100%,0 100%)}

/* AI消息气泡 - 白色卡片 + 左下角尾巴 */
.msg.assistant .msg-bubble{background:#f3f4f6;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.msg.assistant .msg-bubble::after{content:'';position:absolute;bottom:0;left:-6px;width:12px;height:12px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;border-bottom-left-radius:4px;clip-path:polygon(100% 0,100% 100%,0 100%)}

/* 系统消息 - 居中灰条 */
.msg.system .msg-bubble{background:transparent;display:inline-block;box-shadow:none}
.msg.system .msg-text{background:var(--bg3,#ecedf3);color:var(--fg2,#585e7a);padding:6px 14px;border-radius:20px;font-size:12px;text-align:center;display:inline-block}

.msg-text{font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.msg-text.streaming-content{display:inline}

/* 时间戳对齐 */
.msg.user .msg-time{text-align:right}
.msg.assistant .msg-time{text-align:left}
.msg-time{font-size:11px;color:var(--fg3,#999);margin-top:4px;padding:0 4px}

/* 复制按钮 - 悬停显示 */


.report-section{margin:8px;padding:8px;background:var(--bg-primary,var(--bg2));border-radius:6px}.section-title{font-size:12px;font-weight:600;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-color,#e0e0e0)}.plan-card{padding:6px 8px;margin-bottom:6px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;font-size:12px;cursor:pointer}.progress-card{padding:6px 8px;margin-bottom:6px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:4px;font-size:12px;cursor:pointer}.report-card{padding:6px 8px;margin-bottom:6px;background:#ecfdf5;border-left:3px solid #10b981;border-radius:4px;font-size:12px;cursor:pointer}.other-card{padding:6px 8px;margin-bottom:6px;background:#fafafa;border-left:3px solid #9ca3af;border-radius:4px;font-size:12px;cursor:pointer}.long-text-indicator{font-size:11px;color:#f59e0b;padding:2px 8px;display:none}.long-text-indicator.show{display:block}.subchat-msg-box{flex:1;overflow-y:auto;padding:8px;font-size:12px}.subchat-msg{margin-bottom:6px;padding:4px 8px;border-radius:4px}.subchat-msg.user{text-align:right;background:rgba(78,205,196,0.08);color:var(--fg,var(--fg))}.subchat-msg.assistant{background:var(--bg-tertiary,var(--bg3))}.subchat-msg.system{text-align:center;font-size:11px;color:#888}.subchat-msg .msg-time{font-size:10px}.subchat-input-row{display:flex;gap:4px;padding:4px 8px}

/* History compression */
.compress-badge{font-size:11px;color:var(--fg3,#888);cursor:pointer;padding:2px 6px;background:var(--bg-secondary,var(--bg3));border-radius:4px;white-space:nowrap;margin-left:2px}
.compress-badge:hover{background:#e0e0e0}
.msg-compressed{max-width:85%;margin-bottom:12px;margin-right:auto;cursor:pointer}
.compress-header{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px 8px 4px 4px;font-size:12px;color:#f57f17}
.compress-icon{font-size:14px}
.compress-label{font-weight:500}
.compress-toggle{margin-left:auto;font-size:11px;color:#f9a825}
.compress-preview{opacity:.7;font-size:13px}

/* Right column layout */
.right-toggle{position:absolute;right:320px;top:50%;transform:translateY(-50%);z-index:20;width:24px;height:48px;border:1px solid var(--border-color,#e0e0e0);border-right:none;background:var(--bg-primary,var(--bg2));cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--fg2,#666);border-radius:4px 0 0 4px;transition:right .3s ease}
.right-toggle.collapsed{right:0}

/* Panels */
.panel{display:flex;flex-direction:column;overflow:hidden;flex-shrink:0}.employee-panel{flex:0 0 auto;max-height:45%;border-bottom:1px solid var(--border-color,#e0e0e0)}.employee-panel .emp-item:hover{background:var(--bg3)}.employee-panel .emp-item.active{background:var(--accent-transparent, rgba(99,102,241,0.1))}
.panel.goals-panel{border-bottom:1px solid var(--border-color,#e0e0e0);max-height:40%}.goals-panel .panel-body{overflow-y:auto}.goal-add-btn{background:var(--accent,#6366f1);color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;margin-left:auto;white-space:nowrap}.goal-card{padding:6px 8px;margin:4px 0;border-radius:6px;background:var(--bg2);border:1px solid var(--border-color,#e0e0e0);cursor:pointer;transition:background .15s}.goal-card:hover{background:var(--bg3)}.goal-card.completed{opacity:.6}.goal-row{display:flex;align-items:center;gap:4px;font-size:12px}.goal-status-icon{flex-shrink:0;font-size:14px}.goal-title{flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.goal-actions{display:flex;gap:2px;flex-shrink:0;opacity:0;transition:opacity .15s}.goal-card:hover .goal-actions{opacity:1}.goal-act-btn{background:none;border:none;cursor:pointer;font-size:13px;padding:1px 3px;line-height:1}.goal-act-btn:hover{opacity:.7}.goal-desc{font-size:11px;color:var(--fg2);padding:2px 0 0 18px}.goal-note{font-size:11px;color:var(--accent,#6366f1);padding:1px 0 0 18px}.goal-time{font-size:10px;color:var(--fg3);padding:2px 0 0 18px}
.panel.report-panel{flex:1;min-height:0}
.panel-header{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:13px;font-weight:600;background:var(--bg-primary,var(--bg2));border-bottom:1px solid var(--border-color,#e0e0e0);flex-shrink:0}
.panel-body{flex:1;overflow-y:auto;padding:8px;min-height:0}

/* Subchat */
.subchat-header{font-size:11px;padding:6px 12px;color:var(--fg3,#888);border-bottom:1px solid var(--border-color,#e0e0e0);flex-shrink:0}
.subchat-input-area{padding:6px 8px;border-top:1px solid var(--border-color,#e0e0e0);flex-shrink:0}

/* File preview */
.file-preview-wrap{display:flex;flex-wrap:wrap;gap:4px;padding:4px 8px;flex-shrink:0}
.file-preview-item{display:flex;align-items:center;gap:4px;padding:2px 6px;background:var(--bg-secondary,var(--bg3));border-radius:4px;font-size:11px;position:relative}
.file-preview-img{width:24px;height:24px;object-fit:cover;border-radius:3px}
.file-preview-name{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Chat actions bar */
.chat-actions{display:flex;align-items:center;gap:6px;padding:4px 0;flex-wrap:wrap;flex-shrink:0}
.file-count{font-size:11px;color:var(--fg3,#888)}
.subchat-item{font-size:10px}
.subchat-preview{background:var(--bg-primary,var(--bg2));border-bottom:1px solid var(--border-color,#e0e0e0)}
.msg-img-wrap{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;justify-content:flex-end}
.msg.user .msg-img-wrap{justify-content:flex-end}
.msg-img{max-width:260px;max-height:300px;border-radius:8px;cursor:pointer;object-fit:cover;border:1px solid var(--border-color,#e0e0e0);transition:opacity .2s}
.msg-img[src=""],.msg-img._err{display:none}

/* === 工作流路径/工具调用时间线 === */
.tool-call-card{background:var(--bg2);border:1px solid var(--border-color,#d0d0d0);border-radius:8px;overflow:hidden;margin:4px 0;position:relative}
.tool-call-card.status-running{border-color:var(--accent,#4ecdc4);box-shadow:0 0 0 1px var(--accent,#4ecdc4)}
.tool-call-card.status-done{border-color:var(--border-color,#d0d0d0)}
.tool-call-card.status-error{border-color:#ef4444}
.timeline-connector{height:16px;position:relative;left:20px;border-left:2px dashed var(--border-color,#ccc);margin-left:20px}
.tl-step-badge{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;margin-right:6px;border:2px solid transparent}
.tl-step-badge.step-running{border-color:var(--accent,#4ecdc4);background:rgba(78,205,196,.1)}
.tl-step-badge.step-done{border-color:#10b981;background:rgba(16,185,129,.1)}
.tl-step-badge.step-error{border-color:#ef4444;background:rgba(239,68,68,.1)}
.tool-call-header{display:flex;align-items:center;padding:6px 8px;cursor:pointer;gap:4px;user-select:none}
.tool-call-header:hover{background:rgba(0,0,0,.02)}
.tool-name{font-size:13px;font-weight:600;color:var(--fg);flex-shrink:0}
.tool-status{font-size:11px;color:var(--fg3);margin-left:auto;padding:0 4px}
.tool-status.status-running{color:var(--accent,#4ecdc4)}
.tool-status.status-done{color:#10b981}
.tool-status.status-error{color:#ef4444}
.tool-toggle{font-size:10px;color:var(--fg3);padding:0 2px;flex-shrink:0}
.tool-call-preview{padding:0 8px 6px 8px;display:flex;flex-direction:column;gap:2px}
.tool-preview-text{font-size:11px;color:var(--fg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tool-preview-result{font-size:10px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tool-call-body{padding:0 8px 6px 8px;border-top:1px solid var(--border-color,#e0e0e0)}
.tool-call-section{margin-top:6px}
.tl-section-label{font-size:10px;font-weight:600;color:var(--fg3);text-transform:uppercase;letter-spacing:.5px}
.tool-call-args{font-size:11px;color:var(--fg2);padding:2px 0;word-break:break-all}
.tool-call-result{font-size:11px;color:var(--fg);padding:4px 6px;background:rgba(16,185,129,.05);border-radius:4px;margin-top:2px;max-height:200px;overflow-y:auto;word-break:break-all;white-space:pre-wrap;font-family:monospace}
.tool-call-result.result-error{background:rgba(239,68,68,.05);color:#ef4444}
.source-code{font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.02);padding:4px 6px;border-radius:4px;max-height:200px;overflow-y:auto}

/* WS Notification bell & dropdown */
.ws-notif-area{position:relative;margin-left:auto;display:flex;align-items:center}
.ws-notif-btn{background:none;border:none;cursor:pointer;font-size:16px;padding:2px 6px;position:relative;opacity:.5;transition:opacity .2s}
.ws-notif-btn.connected{opacity:1}
.ws-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#ccc;margin-right:2px;vertical-align:middle}
.connected .ws-dot{background:#10b981}
.ws-notif-badge{position:absolute;top:-2px;right:-2px;background:#ef4444;color:#fff;font-size:9px;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center;padding:0 3px;font-weight:600;pointer-events:none}
.ws-notif-dropdown{position:absolute;top:100%;right:0;z-index:1000;background:var(--bg-card,#fff);border:1px solid var(--border-color,#ddd);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:280px;max-width:360px;max-height:400px;display:none;margin-top:4px}
.ws-notif-area:hover .ws-notif-dropdown{display:flex;flex-direction:column}
.ws-notif-header{padding:8px 12px;font-size:12px;font-weight:600;color:var(--fg);border-bottom:1px solid var(--border-color,#ddd)}
.ws-notif-list{flex:1;overflow-y:auto;max-height:340px}
.ws-notif-item{display:flex;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border-color,#eee);font-size:12px}
.ws-notif-item:last-child{border-bottom:none}
.ws-notif-icon{flex-shrink:0;font-size:14px;width:20px;text-align:center}
.ws-notif-body{flex:1;min-width:0}
.ws-notif-text{color:var(--fg);word-break:break-word;line-height:1.3}
.ws-notif-meta{font-size:10px;color:var(--fg3);margin-top:1px}
.ws-notif-empty{padding:16px;text-align:center;color:var(--fg3);font-size:12px}

.pause-btn{background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:0 6px;vertical-align:middle;opacity:.5}
.pause-btn:hover{opacity:1}
.pause-btn.paused{opacity:1;color:var(--accent)}
</style>
