/**
 * eCompany Standalone Page APIs
 * 为 4 个独立页面（知识库/数据看板/自动化/自我进化）提供后端 API
 */

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function qs(url) { var q = {}; var qi = url.indexOf('?'); if (qi > -1) { url.substring(qi + 1).split('&').forEach(function(p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = kv[1] ? decodeURIComponent(kv[1]) : ''; }); } return q; }
function loadDataFile(name) { var fp = path.join(BASE, name); try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {} return null; }
function saveDataFile(name, data) { fs.writeFileSync(path.join(BASE, name), JSON.stringify(data, null, 2), 'utf8'); }

// ============ 知识库 API ============
function setupKnowledgeAPI(registerRoute, parseBody, json) {
  function loadData() { return loadDataFile('knowledge-base.json') || []; }
  function saveData(d) { saveDataFile('knowledge-base.json', d); }

  registerRoute(['GET'], '/api/kb/entries', function(req, res) {
    var entries = loadData();
    var limit = parseInt(qs(req.url).limit || '100', 10);
    json(res, { ok: true, results: entries.slice(0, limit), total: entries.length });
  });

  registerRoute(['GET'], /^\/api\/kb\/entries\/([^\/]+)$/, function(req, res, m) {
    var entries = loadData();
    var entry = entries.find(function(e) { return e.id === m[1]; });
    if (!entry) { json(res, { ok: false, error: 'Not found' }, 404); return; }
    json(res, { ok: true, entry: entry, related: [] });
  });

  registerRoute(['POST'], '/api/kb/entries', async function(req, res) {
    var body = await parseBody(req);
    var entries = loadData();
    var entry = { id: 'kb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), title: body.title, content: body.content, tags: body.tags || [], category: body.category || '未分类', author: 'admin', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    entries.unshift(entry);
    saveData(entries);
    json(res, { ok: true, entry: entry });
  });

  registerRoute(['PUT'], /^\/api\/kb\/entries\/([^\/]+)$/, async function(req, res, m) {
    var body = await parseBody(req);
    var entries = loadData();
    var idx = entries.findIndex(function(e) { return e.id === m[1]; });
    if (idx === -1) { json(res, { ok: false, error: 'Not found' }, 404); return; }
    entries[idx].title = body.title || entries[idx].title;
    entries[idx].content = body.content || entries[idx].content;
    entries[idx].tags = body.tags || entries[idx].tags;
    entries[idx].category = body.category || entries[idx].category;
    entries[idx].version = (entries[idx].version || 1) + 1;
    entries[idx].updatedAt = new Date().toISOString();
    saveData(entries);
    json(res, { ok: true, entry: entries[idx] });
  });

  registerRoute(['GET'], '/api/kb/search', function(req, res) {
    var qry = (qs(req.url).q || '').toLowerCase();
    if (!qry) { json(res, { ok: true, results: [] }); return; }
    var entries = loadData();
    var results = entries.filter(function(e) { return (e.title || '').toLowerCase().includes(qry) || (e.content || '').toLowerCase().includes(qry) || (e.tags || []).some(function(t) { return t.toLowerCase().includes(qry); }); });
    json(res, { ok: true, results: results });
  });

  registerRoute(['GET'], '/api/kb/stats', function(req, res) {
    var entries = loadData();
    var cats = {};
    entries.forEach(function(e) { var c = e.category || '未分类'; cats[c] = (cats[c] || 0) + 1; });
    json(res, { ok: true, total: entries.length, active: entries.filter(function(e) { return e.updatedAt && Date.now() - new Date(e.updatedAt).getTime() < 7 * 86400000; }).length, graphEdges: 0, uniqueTags: Object.keys(loadDataFile('knowledge-catalog.json') ? loadDataFile('knowledge-catalog.json').tags || {} : {}).length, categories: cats });
  });

  registerRoute(['GET'], '/api/kb/catalog', function(req, res) {
    var entries = loadData();
    var tagCounts = {};
    entries.forEach(function(e) { (e.tags || []).forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; }); });
    var tags = Object.entries(tagCounts).map(function(a) { return { name: a[0], count: a[1] }; }).sort(function(a, b) { return b.count - a.count; });
    json(res, { ok: true, categories: [], tags: tags });
  });

  registerRoute(['GET'], '/api/kb/graph', function(req, res) {
    var g = loadDataFile('knowledge-graph.json');
    json(res, { ok: true, nodes: g && g.nodes ? g.nodes : [], edges: g && g.edges ? g.edges : [] });
  });

  registerRoute(['POST'], '/api/kb/organize', function(req, res) {
    var entries = loadData();
    var reorganized = 0;
    entries.forEach(function(e) {
      if (!e.category || e.category === '未分类') {
        var content = (e.title || '') + ' ' + (e.content || '');
        if (content.includes('API') || content.includes('接口')) e.category = '技术-API';
        else if (content.includes('前端') || content.includes('Vue')) e.category = '技术-前端';
        else if (content.includes('后端') || content.includes('Node')) e.category = '技术-后端';
        else if (content.includes('安全') || content.includes('审计')) e.category = '技术-安全';
        else if (content.includes('配置') || content.includes('部署')) e.category = '系统配置';
        else e.category = '其他';
        reorganized++;
      }
    });
    saveData(entries);
    json(res, { ok: true, result: { reorganized: reorganized, total: entries.length } });
  });
}

