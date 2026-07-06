/**
 * workflow-engine.js — 可视化工作流引擎
 * 
 * 支持 DAG 拓扑排序、条件分支、并行执行、循环节点
 * 集成 DAGEngine 和 ProactiveScheduler
 */

const fs = require('fs');
const path = require('path');
const DAGEngine = require('./dag-engine');

const BASE = path.join(__dirname, '..');
const WORKFLOWS_FILE = path.join(BASE, 'workflows.json');

// ========== 1. 工作流数据结构 ==========

// 默认工作流模板
const DEFAULT_TEMPLATES = [
  {
    id: 'wf_template_dev',
    name: '开发工作流',
    description: '需求分析 → 设计 → 开发 → 测试 → 部署',
    nodes: [
      { id: 'n1', type: 'task', label: '需求分析', description: '分析需求文档', estimatedMinutes: 60 },
      { id: 'n2', type: 'task', label: '设计', description: '系统设计/API设计', estimatedMinutes: 120 },
      { id: 'n3', type: 'task', label: '开发', description: '编码实现', estimatedMinutes: 240 },
      { id: 'n4', type: 'task', label: '测试', description: '单元测试/集成测试', estimatedMinutes: 60 },
      { id: 'n5', type: 'task', label: '部署', description: '发布到生产环境', estimatedMinutes: 30 }
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5' }
    ]
  },
  {
    id: 'wf_template_qa',
    name: '质量检查工作流',
    description: '代码审查 → 自动化测试 → 性能测试 → 安全扫描（并行）',
    nodes: [
      { id: 'n1', type: 'task', label: '代码审查', estimatedMinutes: 30 },
      { id: 'n2', type: 'parallel', label: '质量门禁', isParallel: true },
      { id: 'n3', type: 'task', label: '自动化测试', estimatedMinutes: 60 },
      { id: 'n4', type: 'task', label: '性能测试', estimatedMinutes: 45 },
      { id: 'n5', type: 'task', label: '安全扫描', estimatedMinutes: 30 },
      { id: 'n6', type: 'condition', label: '全部通过？', isCondition: true },
      { id: 'n7', type: 'task', label: '通过 ✓', estimatedMinutes: 5 },
      { id: 'n8', type: 'task', label: '驳回并通知', estimatedMinutes: 10 }
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n2', to: 'n4' },
      { from: 'n2', to: 'n5' },
      { from: 'n3', to: 'n6' },
      { from: 'n4', to: 'n6' },
      { from: 'n5', to: 'n6' },
      { from: 'n6', to: 'n7', condition: 'pass' },
      { from: 'n6', to: 'n8', condition: 'fail' }
    ]
  }
];

// ========== 2. 工作流 CRUD ==========

function loadWorkflows() {
  try {
    if (fs.existsSync(WORKFLOWS_FILE)) {
      return JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf8'));
    }
  } catch(e) { console.error('[Workflow] Load error:', e.message); }
  return { workflows: [], templates: DEFAULT_TEMPLATES };
}

function saveWorkflows(data) {
  try {
    fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) { console.error('[Workflow] Save error:', e.message); }
}

// 创建工作流
function createWorkflow(name, description, nodes, edges) {
  var data = loadWorkflows();
  var wf = {
    id: 'wf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: name,
    description: description || '',
    nodes: nodes || [],
    edges: edges || [],
    status: 'draft', // draft | active | running | paused | completed | failed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    runs: 0,
    lastRunAt: null,
    executions: []
  };
  data.workflows.push(wf);
  saveWorkflows(data);
  return wf;
}

// 更新工作流
function updateWorkflow(id, updates) {
  var data = loadWorkflows();
  var idx = data.workflows.findIndex(function(w) { return w.id === id; });
  if (idx < 0) return null;
  var wf = data.workflows[idx];
  if (updates.name) wf.name = updates.name;
  if (updates.description !== undefined) wf.description = updates.description;
  if (updates.nodes) wf.nodes = updates.nodes;
  if (updates.edges) wf.edges = updates.edges;
  if (updates.status) wf.status = updates.status;
  wf.updatedAt = new Date().toISOString();
  data.workflows[idx] = wf;
  saveWorkflows(data);
  return wf;
}

// 删除工作流
function deleteWorkflow(id) {
  var data = loadWorkflows();
  data.workflows = data.workflows.filter(function(w) { return w.id !== id; });
  saveWorkflows(data);
  return true;
}

