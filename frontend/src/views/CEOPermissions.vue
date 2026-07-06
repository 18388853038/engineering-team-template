<template>
  <div class="ceo-permissions-page">
    <!-- 头部 -->
    <div class="header">
      <h1>👑 CEO 权限管理中心</h1>
      <div class="actions">
        <button @click="refresh" class="btn-secondary">🔄 刷新</button>
        <button @click="exportAudit" class="btn-secondary">📥 导出审计</button>
      </div>
    </div>

    <!-- CEO信息 -->
    <div class="ceo-info">
      <div class="ceo-avatar">👑</div>
      <div class="ceo-details">
        <h2>CEO - 人工智能首席执行官</h2>
        <p>负责公司战略决策、团队管理、资源分配</p>
      </div>
      <div class="ceo-stats">
        <div class="stat">
          <span class="value">{{ categories.length }}</span>
          <span class="label">权限分类</span>
        </div>
        <div class="stat">
          <span class="value">{{ totalPermissions }}</span>
          <span class="label">总权限数</span>
        </div>
        <div class="stat">
          <span class="value">{{ delegations.length }}</span>
          <span class="label">活跃委派</span>
        </div>
      </div>
    </div>

    <!-- 权限概览 -->
    <div class="overview-grid">
      <div v-for="cat in categories" :key="cat.id" class="overview-card" :class="'level-' + cat.level">
        <div class="card-header">
          <span class="card-icon">{{ getCategoryIcon(cat.id) }}</span>
          <span class="card-level" :class="'level-badge-' + cat.level">{{ cat.level }}</span>
        </div>
        <h3>{{ cat.name }}</h3>
        <p>{{ cat.description }}</p>
        <div class="card-footer">
          <span class="perm-count">{{ cat.permissionCount }} 项权限</span>
          <button @click="showCategory(cat)" class="btn-small">查看</button>
        </div>
      </div>
    </div>

    <!-- 标签页 -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">
        📊 权限概览
      </button>
      <button :class="{ active: activeTab === 'delegations' }" @click="activeTab = 'delegations'">
        🔗 委派管理
      </button>
      <button :class="{ active: activeTab === 'audit' }" @click="activeTab = 'audit'">
        📋 审计日志
      </button>
      <button :class="{ active: activeTab === 'commands' }" @click="activeTab = 'commands'">
        ⚡ CEO命令
      </button>
      <button :class="{ active: activeTab === 'roleskills' }" @click="loadRoleSkills">
        🎯 角色技能
      </button>
    </div>

    <!-- 权限概览内容 -->
    <div v-if="activeTab === 'overview'" class="tab-content">
      <div class="section">
        <h3>权限分类详情</h3>
        <div class="permission-tree">
          <div v-for="cat in categories" :key="cat.id" class="perm-category">
            <div class="category-header">
              <span class="cat-icon">{{ getCategoryIcon(cat.id) }}</span>
              <span class="cat-name">{{ cat.name }}</span>
              <span class="cat-count">{{ cat.permissionCount }} 项</span>
            </div>
            <div class="permission-list">
              <div v-for="perm in getPermissionsByCategory(cat.id)" :key="perm" class="perm-item">
                <span class="perm-name">{{ perm }}</span>
                <span class="perm-badge allowed">允许</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 委派管理 -->
    <div v-if="activeTab === 'delegations'" class="tab-content">
      <div class="section">
        <div class="section-header">
          <h3>🔗 权限委派</h3>
          <button @click="showDelegateModal = true" class="btn-primary">+ 新建委派</button>
        </div>

        <div v-if="delegations.length === 0" class="empty-state">
          <p>暂无活跃委派</p>
        </div>

        <div v-else class="delegation-list">
          <div v-for="del in delegations" :key="del.id" class="delegation-card">
            <div class="del-header">
              <span class="del-agent">{{ getAgentName(del.to) }}</span>
              <span class="del-perms">{{ del.permissions.length }} 项权限</span>
            </div>
            <div class="del-permissions">
              <span v-for="p in del.permissions.slice(0, 3)" :key="p" class="perm-tag">{{ p }}</span>
              <span v-if="del.permissions.length > 3" class="perm-more">+{{ del.permissions.length - 3 }}</span>
            </div>
            <div class="del-footer">
              <span class="del-expiry" v-if="del.expiresAt">
                到期: {{ formatDate(del.expiresAt) }}
              </span>
              <span class="del-expiry" v-else>永久有效</span>
              <div class="del-actions">
                <button @click="revokeDelegation(del.id)" class="btn-small btn-danger">撤销</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 审计日志 -->
    <div v-if="activeTab === 'audit'" class="tab-content">
      <div class="section">
        <h3>📋 审计日志</h3>
        <div class="audit-filters">
          <select v-model="auditFilter.agentId">
            <option value="">全部Agent</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.icon }} {{ agent.name_cn }}
            </option>
          </select>
          <input type="date" v-model="auditFilter.since" />
          <button @click="loadAudit" class="btn-secondary">筛选</button>
        </div>

        <div class="audit-list">
          <div v-for="entry in auditEntries" :key="entry.timestamp" class="audit-entry" :class="entry.result">
            <span class="audit-time">{{ formatDate(entry.timestamp) }}</span>
            <span class="audit-agent">{{ entry.agentName || entry.agentId }}</span>
            <span class="audit-perm">{{ entry.permission }}</span>
            <span class="audit-result" :class="entry.result">
              {{ entry.result === 'granted' ? '✅ 允许' : '❌ 拒绝' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- CEO命令 -->
    <div v-if="activeTab === 'commands'" class="tab-content">
      <div class="section">
        <h3>⚡ CEO快捷命令</h3>
        <div class="command-grid">
          <div class="command-card" @click="executeCommand('task.assign')">
            <div class="cmd-icon">📋</div>
            <div class="cmd-info">
              <h4>分配任务</h4>
              <p>将任务分配给指定Agent</p>
            </div>
          </div>
          <div class="command-card" @click="executeCommand('task.bulk')">
            <div class="cmd-icon">📦</div>
            <div class="cmd-info">
              <h4>批量分配</h4>
              <p>批量分配多个任务</p>
            </div>
          </div>
          <div class="command-card" @click="executeCommand('team.promote')">
            <div class="cmd-icon">⬆️</div>
            <div class="cmd-info">
              <h4>晋升员工</h4>
              <p>提升Agent职级</p>
            </div>
          </div>
          <div class="command-card" @click="executeCommand('team.fire')">
            <div class="cmd-icon">⬇️</div>
            <div class="cmd-info">
              <h4>降级员工</h4>
              <p>降低Agent职级</p>
            </div>
          </div>
          <div class="command-card emergency" @click="executeCommand('emergency.stop')">
            <div class="cmd-icon">🚨</div>
            <div class="cmd-info">
              <h4>紧急停止</h4>
              <p>停止所有操作</p>
            </div>
          </div>
          <div class="command-card" @click="executeCommand('audit')">
            <div class="cmd-icon">🔍</div>
            <div class="cmd-info">
              <h4>执行审计</h4>
              <p>全员审计检查</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 角色技能 -->
    <div v-if="activeTab === 'roleskills'" class="tab-content">
      <div class="section">
        <h3>🎯 角色技能配置</h3>
        <p class="section-desc">为每个Agent角色匹配合适的OpenClaw技能工具</p>
        
        <div v-if="roleSkillsLoading" class="loading">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>
        
        <div v-else class="role-skills-grid">
          <div v-for="role in roles" :key="role.id" class="role-skill-card">
            <div class="role-skill-header">
              <span class="role-icon">{{ getRoleIcon(role.id) }}</span>
              <div class="role-info">
                <h4>{{ role.id.toUpperCase() }}</h4>
                <p class="role-desc">{{ role.description }}</p>
              </div>
              <span class="skill-count">{{ role.skillCount }} 技能</span>
            </div>
            <div class="role-skill-categories">
              <div v-for="(skills, cat) in role.categories" :key="cat" class="skill-category">
                <span class="cat-label">{{ getCategoryName(cat) }}</span>
                <div class="cat-skills">
                  <span v-for="skill in skills" :key="skill" class="skill-badge" :title="getSkillDesc(skill)">
                    {{ getSkillIcon(skill) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h3>📦 可用技能库</h3>
        <div class="skills-categories-grid">
          <div v-for="(skills, cat) in allSkillsByCategory" :key="cat" class="skill-category-panel">
            <h4>{{ getCategoryName(cat) }}</h4>
            <div class="skill-list">
              <div v-for="skill in skills" :key="skill.id" class="skill-item">
                <span class="skill-icon">{{ skill.icon }}</span>
                <div class="skill-details">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-desc">{{ skill.desc }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 委派模态框 -->
    <div v-if="showDelegateModal" class="modal">
      <div class="modal-content">
        <h3>🔗 新建权限委派</h3>
        <div class="form-group">
          <label>委派给:</label>
          <select v-model="newDelegation.toAgentId">
            <option value="">选择Agent</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.icon }} {{ agent.name_cn }} - {{ agent.title }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>选择权限:</label>
          <div class="permission-checkboxes">
            <div v-for="cat in categories" :key="cat.id" class="perm-category-check">
              <h4>{{ cat.name }}</h4>
              <label v-for="perm in getPermissionsByCategory(cat.id)" :key="perm">
                <input type="checkbox" :value="perm" v-model="newDelegation.permissions" />
                {{ perm }}
              </label>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>到期时间:</label>
          <input type="datetime-local" v-model="newDelegation.expiresAt" />
        </div>
        <div class="form-group">
          <label>原因:</label>
          <input type="text" v-model="newDelegation.reason" placeholder="委派原因..." />
        </div>
        <div class="modal-actions">
          <button @click="showDelegateModal = false" class="btn-secondary">取消</button>
          <button @click="createDelegation" class="btn-primary">确认委派</button>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CEOPermissions',
  data() {
    return {
      categories: [],
      delegations: [],
      agents: [],
      auditEntries: [],
      activeTab: 'overview',
      loading: false,
      showDelegateModal: false,
      newDelegation: {
        toAgentId: '',
        permissions: [],
        expiresAt: '',
        reason: ''
      },
      auditFilter: {
        agentId: '',
        since: ''
      },
      totalPermissions: 0,
      roles: [],
      allSkillsByCategory: {},
      roleSkillsLoading: false
    }
  },
  async mounted() {
    await this.loadData()
  },
  methods: {
    async loadData() {
      this.loading = true
      try {
        await Promise.all([
          this.loadOverview(),
          this.loadDelegations(),
          this.loadAgents()
        ])
      } catch (e) {
        console.error('Failed to load data:', e)
      }
      this.loading = false
    },
    async loadOverview() {
      try {
        const res = await fetch('/api/ceo/overview')
        const data = await res.json()
        if (data.success) {
          this.categories = data.categories
          this.totalPermissions = data.totalPermissions
        }
      } catch (e) {
        console.error('Failed to load overview:', e)
      }
    },
    async loadDelegations() {
      try {
        const res = await fetch('/api/ceo/delegations')
        const data = await res.json()
        if (data.success) {
          this.delegations = data.delegations
        }
      } catch (e) {
        console.error('Failed to load delegations:', e)
      }
    },
    async loadAgents() {
      try {
        const res = await fetch('/api/agents')
        const data = await res.json()
        this.agents = Array.isArray(data) ? data : (data.agents || [])
      } catch (e) {
        console.error('Failed to load agents:', e)
      }
    },
    async loadAudit() {
      try {
        let url = '/api/ceo/audit?limit=50'
        if (this.auditFilter.agentId) url += `&agentId=${this.auditFilter.agentId}`
        if (this.auditFilter.since) url += `&since=${this.auditFilter.since}`
        
        const res = await fetch(url)
        const data = await res.json()
        if (data.success) {
          this.auditEntries = data.entries
        }
      } catch (e) {
        console.error('Failed to load audit:', e)
      }
    },
    getCategoryIcon(categoryId) {
      const icons = {
        STRATEGIC: '🎯',
        TASK_MANAGEMENT: '📋',
        TEAM_MANAGEMENT: '👥',
        RESOURCE: '💰',
        FINANCIAL: '💵',
        PERFORMANCE: '📊',
        EMERGENCY: '🚨',
        DELEGATION: '🔗',
        SYSTEM: '⚙️',
        COMPLIANCE: '✅'
      }
      return icons[categoryId] || '📌'
    },
    getPermissionsByCategory(categoryId) {
      const categoryMap = {
        'STRATEGIC': ['strategy.set', 'strategy.adjust', 'strategy.review', 'strategy.terminate', 'vision.define', 'mission.set'],
        'TASK_MANAGEMENT': ['task.create', 'task.assign', 'task.reassign', 'task.approve', 'task.reject', 'task.cancel', 'task.escalate', 'task.delegate', 'task.prioritize', 'task.bulk.assign', 'task.bulk.cancel'],
        'TEAM_MANAGEMENT': ['team.hire', 'team.fire', 'team.promote', 'team.demote', 'team.transfer', 'team.reorganize', 'team.monitor', 'team.training.assign', 'team.role.assign', 'team.permission.override'],
        'RESOURCE': ['resource.allocate', 'resource.reclaim', 'resource.budget.set', 'resource.budget.adjust', 'resource.compute.set', 'resource.storage.manage', 'resource.quota.set', 'resource.priority.set'],
        'FINANCIAL': ['finance.approve.expense', 'finance.approve.budget', 'finance.view.reports', 'finance.cost.analyze', 'finance ROI.calculate', 'finance.invest.approve'],
        'PERFORMANCE': ['performance.review', 'performance.reward', 'performance.penalty', 'performance.goal.set', 'performance.goal.track', 'performance.KPI.set', 'performance.ranking', 'performance.history.view'],
        'EMERGENCY': ['emergency.stop.all', 'emergency.kill.task', 'emergency.bypass', 'emergency.override', 'emergency.quarantine', 'emergency.restore', 'emergency.shutdown', 'emergency.maintenance'],
        'DELEGATION': ['delegate.to', 'delegate.revoke', 'delegate.view', 'delegate.approve', 'delegate.expire.set'],
        'SYSTEM': ['system.config', 'system.backup', 'system.restore', 'system.update', 'system.log.view', 'system.metric.view', 'system.health.check', 'system.debug'],
        'COMPLIANCE': ['compliance.audit', 'compliance.report', 'compliance.investigate', 'compliance.suspend', 'compliance.whitelist', 'compliance.blacklist']
      }
      return categoryMap[categoryId] || []
    },
    getAgentName(agentId) {
      const agent = this.agents.find(a => a.id === agentId)
      return agent ? `${agent.icon} ${agent.name_cn}` : agentId
    },
    showCategory(cat) {
      // 显示分类详情
      alert(`查看 ${cat.name} 的详细权限`)
    },
    async createDelegation() {
      if (!this.newDelegation.toAgentId || this.newDelegation.permissions.length === 0) {
        alert('请选择Agent和权限')
        return
      }
      try {
        const res = await fetch('/api/ceo/delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromAgentId: 'ai_ceo',
            toAgentId: this.newDelegation.toAgentId,
            permissions: this.newDelegation.permissions,
            expiresAt: this.newDelegation.expiresAt || null,
            reason: this.newDelegation.reason
          })
        })
        const data = await res.json()
        if (data.success) {
          this.showDelegateModal = false
          this.newDelegation = { toAgentId: '', permissions: [], expiresAt: '', reason: '' }
          await this.loadDelegations()
          alert('委派创建成功')
        }
      } catch (e) {
        console.error('Failed to create delegation:', e)
      }
    },
    async revokeDelegation(delegationId) {
      if (!confirm('确定要撤销这个委派吗？')) return
      try {
        const res = await fetch(`/api/ceo/delegate/${delegationId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAgentId: 'ai_ceo' })
        })
        const data = await res.json()
        if (data.success) {
          await this.loadDelegations()
          alert('委派已撤销')
        }
      } catch (e) {
        console.error('Failed to revoke delegation:', e)
      }
    },
    executeCommand(command) {
      const prompts = {
        'task.assign': '分配任务',
        'task.bulk': '批量分配任务',
        'team.promote': '晋升员工',
        'team.fire': '降级员工',
        'emergency.stop': '紧急停止',
        'audit': '执行审计'
      }
      alert(`执行命令: ${prompts[command]}\n\n功能开发中...`)
    },
    exportAudit() {
      alert('导出审计日志...')
    },
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    async refresh() {
      await this.loadData()
    },
    async loadRoleSkills() {
      if (this.roles.length > 0) return;
      this.roleSkillsLoading = true;
      try {
        const [rolesRes, catsRes] = await Promise.all([
          fetch('/api/role-skills/roles'),
          fetch('/api/role-skills/categories')
        ]);
        const rolesData = await rolesRes.json();
        const catsData = await catsRes.json();
        
        // Fetch categories for each role
        const rolesWithCategories = await Promise.all(
          (rolesData.roles || []).map(async (role) => {
            try {
              const skillRes = await fetch(`/api/role-skills/${role.id}/skills`);
              const skillData = await skillRes.json();
              // Use stats.categories for the category breakdown
              const categories = skillData.stats && skillData.stats.categories 
                ? skillData.stats.categories 
                : {};
              return { ...role, categories };
            } catch (e) {
              return { ...role, categories: {} };
            }
          })
        );
        
        this.roles = rolesWithCategories;
        this.allSkillsByCategory = catsData.categories || {};
      } catch (e) {
        console.error('Failed to load role skills:', e);
      }
      this.roleSkillsLoading = false;
    },
    getRoleIcon(roleId) {
      const icons = {
        ceo: '👑', cto: '🏗️', cfo: '💰', cmo: '📣', coo: '⚙️',
        director: '🎓', senior: '🔧', staff: '💻', fullstack: '🌐',
        junior: '📚', intern: '🌱'
      };
      return icons[roleId] || '👤';
    },
    getCategoryName(cat) {
      const names = {
        file: '📁 文件操作', search: '🔍 搜索', news: '📰 新闻资讯',
        document: '📄 文档办公', design: '🎨 设计', communication: '💬 沟通',
        development: '💻 开发', system: '⚙️ 系统', life: '🌤️ 生活',
        content: '🎬 内容', analytics: '📊 数据', ai: '🤖 AI智能'
      };
      return names[cat] || cat;
    },
    getSkillIcon(skillId) {
      const icons = {
        'file-skill': '📁', 'qclaw-text-file': '📄', 'online-search': '🔍',
        'multi-search-engine': '🌐', 'news-summary': '📰', 'tech-news-digest': '🚀',
        'docx': '📝', 'pptx': '📊', 'xlsx': '📈', 'pdf': '📑',
        'canvas-design': '🎨', 'frontend-design': '💻', 'email-skill': '📧',
        'tencent-docs': '☁️', 'tencent-meeting-mcp': '🎥', 'github-skill': '🐙',
        'qclaw-openclaw': '⚙️', 'qclaw-env': '🔧', 'find-skills': '🧰',
        'weather-advisor': '🌤️', 'content-factory': '🏭', 'analytics-dashboard': '📊',
        'market-researcher': '📈', 'idea-validator': '💡', 'note-organizer': '🗒️',
        'self-improving': '📈'
      };
      return icons[skillId] || '🔧';
    },
    getSkillDesc(skillId) {
      const descs = {
        'file-skill': '文件整理', 'qclaw-text-file': '文本处理',
        'online-search': '联网搜索', 'multi-search-engine': '多搜索引擎',
        'news-summary': '新闻摘要', 'tech-news-digest': '科技新闻',
        'docx': 'Word文档', 'pptx': 'PPT演示', 'xlsx': 'Excel表格',
        'pdf': 'PDF处理', 'canvas-design': '画布设计', 'frontend-design': '前端设计',
        'email-skill': '邮件收发', 'tencent-docs': '腾讯文档', 'github-skill': 'GitHub',
        'qclaw-openclaw': 'OpenClaw管理', 'qclaw-env': '环境配置', 'find-skills': '技能发现',
        'weather-advisor': '天气', 'content-factory': '内容工厂', 'analytics-dashboard': '数据看板',
        'market-researcher': '市场调研', 'idea-validator': '点子验证', 'note-organizer': '笔记',
        'self-improving': '自我提升'
      };
      return descs[skillId] || skillId;
    }
  }
}
</script>

<style scoped>
.ceo-permissions-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 24px;
  color: var(--text-primary);
}

.actions {
  display: flex;
  gap: 8px;
}

.ceo-info {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--bg2) 100%);
  border-radius: 16px;
  color: white;
  margin-bottom: 24px;
}

.ceo-avatar {
  font-size: 64px;
}

.ceo-details h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.ceo-details p {
  margin: 0;
  opacity: 0.9;
}

.ceo-stats {
  display: flex;
  gap: 24px;
  margin-left: auto;
}

.stat {
  text-align: center;
}

.stat .value {
  display: block;
  font-size: 28px;
  font-weight: bold;
}

.stat .label {
  font-size: 12px;
  opacity: 0.8;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.overview-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  border-left: 4px solid;
}

.overview-card.level-critical {
  border-left-color: var(--danger, #ef4444);
}

.overview-card.level-high {
  border-left-color: var(--warning, #f59e0b);
}

.overview-card.level-medium {
  border-left-color: var(--accent);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-icon {
  font-size: 24px;
}

.card-level {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.level-badge-critical { background: rgba(239,68,68,0.12); color: var(--danger, #ef4444); }
.level-badge-high { background: rgba(245,158,11,0.12); color: var(--warning, #f59e0b); }
.level-badge-medium { background: rgba(78,205,196,0.12); color: var(--accent); }

.overview-card h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.overview-card p {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.perm-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  padding: 4px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--fg2);
  cursor: pointer;
  font-size: 12px;
  border-radius: 8px;
  transition: all 0.2s;
  white-space: nowrap;
}

.tabs button:hover {
  color: var(--fg);
  background: rgba(255,255,255,0.04);
}

.tabs button.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(78,205,196,0.3);
}

.tab-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
}

.section h3 {
  margin: 0 0 16px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.permission-tree {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.perm-category {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cat-icon {
  font-size: 18px;
}

.cat-name {
  font-weight: bold;
  flex: 1;
}

.cat-count {
  color: var(--text-secondary);
  font-size: 12px;
}

.permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.perm-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-card);
  border-radius: 16px;
  font-size: 12px;
}

.perm-badge.allowed {
  color: var(--accent);
  font-size: 10px;
}

.delegation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.delegation-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
}

.del-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.del-agent {
  font-weight: bold;
}

.del-perms {
  color: var(--text-secondary);
  font-size: 12px;
}

.del-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.perm-tag {
  padding: 2px 8px;
  background: var(--bg-card);
  border-radius: 12px;
  font-size: 11px;
}

.perm-more {
  padding: 2px 8px;
  background: var(--primary-color);
  color: white;
  border-radius: 12px;
  font-size: 11px;
}

.del-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.del-expiry {
  font-size: 12px;
  color: var(--text-secondary);
}

.audit-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.audit-filters select,
.audit-filters input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.audit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.audit-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 13px;
}

.audit-entry.granted {
  border-left: 3px solid var(--accent);
}

.audit-entry.denied {
  border-left: 3px solid var(--danger, #ef4444);
}

.audit-time {
  color: var(--text-secondary);
  min-width: 140px;
}

.audit-agent {
  font-weight: bold;
  min-width: 100px;
}

.audit-perm {
  flex: 1;
  font-family: monospace;
}

.audit-result {
  font-size: 12px;
}

.audit-result.granted { color: var(--accent); }
.audit-result.denied { color: var(--danger, #ef4444); }

.command-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.command-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.command-card:hover {
  background: var(--primary-color);
  color: white;
}

.command-card.emergency {
  border: 2px solid var(--danger, #ef4444);
}

.cmd-icon {
  font-size: 28px;
}

.cmd-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.cmd-info p {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 20px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: bold;
  font-size: 14px;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.permission-checkboxes {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.perm-category-check {
  margin-bottom: 12px;
}

.perm-category-check h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--primary-color);
}

.perm-category-check label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-weight: normal;
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.btn-secondary:hover {
  color: #fff;
  border-color: var(--accent);
}

.btn-small {
  padding: 6px 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-small:hover {
  color: #fff;
  border-color: var(--accent);
}

.btn-danger {
  color: #f44336;
  border-color: var(--danger, #ef4444);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

/* 角色技能样式 */
.role-skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.role-skill-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.role-skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.role-skill-name {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-primary);
}

.skill-count {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-card);
  padding: 4px 8px;
  border-radius: 12px;
}

.role-skill-categories {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-category {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cat-icon {
  font-size: 14px;
}

.cat-name {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.cat-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}

.skill-badge {
  font-size: 12px;
  padding: 2px 6px;
  background: var(--bg-card);
  border-radius: 4px;
  color: var(--text-primary);
}

.skills-categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.skill-category-panel {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  background: var(--bg-card);
  border-radius: 8px;
}

.skill-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.skill-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skill-name {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-primary);
}

.skill-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