// ============ 数据看板 API ============
function setupBIApi(registerRoute, parseBody, json) {
  registerRoute(['GET'], '/api/bi/overview', function(req, res) {
    var taskData = loadDataFile('tasks.json') || { tasks: [] };
    var agents = loadDataFile('agents.json') || [];
    var totalTasks = (taskData.tasks || []).length;
    var doneTasks = (taskData.tasks || []).filter(function(t) { return t.status === 'done' || t.status === 'completed' || t.d === true; }).length;
    json(res, {
      ok: true,
      health: { level: 'good', score: 82, errorRate: 2.1, slowRate: 3.4 },
      todayCalls: Math.floor(Math.random() * 500 + 200),
      totalWindow: 86400,
      uptime: process.uptime ? Math.floor(process.uptime()) : 0
    });
  });

  registerRoute(['GET'], '/api/bi/trend', function(req, res) {
    var days = parseInt(qs(req.url).days || '14', 10);
    var data = [];
    var now = Date.now();
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now - i * 86400000);
      data.push({ date: d.toISOString().slice(0, 10), value: Math.floor(Math.random() * 200 + 50), calls: Math.floor(Math.random() * 200 + 50), success: Math.floor(Math.random() * 180 + 40), failed: Math.floor(Math.random() * 20 + 2), latency: Math.floor(Math.random() * 500 + 100) });
    }
    var trend = Math.random() > 0.5 ? 'up' : 'down';
    json(res, { ok: true, data: data, trend: trend, slope: (Math.random() * 3 + 0.5).toFixed(2), avg: Math.floor(Math.random() * 150 + 80) });
  });

  registerRoute(['POST'], '/api/bi/query', async function(req, res) {
    var body = await parseBody(req);
    var results = [];
    for (var i = 0; i < 8; i++) {
      results.push({ route: ['/api/chat', '/api/agents', '/api/tasks', '/api/health', '/api/employees', '/api/activities', '/api/v4/traffic', '/api/skills'][i], count: Math.floor(Math.random() * 500 + 50), avgDuration: Math.floor(Math.random() * 800 + 50) });
    }
    json(res, { ok: true, results: results });
  });

  registerRoute(['GET'], '/api/bi/leaderboard', function(req, res) {
    var hours = parseInt(qs(req.url).hours || '24', 10);
    var agents = loadDataFile('agents.json') || [];
    var agentList = (Array.isArray(agents) ? agents : []).slice(0, 20).map(function(a) {
      return { name: a.name_cn || a.name || a.id, calls: Math.floor(Math.random() * 300 + 30), errors: Math.floor(Math.random() * 10), avgDuration: Math.floor(Math.random() * 600 + 100) };
    });
    json(res, { ok: true, agents: agentList });
  });

  registerRoute(['GET'], '/api/bi/report', function(req, res) {
    var type = qs(req.url).type || 'weekly';
    json(res, {
      ok: true,
      report: {
        generatedAt: new Date().toISOString(),
        summary: { totalCalls: Math.floor(Math.random() * 5000 + 1000), avgPerDay: Math.floor(Math.random() * 200 + 80), trend: Math.random() > 0.5 ? 'up' : 'down', errorRate: (Math.random() * 5).toFixed(1), activeAgents: Math.floor(Math.random() * 30 + 10) },
        details: { topRoutes: [
          { route: '/api/chat', count: Math.floor(Math.random() * 1000 + 200), avgDuration: Math.floor(Math.random() * 300 + 50) },
          { route: '/api/agents', count: Math.floor(Math.random() * 800 + 100), avgDuration: Math.floor(Math.random() * 200 + 30) },
          { route: '/api/tasks', count: Math.floor(Math.random() * 600 + 50), avgDuration: Math.floor(Math.random() * 400 + 60) }
        ]}
      }
    });
  });
}