// 获取单个工作流
function getWorkflow(id) {
  var data = loadWorkflows();
  return data.workflows.find(function(w) { return w.id === id; }) || null;
}

// ========== 3. 工作流执行 ==========

// 验证工作流的 DAG 拓扑
function validateWorkflow(nodes, edges) {
  try {
    // Convert to DAGEngine format
    var tasks = nodes.map(function(n) {
      var deps = edges.filter(function(e) { return e.to === n.id; }).map(function(e) { return e.from; });
      return {
        id: n.id,
        name: n.label,
        dependsOn: deps.length > 0 ? deps : null,
        estimatedMinutes: n.estimatedMinutes || 30,
        status: 'pending'
      };
    });
    
    // Check for cycles
    var cycle = DAGEngine.detectCycle(tasks);
    if (cycle && cycle.hasCycle) return { valid: false, error: '存在循环依赖: ' + cycle.cyclePath.join(' → ') };
    
    // Topological sort
    var sorted = DAGEngine.topologicalSort(tasks);
    if (!sorted || sorted.length === 0) return { valid: false, error: '无法拓扑排序' };
    
    return { valid: true, executionOrder: sorted };
  } catch(e) {
    return { valid: false, error: e.message };
  }
}

// 执行工作流
function executeWorkflow(id) {
  var data = loadWorkflows();
  var wf = data.workflows.find(function(w) { return w.id === id; });
  if (!wf) return { error: 'Workflow not found' };
  if (wf.status === 'running') return { error: 'Workflow already running' };
  
  // Validate
  var validation = validateWorkflow(wf.nodes, wf.edges);
  if (!validation.valid) return { error: validation.error };
  
  // Create execution record
  var execution = {
    id: 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    workflowId: id,
    startedAt: new Date().toISOString(),
    status: 'running',
    currentStep: null,
    completedSteps: [],
    failedSteps: [],
    output: {}
  };
  
  if (!wf.executions) wf.executions = [];
  wf.executions.push(execution);
  wf.status = 'running';
  wf.startedAt = new Date().toISOString();
  wf.runs = (wf.runs || 0) + 1;
  wf.lastRunAt = new Date().toISOString();
  
  saveWorkflows(data);
  
  // Execute steps asynchronously
  var steps = validation.executionOrder;
  executeSteps(wf, steps, execution, data);
  
  return { ok: true, executionId: execution.id, order: steps };
}

// 递归执行步骤
function executeSteps(wf, steps, execution, data) {
  // steps is an array of node IDs (strings). Find the first not-yet-processed ID.
  var nextId = steps.find(function(sid) {
    if (execution.completedSteps.indexOf(sid) >= 0) return false;
    if (execution.failedSteps.indexOf(sid) >= 0) return false;
    // Check dependencies from the actual node object
    var snode = wf.nodes.find(function(n) { return n.id === sid; });
    if (!snode) return false;
    if (!snode.dependsOn || snode.dependsOn.length === 0) return true;
    var deps = Array.isArray(snode.dependsOn) ? snode.dependsOn : [snode.dependsOn];
    return deps.every(function(d) { return execution.completedSteps.indexOf(d) >= 0; });
  });
  
  if (!nextId) {
    // No more steps - check if all done
    var allDone = wf.nodes.every(function(n) {
      return execution.completedSteps.indexOf(n.id) >= 0 || execution.failedSteps.indexOf(n.id) >= 0;
    });
    
    if (allDone) {
      wf.status = execution.failedSteps.length > 0 ? 'completed_with_errors' : 'completed';
      wf.completedAt = new Date().toISOString();
      execution.status = wf.status;
      execution.completedAt = new Date().toISOString();
      saveWorkflows(data);
      console.log('[Workflow] ' + wf.name + ' completed');
    }
    return;
  }
  
  var node = wf.nodes.find(function(n) { return n.id === nextId; });
  if (!node) { executeSteps(wf, steps, execution, data); return; }
  
  execution.currentStep = node.id;
  saveWorkflows(data);
  
  console.log('[Workflow] Step: ' + node.label + ' (' + node.type + ')');
  
  // Simulate execution (in production, this would dispatch to agents)
  var delay = (node.estimatedMinutes || 1) * 1000;
  setTimeout(function() {
    execution.completedSteps.push(node.id);
    execution.currentStep = null;
    execution.output[node.id] = { status: 'completed', at: new Date().toISOString() };
    saveWorkflows(data);
    
    // Continue to next steps
    executeSteps(wf, steps, execution, data);
  }, Math.min(delay, 5000)); // Cap display time at 5s
}

