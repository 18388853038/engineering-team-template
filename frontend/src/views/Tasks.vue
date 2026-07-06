<template>
  <div class="page" style="max-width:100%">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">📋 {{ __('tasksTitle') }} ({{ filtered.length }})</h2>
      <div style="display:flex;gap:6px">
        <button @click="ceoViewTasks" class="btn btn-ghost" style="font-size:11px;padding:6px 10px">🤖 {{ __('tasksCeoView') || 'CEO查看' }}</button>
        <button @click="ceoAssign" class="btn btn-primary" style="font-size:11px;padding:6px 10px">🤖 {{ __('tasksCeoAssign') || 'CEO智能分派' }}</button>
        <button @click="showCreate=!showCreate" class="btn btn-primary">+ {{ __('tasksNewTask') }}</button>
      </div>
    </div>

    <div v-if="ceoResult" class="ceo-result" style="margin-bottom:12px;padding:10px 14px;background:rgba(59,130,246,0.08);border-radius:8px;border:1px solid rgba(59,130,246,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><span style="font-weight:600">🤖 CEO</span><span style="color:var(--fg3);font-size:12px;margin-left:8px">{{ ceoResult.time || '' }}</span></div>
        <button @click="ceoResult=null" style="background:none;border:none;color:var(--fg3);cursor:pointer;font-size:16px">×</button>
      </div>
      <div style="margin-top:6px;font-size:13px;line-height:1.5;white-space:pre-wrap">{{ ceoResult.text }}</div>
    </div>

    <div class="task-filter">
      <button v-for="f in filters" :key="f.key" :class="{active:activeFilter===f.key}" @click="activeFilter=f.key" style="font-size:11px">{{ f.label }} ({{ f.count }})</button>
    </div>

    <!-- 新建任务 -->
    <div v-if="showCreate" class="settings-section" style="margin-bottom:16px">
      <h3>📝 {{ __('tasksNewTask') }}</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input v-model="newTask.title" :placeholder="__('tasksTaskTitle')" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:13px;outline:none">
        <textarea v-model="newTask.desc" :placeholder="__('tasksDescription')" rows="2" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px;outline:none;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select v-model="newTask.priority" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
            <option value="high">{{ __('tasksPriorityHigh') }}</option><option value="medium" selected>{{ __('tasksPriorityMedium') }}</option><option value="low">{{ __('tasksPriorityLow') }}</option>
          </select>
          <select v-model="newTask.assigneeId" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
            <option value="">{{ __('taskAutoAssign') }}</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name_cn }}</option>
          </select>
          <input v-model="newTask.deadline" type="date" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
          <button @click="createTask" :disabled="!newTask.title" class="btn btn-primary">✅ {{ __('tasksCreate') }}</button>
          <button @click="showCreate=false" class="btn btn-ghost">{{ __('tasksCancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 编辑任务 -->
    <div v-if="editingTask" class="settings-section" style="margin-bottom:16px">
      <h3>✏️ {{ __('tasksEdit') }}</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input v-model="editForm.title" :placeholder="__('tasksTaskTitle')" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:13px;outline:none">
        <textarea v-model="editForm.desc" :placeholder="__('tasksDescription')" rows="2" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px;outline:none;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select v-model="editForm.priority" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
            <option value="high">{{ __('tasksPriorityHigh') }}</option><option value="medium">{{ __('tasksPriorityMedium') }}</option><option value="low">{{ __('tasksPriorityLow') }}</option>
          </select>
          <select v-model="editForm.assigneeId" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
            <option value="">{{ __('taskUnassigned') }}</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name_cn }}</option>
          </select>
          <select v-model="editForm.status" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
            <option value="todo">{{ __('tasksStatusTodo') }}</option>
            <option value="in_progress">{{ __('tasksStatusInProgress') }}</option>
            <option value="done">{{ __('tasksStatusDone') }}</option>
            <option value="cancelled">{{ __('tasksStatusCancelled') }}</option>
          </select>
          <input v-model="editForm.deadline" type="date" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg);font-size:12px">
          <button @click="saveEdit" :disabled="!editForm.title" class="btn btn-primary">💾 {{ __('commonSave') }}</button>
          <button @click="editingTask=null" class="btn btn-ghost">{{ __('tasksCancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-if="!filtered.length" class="empty-state"><div class="icon">📋</div><p>{{ __('tasksNoTasks') }}</p></div>
    <div v-for="t in filtered" :key="t.id" class="task-item">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <h4>{{ t.title }}</h4>
          <div class="meta">
            <span>{{ getAssignee(t.assigneeId||t.assignee) || __('tasksUnassigned') }}</span>
            <span class="prio" :class="t.priority||'medium'">{{ {high:'🔴高',medium:'🟡中',low:'🟢低'}[t.priority] || '🟡中' }}</span>
            <span :style="{color:t.status==='done'||t.status==='completed'?'#22c55e':t.status==='escalated'?'#ef4444':'var(--fg2)'}">{{ statusLabel(t.status) }}</span>
            <span v-if="t.deadline" style="font-size:10px">📅 {{ t.deadline.slice(0,10) }}</span>
          </div>
          <div v-if="t.description" style="font-size:11px;color:var(--fg3);margin-top:4px">{{ t.description }}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-ghost" style="font-size:10px;padding:4px 8px" @click="editTask(t)">✏️</button>
          <button v-if="t.status==='todo'||t.status==='pending'" class="btn btn-ghost" style="font-size:10px;padding:4px 8px" @click="updateTaskStatus(t,'in_progress')">认领</button>
          <button v-if="t.status==='assigned'||t.status==='in_progress'" class="btn btn-primary" style="font-size:10px;padding:4px 8px" @click="updateTaskStatus(t,'done')">完成</button>
          <button class="btn btn-danger" style="font-size:10px;padding:4px 8px" @click="deleteTask(t)">×</button>
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
      tasks: [], agents: [], allTasks: [], activeFilter: 'all',
      showCreate: false,
      newTask: { title: '', desc: '', priority: 'medium', assigneeId: '', deadline: '' },
      editingTask: null,
      editForm: { title: '', desc: '', priority: 'medium', assigneeId: '', status: 'todo', deadline: '' },
      filters: [],
      ceoResult: null,
      ceoLoading: false
    }
  },
  computed: {
    filtered() {
      if (this.activeFilter === 'all') return this.allTasks
      if (this.activeFilter === 'done') return this.allTasks.filter(t => t.status === 'done' || t.status === 'completed')
      if (this.activeFilter === 'pending') return this.allTasks.filter(t => t.status === 'todo' || t.status === 'pending')
      if (this.activeFilter === 'in_progress') return this.allTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned')
      return this.allTasks.filter(t => t.status === this.activeFilter)
    }
  },
  methods: {
    statusLabel(s) {
      const map = { todo:'待处理', pending:'待处理', assigned:'已分配', in_progress:'进行中', done:'已完成', completed:'已完成', escalated:'已升级', cancelled:'已取消' }
      return map[s] || s || '未知'
    },
    getAssignee(id) {
      if (!id) return ''
      const a = this.agents.find(x => x.id === id)
      return a ? a.name_cn : id
    },
    async loadTasks() {
      const d = await API.get('/api/tasks')
      this.allTasks = (d.tasks || d || [])
      if (!Array.isArray(this.allTasks)) this.allTasks = []
      this.updateFilters()
    },
    updateFilters() {
      const counts = {}
      this.allTasks.forEach(t => {
        counts[t.status] = (counts[t.status] || 0) + 1
      })
      this.filters = [
        { key: 'all', label: '全部', count: this.allTasks.length },
        { key: 'pending', label: '待处理', count: (counts.todo||0)+(counts.pending||0) },
        { key: 'in_progress', label: '进行中', count: (counts.in_progress||0)+(counts.assigned||0) },
        { key: 'done', label: '已完成', count: (counts.done||0)+(counts.completed||0) },
      ]
    },
    // 使用 REST API 创建任务
    async createTask() {
      const t = this.newTask
      const r = await API.post('/api/tasks', {
        title: t.title,
        description: t.desc || '',
        priority: t.priority,
        assigneeId: t.assigneeId || null,
        deadline: t.deadline || null
      })
      if (r && r.task) {
        this.showCreate = false
        this.newTask = { title: '', desc: '', priority: 'medium', assigneeId: '', deadline: '' }
        this.loadTasks()
      }
    },
    // 打开编辑表单
    editTask(task) {
      this.editingTask = task
      this.editForm = {
        title: task.title,
        desc: task.description || '',
        priority: task.priority || 'medium',
        assigneeId: task.assigneeId || '',
        status: task.status || 'todo',
        deadline: task.deadline ? task.deadline.slice(0,10) : ''
      }
    },
    // 使用 REST API 保存编辑
    async saveEdit() {
      if (!this.editingTask) return
      const r = await API.put('/api/tasks/' + this.editingTask.id, {
        title: this.editForm.title,
        description: this.editForm.desc || '',
        priority: this.editForm.priority,
        assigneeId: this.editForm.assigneeId || null,
        status: this.editForm.status,
        deadline: this.editForm.deadline || null
      })
      if (r && r.task) {
        this.editingTask = null
        this.loadTasks()
      }
    },
    // 使用 REST API 更新任务状态
    async updateTaskStatus(task, status) {
      const r = await API.put('/api/tasks/' + task.id, { status: status })
      if (r && r.task) {
        this.loadTasks()
      }
    },
    // 使用 REST API 删除任务
    async deleteTask(task) {
      if (!confirm('确认删除任务「' + task.title + '」？')) return
      const r = await API.del('/api/tasks/' + task.id)
      if (r && r.message) {
        this.loadTasks()
      }
    },
    // CEO 智能查看任务
    async ceoViewTasks() {
      this.ceoLoading = true
      this.ceoResult = null
      try {
        const taskCount = this.allTasks.length
        const pending = this.allTasks.filter(t => t.status === 'todo' || t.status === 'pending').length
        const r = await API.post('/api/chat/ai_ceo', {
          message: '使用list_tasks列出所有任务，重点关注待处理和进行中的任务，给出任务分布概览'
        })
        this.ceoResult = { text: r.reply || '(无响应)', time: new Date().toLocaleTimeString() }
      } catch(e) {
        this.ceoResult = { text: 'CEO 暂时不可用: ' + e.message, time: new Date().toLocaleTimeString() }
      }
      this.ceoLoading = false
    },
    // CEO 智能分派待处理任务
    async ceoAssign() {
      this.ceoLoading = true
      this.ceoResult = null
      try {
        const pending = this.allTasks.filter(t => t.status === 'todo' || t.status === 'pending')
        if (pending.length === 0) {
          this.ceoResult = { text: '没有待处理的任务需要分派。', time: new Date().toLocaleTimeString() }
          this.ceoLoading = false
          return
        }
        const pendingBrief = pending.slice(0,5).map(t => t.title + '(' + (t.priority||'medium') + ')').join('、')
        const r = await API.post('/api/chat/ai_ceo', {
          message: '有 ' + pending.length + ' 个待处理任务：' + pendingBrief + '。请使用assign_task工具将这些任务分派给合适的团队成员（使用query_team查询人员后再派），直接执行'
        })
        this.ceoResult = { text: r.reply || '(无响应)', time: new Date().toLocaleTimeString() }
        this.loadTasks()
      } catch(e) {
        this.ceoResult = { text: 'CEO 暂时不可用: ' + e.message, time: new Date().toLocaleTimeString() }
      }
      this.ceoLoading = false
    }
  },
  mounted() {
    this.loadTasks()
    API.get('/api/agents').then(d => { if (d.agents) this.agents = d.agents })
  }
}
</script>