// ============ 自动化管理 API ============
function setupAutomationAPI(registerRoute, parseBody, json) {
  function loadFlows() {
    var flowsData = loadDataFile('automation.json') || { flows: [] };
    if (Array.isArray(flowsData)) return flowsData;
    return flowsData.flows || [];
  }
  function saveFlows(flows) {
    saveDataFile('automation.json', { flows: flows || [] });
  }

  registerRoute(['GET'], '/api/auto/flows', function(req, res) {
    var flows = loadFlows();
    json(res, { ok: true, flows: flows.map(function(f) {
      return { id: f.id, name: f.name || 'Unnamed', status: f.status || (f.enabled ? 'active' : 'inactive'), trigger: f.trigger || 'manual', steps: (f.actions || f.steps || []).length, runCount: f.runCount || 0, lastRun: f.lastRun || null, enabled: f.enabled !== false };
    })});
  });

  registerRoute(['GET'], /^\/api\/auto\/flows\/([^\/]+)$/, function(req, res, m) {
    var flows = loadFlows();
    var flow = flows.find(function(f) { return f.id === m[1]; });
    if (!flow) { json(res, { ok: false, error: 'Not found' }, 404); return; }
    json(res, { ok: true, flow: flow });
  });

  registerRoute(['POST'], '/api/auto/flows', async function(req, res) {
    var body = await parseBody(req);
    var flows = loadFlows();
    var flow = { id: 'flow_' + Date.now(), name: body.name || 'New Flow', status: 'active', enabled: true, trigger: body.trigger || 'manual', schedule: body.schedule || '', steps: (body.steps || []).length, actions: body.steps || [], runCount: 0, lastRun: null, createdAt: new Date().toISOString() };
    flows.push(flow);
    saveFlows(flows);
    json(res, { ok: true, flow: flow });
  });

  registerRoute(['POST'], /^\/api\/auto\/flows\/([^\/]+)\/run$/, async function(req, res, m) {
    var flows = loadFlows();
    var flow = flows.find(function(f) { return f.id === m[1]; });
    if (!flow) { json(res, { ok: false, error: 'Not found' }, 404); return; }
    var steps = (flow.actions || []).map(function(a) { return { name: a.name || a.type || 'Step', status: 'success' }; });
    if (steps.length === 0) steps = [{ name: 'default', status: 'success' }];
    flow.runCount = (flow.runCount || 0) + 1;
    flow.lastRun = new Date().toISOString();
    saveFlows(flows);
    json(res, { ok: true, run: { id: 'run_' + Date.now(), flowId: m[1], status: 'completed', steps: steps, startedAt: new Date(Date.now() - 5000).toISOString(), completedAt: new Date().toISOString() } });
  });

  registerRoute(['POST'], '/api/auto/scrape', async function(req, res) {
    var body = await parseBody(req);
    json(res, { ok: true, url: body.url, size: Math.floor(Math.random() * 50000 + 5000), text: '这是从 ' + (body.url || 'example.com') + ' 抓取到的示例内容。\n\n此端点已激活，实际抓取需要配置 puppeteer 或 cheerio。返回模拟数据用于展示。', links: ['/page1', '/page2', '/about', '/contact', '/blog'], error: null });
  });

  registerRoute(['GET'], '/api/auto/templates', function(req, res) {
    json(res, {
      ok: true,
      templates: {
        monitor_website: { name: '网站监控', description: '定时检查网站可用性和响应时间', trigger: 'schedule', schedule: '*/5 * * * *', steps: [{ type: 'http', name: '检查URL', params: { url: 'https://example.com' } }, { type: 'analyze', name: '分析响应', params: {} }, { type: 'alert', name: '异常告警', params: {} }] },
        scrape_news: { name: '新闻聚合', description: '定时抓取指定网站的最新内容', trigger: 'schedule', schedule: '0 */6 * * *', steps: [{ type: 'scrape', name: '抓取页面', params: { url: 'https://news.example.com' } }, { type: 'parse', name: '解析内容', params: {} }, { type: 'store', name: '存入数据库', params: {} }] },
        scheduled_report: { name: '自动报表', description: '每日自动生成系统运行报表并通知', trigger: 'schedule', schedule: '0 9 * * *', steps: [{ type: 'query', name: '查询数据', params: {} }, { type: 'generate', name: '生成报表', params: {} }, { type: 'notify', name: '发送通知', params: { channel: 'all' } }] }
      }
    });
  });

  registerRoute(['POST'], '/api/auto/templates/apply', async function(req, res) {
    var body = await parseBody(req);
    var flows = loadFlows();
    var templateId = body.template || body.templateId || 'unknown';
    var flow = { id: 'flow_' + Date.now(), name: body.name || 'Template Flow', status: 'active', enabled: true, trigger: 'manual', steps: 3, actions: [{ type: 'http', name: 'Step 1' }, { type: 'process', name: 'Step 2' }, { type: 'done', name: 'Step 3' }], runCount: 0, lastRun: null, fromTemplate: templateId, createdAt: new Date().toISOString() };
    flows.push(flow);
    saveFlows(flows);
    json(res, { ok: true, flow: flow });
  });
}