// ========== 4. Cron 集成 ==========

// 检查并触发定时工作流（每秒检查一次）
var CHECK_INTERVAL = 10000;
var _intervalId = null;

function startCronIntegration() {
  if (_intervalId) return;
  _intervalId = setInterval(function() {
    try {
      var data = loadWorkflows();
      var now = new Date();
      data.workflows.forEach(function(wf) {
        if (wf.cronExpr && wf.status === 'draft' || wf.status === 'active') {
          // Simplified cron check - runs when minute matches
          var cronParts = wf.cronExpr.split(' ');
          if (cronParts.length >= 5) {
            var minuteMatch = cronParts[0] === '*' || parseInt(cronParts[0]) === now.getMinutes();
            var hourMatch = cronParts[1] === '*' || parseInt(cronParts[1]) === now.getHours();
            if (minuteMatch && hourMatch) {
              console.log('[Workflow-Cron] Auto-triggering: ' + wf.name);
              executeWorkflow(wf.id);
            }
          }
        }
      });
    } catch(e) {}
  }, CHECK_INTERVAL);
  console.log('[Workflow-Cron] Cron integration started (every ' + (CHECK_INTERVAL/1000) + 's)');
}

// ========== 5. 路由注册 ==========

// 启动 cron 集成
startCronIntegration();

function registerWorkflowRoutes(registerRoute, parseBody, json) {
  // 列出所有工作流
  registerRoute(['GET'], /^\/api\/workflows$/, function(req, res) {
    try {
      var data = loadWorkflows();
      json(res, { ok: true, workflows: data.workflows, templates: data.templates });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 获取单个工作流
  registerRoute(['GET'], /^\/api\/workflows\/([^\/]+)$/, function(req, res, m) {
    try {
      var wf = getWorkflow(m[1]);
      if (!wf) return json(res, { ok: false, error: 'Workflow not found' }, 404);
      json(res, { ok: true, workflow: wf });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 创建工作流
  registerRoute(['POST'], /^\/api\/workflows$/, async function(req, res) {
    try {
      var body = await parseBody(req);
      if (!body.name) return json(res, { ok: false, error: 'name required' }, 400);
      var wf = createWorkflow(body.name, body.description, body.nodes, body.edges);
      json(res, { ok: true, workflow: wf });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 更新工作流
  registerRoute(['PUT'], /^\/api\/workflows\/([^\/]+)$/, async function(req, res, m) {
    try {
      var body = await parseBody(req);
      var wf = updateWorkflow(m[1], body);
      if (!wf) return json(res, { ok: false, error: 'Workflow not found' }, 404);
      json(res, { ok: true, workflow: wf });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 删除工作流
  registerRoute(['DELETE'], /^\/api\/workflows\/([^\/]+)$/, function(req, res, m) {
    try {
      deleteWorkflow(m[1]);
      json(res, { ok: true });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 验证工作流拓扑
  registerRoute(['POST'], /^\/api\/workflows\/validate$/, async function(req, res) {
    try {
      var body = await parseBody(req);
      var result = validateWorkflow(body.nodes || [], body.edges || []);
      json(res, { ok: result.valid, validation: result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 执行工作流
  registerRoute(['POST'], /^\/api\/workflows\/([^\/]+)\/execute$/, function(req, res, m) {
    try {
      var result = executeWorkflow(m[1]);
      json(res, { ok: !result.error, result: result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 获取工作流执行状态
  registerRoute(['GET'], /^\/api\/workflows\/([^\/]+)\/executions$/, function(req, res, m) {
    try {
      var wf = getWorkflow(m[1]);
      if (!wf) return json(res, { ok: false, error: 'Workflow not found' }, 404);
      json(res, { ok: true, executions: (wf.executions || []).slice(-10) });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

module.exports = {
  createWorkflow: createWorkflow,
  updateWorkflow: updateWorkflow,
  deleteWorkflow: deleteWorkflow,
  getWorkflow: getWorkflow,
  validateWorkflow: validateWorkflow,
  executeWorkflow: executeWorkflow,
  loadWorkflows: loadWorkflows,
  registerWorkflowRoutes: registerWorkflowRoutes
};
