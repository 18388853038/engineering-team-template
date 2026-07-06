<template>
  <div class="page">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <h2>🔗 {{ __('dagTitle') }}</h2>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="badge" v-if="blocked.length">⛔ {{ blocked.length }} {{ __('dagBlocked') }}</span>
        <span class="badge" v-if="cycle.hasCycle" style="background:rgba(239,68,68,0.15);color:#ef4444">⚠️ {{ __('dagCycle') }}</span>
        <button class="refresh-btn" @click="fetchDAG">↻ {{ __('dagRefresh') }}</button>
        <button class="refresh-btn" @click="recalculate">⟳ {{ __('dagRecalculate') }}</button>
      </div>
    </div>
    <p class="desc">{{ __('dagTopoOrder') }}: {{ topo.join(' → ') }}</p>

    <!-- Flow Chart (simple SVG-based) -->
    <div class="settings-section">
      <div class="dag-flow" ref="dagFlow">
        <!-- Dependency edges as SVG -->
        <svg class="dag-svg" :width="svgW" :height="svgH">
          <line v-for="(e,i) in edges" :key="'e'+i"
            :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
            :stroke="e.color" stroke-width="1.5" stroke-dasharray="4,2" />
        </svg>
        <!-- Task nodes -->
        <div v-for="(n,i) in layout" :key="n.id" class="dag-node"
          :style="{ left: n.x + 'px', top: n.y + 'px', borderColor: n.color }"
          @click="$router.push('/tasks')" :title="n.label">
          <div class="node-status-dot" :style="{background: n.color}"></div>
          <div class="node-label">{{ n.label.substring(0, 18) }}</div>
          <div class="node-status">{{ n.status }}</div>
        </div>
        <div v-if="!layout.length" class="empty-state" style="padding:40px;text-align:center">
          <p style="color:var(--fg3);font-size:12px">{{ __('dagNoData') }}</p>
        </div>
      </div>
    </div>

    <!-- Blocked Tasks -->
    <div class="settings-section" v-if="blocked.length">
      <h3>⛔ {{ __('dagBlockedTasks') }}</h3>
      <div v-for="b in blocked" :key="b.id" class="blocked-item">
        <span class="blocked-title">{{ b.title || b.id }}</span>
        <span class="blocked-by">{{ __('dagWaitingFor') }}: {{ b.blockedBy.map(bb => (bb.title || bb.id).substring(0,20)).join(', ') }}</span>
      </div>
    </div>

    <!-- Topological Order -->
    <div class="settings-section">
      <h3>📋 {{ __('dagExecOrder') }}</h3>
      <div class="topo-list">
        <div v-for="(id,i) in topo" :key="id" class="topo-item">
          <span class="topo-idx">{{ i+1 }}</span>
          <span class="topo-title">{{ nodeMap[id] ? nodeMap[id].label : id }}</span>
          <span class="topo-status" :style="{color: (nodeMap[id] && statusColor(nodeMap[id].status)) || '#6b7280'}">
            {{ nodeMap[id] ? nodeMap[id].status : '-' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'

const STATUS_COLORS = {
  'done': '#22c55e',
  'completed': '#22c55e',
  'approved': '#22c55e',
  'blocked': '#ef4444',
  'in_progress': '#3b82f6',
  'pending': '#eab308',
  'pending_approval': '#a855f7',
  'rejected': '#ef4444',
  'failed': '#ef4444',
  'escalated': '#f97316',
  'todo': '#6b7280'
}

export default {
  data() {
    return {
      nodes: [],
      edges: [],
      topo: [],
      blocked: [],
      cycle: { hasCycle: false, cyclePath: [] },
      nodeMap: {},
      layout: [],
      svgW: 800, svgH: 200
    }
  },
  mounted() {
    this.fetchDAG()
    window.addEventListener('resize', this.updateLayout)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.updateLayout)
  },
  methods: {
    async fetchDAG() {
      try {
        const d = await API.get('/api/harness/dag/graph')
        if (!d.ok) return
        this.nodes = d.graph.nodes || []
        this.edges = d.graph.edges || []
        this.topo = d.topologicalOrder || []
        this.blocked = d.blocked || []
        this.cycle = d.cycle || { hasCycle: false }
        
        // Build node map
        this.nodeMap = {}
        this.nodes.forEach(n => { this.nodeMap[n.id] = n })
        
        this.updateLayout()
      } catch(e) {}
    },
    async recalculate() {
      try {
        const d = await API.post('/api/harness/dag/recalculate')
        if (d.updates && d.updates.length > 0) {
          this.fetchDAG()
        }
      } catch(e) {}
    },
    updateLayout() {
      if (!this.nodes.length) return
      const container = this.$refs.dagFlow
      const w = (container && container.clientWidth) || 800
      this.svgW = w
      
      const NODE_W = 160, NODE_H = 50, GAP_X = 50, GAP_Y = 20
      const cols = Math.min(this.topo.length, Math.max(1, Math.floor(w / (NODE_W + GAP_X))))
      const rows = Math.ceil(this.topo.length / cols)
      
      this.svgH = Math.max(200, rows * (NODE_H + GAP_Y) + 40)
      
      // Position nodes by topological order
      const positions = {}
      this.topo.forEach((id, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions[id] = {
          x: col * (NODE_W + GAP_X) + 20,
          y: row * (NODE_H + GAP_Y) + 20
        }
      })
      
      // Build layout
      this.layout = this.topo.filter(id => positions[id]).map(id => {
        const node = this.nodeMap[id] || { label: id, status: 'unknown' }
        const pos = positions[id]
        return {
          id,
          label: node.label,
          status: node.status,
          color: STATUS_COLORS[node.status] || '#6b7280',
          x: pos.x,
          y: pos.y
        }
      })
      
      // Build edge lines
      this.edgeLines = this.edges.filter(e => positions[e.from] && positions[e.to]).map(e => {
        const from = positions[e.from]
        const to = positions[e.to]
        const fromColor = STATUS_COLORS[this.nodeMap[e.from] ? this.nodeMap[e.from].status : ''] || '#6b7280'
        return {
          x1: from.x + NODE_W / 2,
          y1: from.y + NODE_H,
          x2: to.x + NODE_W / 2,
          y2: to.y,
          color: fromColor
        }
      })
    },
    statusColor(s) { return STATUS_COLORS[s] || '#6b7280' }
  }
}
</script>

<style scoped>
.badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--bg2); color: var(--fg2); }
.refresh-btn {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-size: 12px; cursor: pointer;
}
.dag-flow {
  position: relative; min-height: 200px; overflow-x: auto; padding: 12px;
}
.dag-svg { position: absolute; top: 0; left: 0; pointer-events: none; }
.dag-node {
  position: absolute; width: 150px; padding: 6px 10px;
  border-radius: 8px; border: 2px solid; background: var(--bg2);
  cursor: pointer; transition: transform 0.2s;
  display: flex; flex-direction: column; gap: 2px;
  font-size: 11px;
}
.dag-node:hover { transform: scale(1.05); z-index: 10; }
.node-status-dot { width: 6px; height: 6px; border-radius: 50%; position: absolute; top: 6px; right: 6px; }
.node-label { font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-status { font-size: 10px; color: var(--fg3); }
.blocked-item {
  display: flex; gap: 8px; padding: 6px 0; font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.blocked-title { font-weight: 500; min-width: 120px; }
.blocked-by { color: #ef4444; font-size: 11px; }
.topo-list { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 0; }
.topo-item {
  display: flex; align-items: center; gap: 6px; padding: 3px 8px;
  border-radius: 4px; background: var(--bg2); font-size: 11px;
}
.topo-idx { color: var(--fg3); min-width: 16px; text-align: center; font-weight: 600; }
.topo-title { flex: 1; }
.topo-status { font-size: 10px; font-weight: 500; }
</style>