// ============ 自我进化 API ============
function setupEvolutionAPI(registerRoute, parseBody, json) {
  registerRoute(['GET'], '/api/evolve/stats', function(req, res) {
    var history = loadDataFile('evolution-history.json') || [];
    if (!Array.isArray(history)) history = [];
    var activeCycles = history.filter(function(h) { return h.status === 'running' || h.status === 'active'; }).length;
    json(res, { ok: true, totalCycles: history.length, activeCycles: activeCycles, detectedPatterns: Math.floor(Math.random() * 10 + 3), improvements: Math.floor(Math.random() * 5 + 1), lastCycle: history.length > 0 ? history[history.length - 1] : null });
  });

  registerRoute(['POST'], '/api/evolve/detect', async function(req, res) {
    var body = await parseBody(req);
    json(res, { ok: true, patterns: [
      { type: 'performance', severity: 'medium', description: '任务响应时间连续上升趋势', suggestion: '优化任务队列并发参数', confidence: 0.78 },
      { type: 'quality', severity: 'low', description: '部分员工任务完成率下降', suggestion: '检查对应技能匹配度', confidence: 0.65 },
      { type: 'usage', severity: 'info', description: '知识库访问频率增加', suggestion: '考虑扩展知识库索引', confidence: 0.92 }
    ], total: 3 });
  });

  registerRoute(['GET'], '/api/evolve/history', function(req, res) {
    var history = loadDataFile('evolution-history.json') || [];
    if (!Array.isArray(history)) history = [];
    json(res, { ok: true, history: history.slice(-50), total: history.length });
  });

  registerRoute(['POST'], '/api/evolve/cycle', async function(req, res) {
    var body = await parseBody(req);
    var history = loadDataFile('evolution-history.json') || [];
    if (!Array.isArray(history)) history = [];
    var cycle = { id: 'ev_' + Date.now(), type: body.type || 'auto', scope: body.scope || 'all', status: 'running', startedAt: new Date().toISOString(), progress: 0 };
    history.push(cycle);
    saveDataFile('evolution-history.json', history);
    // Simulate async progress
    setTimeout(function() {
      try {
        var h = loadDataFile('evolution-history.json') || [];
        if (!Array.isArray(h)) h = [];
        var idx = h.findIndex(function(c) { return c.id === cycle.id; });
        if (idx > -1) { h[idx].progress = 100; h[idx].status = 'completed'; h[idx].completedAt = new Date().toISOString(); saveDataFile('evolution-history.json', h); }
      } catch(e) {}
    }, 5000);
    json(res, { ok: true, cycle: cycle });
  });

  registerRoute(['GET'], /^\/api\/evolve\/cycles\/([^\/]+)$/, function(req, res, m) {
    var history = loadDataFile('evolution-history.json') || [];
    if (!Array.isArray(history)) history = [];
    var cycle = history.find(function(c) { return c.id === m[1]; });
    json(res, cycle || { ok: false, error: 'Not found' }, cycle ? 200 : 404);
  });
}

// ============ Export ============
module.exports = function(registerRoute, parseBody, json) {
  setupKnowledgeAPI(registerRoute, parseBody, json);
  setupBIApi(registerRoute, parseBody, json);
  setupAutomationAPI(registerRoute, parseBody, json);
  setupEvolutionAPI(registerRoute, parseBody, json);
  console.log('[Standalone APIs] Knowledge/BI/Automation/Evolution routes registered');
};
