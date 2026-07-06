/**
 * 主动任务调度器 - 守护进程版 v2
 * 自动健康检查、P95监控、系统摸底，发现异常通知CEO
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const TASKS_FILE = path.join(__dirname, '..', 'tasks.json');
const BASELINE_FILE = path.join(__dirname, '..', 'data', 'scheduler-baseline.json');
const ALERT_FILE = path.join(__dirname, '..', 'data', 'scheduler-alerts.json');
const HEARTBEAT_TIMEOUT = 180000;
const MAX_ALERTS = 100;

// ===== 告警累积计数器（连续N次同一告警才触发） =====
var BREACH_COUNTERS = {};
// ===== 子代理唤醒节流（防止并发过多AI请求） =====
var lastWakeTime = {};
function checkBreach(key, isFailing) {
  if (!BREACH_COUNTERS[key]) BREACH_COUNTERS[key] = 0;
  if (isFailing) {
    BREACH_COUNTERS[key]++;
    return BREACH_COUNTERS[key] >= 3;
  } else {
    BREACH_COUNTERS[key] = 0;
    return false;
  }
}

// 内置任务规则
const BUILTIN_TASKS = {
  health_check: {
    name: '健康检查',
    intervalMs: 30 * 60 * 1000,  // 每30分钟
    dayOnly: true,                // 06:00-23:59
    thresholds: {
      cpuPct: 90,
      memPct: 85,
      bridgeAlive: true
    }
  },
  p95_monitor: {
    name: 'P95延迟监控',
    intervalMs: 5 * 60 * 1000,   // 每5分钟
    dayOnly: true,
    thresholds: {
      p95Ms: 2000
    }
  },
  nightly_audit: {
    name: '全系统摸底',
    cron: '0 3 * * *',           // 每天03:00
    dayOnly: false
  },
  quiet_p95: {
    name: '夜间P95监控',
    intervalMs: 30 * 60 * 1000,  // 每30分钟（午夜降低频率）
    nightOnly: true               // 00:00-05:59
  }
};

var tasks = [];
var timer = null;
var running = false;
var lastRun = null;
var cycles = 0;
var builtinSchedule = {};

// ===== 初始化时注入内置任务 =====
function initBuiltinTasks() {
  Object.keys(BUILTIN_TASKS).forEach(function(key) {
    var cfg = BUILTIN_TASKS[key];
    var j = addJob({
      name: key + ':' + cfg.name,
      type: 'builtin',
      config: cfg
    });
    builtinSchedule[key] = j.job || { lastRun: null, runs: 0 };
  });
}
initBuiltinTasks();

// ===== httpPost 工具 =====
function httpPost(host, port, pathname, body) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var opts = {
      hostname: host, port: port,
      path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000
    };
    var req = http.request(opts, function(res) {
      var d = ''; res.on('data', function(c) { d += c; });
      res.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    });
    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

// ===== 基线管理 =====
function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8')); }
  catch(e) { return null; }
}
function saveBaseline(data) {
  try {
    if (!fs.existsSync(path.dirname(BASELINE_FILE))) fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch(e) { console.error('[Scheduler] baseline save error:', e.message); }
}
function loadAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERT_FILE, 'utf-8')); }
  catch(e) { return []; }
}
function saveAlert(alert) {
  try {
    var alerts = loadAlerts();
    alerts.push(Object.assign({ id: 'alert_' + Date.now(), createdAt: new Date().toISOString() }, alert));
    if (alerts.length > MAX_ALERTS) alerts = alerts.slice(alerts.length - MAX_ALERTS);
    if (!fs.existsSync(path.dirname(ALERT_FILE))) fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true });
    fs.writeFileSync(ALERT_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
  } catch(e) { console.error('[Scheduler] alert save error:', e.message); }
}

// ===== 健康检查执行 =====
function doHealthCheck() {
  var result = { status: 'ok', issues: [], bridges: {}, memory: {}, cpu: {} };
  // 检查桥接进程
  var bridgeNames = ['feishu','dingtalk','qqbot','wechat','wecom','telegram','whatsapp','discord','slack'];
  bridgeNames.forEach(function(k) {
    try {
      var g = global['__' + k + 'Bridge'];
      var alive = g && g.exitCode === null && g.killed === false;
      result.bridges[k] = alive;
      // 桥接检测: 连续3次未存活才标记异常,避免启动时序误报
      if (!alive) {
        if (checkBreach('bridge_' + k, true)) {
          result.issues.push({ type: 'bridge_down', target: k, msg: k + ' 桥接进程异常(连续3次)' });
        }
      } else {
        checkBreach('bridge_' + k, false); // 正常则清零计数
      }
    } catch(e) { /* 桥接可能在启动中 */ }
  });
  // 检查内存
  var mu = process.memoryUsage();
  var memPct = process.memoryUsage.rss ? Math.round(mu.rss / require('os').totalmem() * 100) : Math.round(mu.heapUsed / mu.heapTotal * 100);
  result.memory = { rss: Math.round(mu.rss/1024/1024)+'MB', heapUsed: Math.round(mu.heapUsed/1024/1024)+'MB', pct: memPct };
  if (memPct > 85) {
    if (checkBreach('memory_high', true)) {
      result.issues.push({ type: 'memory_high', target: 'server', msg: '内存使用率 '+memPct+'% > 85%(连续3次)' });
    }
  } else {
    checkBreach('memory_high', false);
  }
  // CPU (简化：用 process.cpuUsage 近似)
  try {
    var c0 = process.cpuUsage();
    setTimeout(function() {
      var c1 = process.cpuUsage(c0);
      var totalMs = (c1.user + c1.system) / 1000;
      // 近似值，不精确但够用
      result.cpu = { userMs: Math.round(c1.user/1000), systemMs: Math.round(c1.system/1000) };
    }, 50);
  } catch(e) {}
  if (result.issues.length > 0) result.status = 'warning';
  return result;
}

// ===== P95延迟检测 =====
function doP95Check() {
  var result = { status: 'ok', issues: [], p95Ms: 0, sampleCount: 0, baselineP95: null };
  try {
    var baseline = loadBaseline();
    // 尝试从 /api/v4/traffic 获取请求耗时数据
    var req = http.get('http://127.0.0.1:8005/api/v4/traffic', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try {
          var traffic = JSON.parse(d);
          var latencies = (traffic.requests || []).map(function(r) { return r.duration || r.latency || 0; }).filter(function(v) { return v > 0; });
          // 不实时计算精确P95，只是检查是否有慢请求
          var slowCount = latencies.filter(function(v) { return v > 2000; }).length;
          result.sampleCount = latencies.length;
          if (slowCount > 0 && latencies.length > 0) {
            result.p95Ms = latencies.sort(function(a,b) { return a - b; })[Math.floor(latencies.length * 0.95)] || 0;
            if (checkBreach('p95_high', true)) {
              result.issues.push({ type: 'p95_high', target: 'ai_requests', msg: 'P95='+result.p95Ms+'ms, 超过2000ms的请求有'+slowCount+'条(连续3次)' });
            }
            result.status = 'warning';
          }
          if (baseline && baseline.p95Avg) {
            result.baselineP95 = baseline.p95Avg;
            if (result.p95Ms > baseline.p95Avg * 1.5) {
              if (checkBreach('p95_spike', true)) {
              result.issues.push({ type: 'p95_spike', target: 'ai_requests', msg: 'P95 ('+result.p95Ms+'ms) 超过基线 ('+baseline.p95Avg+'ms) 50%(连续3次)' });
            }
              result.status = 'warning';
            }
          }
        } catch(e) {}
      });
    });
    req.on('error', function() {});
    req.setTimeout(5000, function() { req.destroy(); });
  } catch(e) {}
  return result;
}

// ===== 全系统摸底 =====
function doNightlyAudit() {
  var audit = {
    timestamp: new Date().toISOString(),
    memory: {},
    bridges: {},
    cpu: {},
    traffic: {},
    p95Avg: 0,
    sampleCount: 0
  };
  var mu = process.memoryUsage();
  audit.memory = { rssMB: Math.round(mu.rss/1024/1024), heapUsedMB: Math.round(mu.heapUsed/1024/1024), heapTotalMB: Math.round(mu.heapTotal/1024/1024) };
  // 读 traffic 统计
  try {
    var req = http.get('http://127.0.0.1:8005/api/v4/traffic', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try {
          var t = JSON.parse(d);
          var latencies = (t.requests || []).map(function(r) { return r.duration || r.latency || 0; }).filter(function(v) { return v > 0; });
          if (latencies.length > 0) {
            latencies.sort(function(a,b) { return a - b; });
            audit.p95Avg = latencies[Math.floor(latencies.length * 0.95)] || 0;
            audit.sampleCount = latencies.length;
          }
        } catch(e) {}
        saveBaseline(audit);
      });
    });
    req.on('error', function() {});
    req.setTimeout(10000, function() { req.destroy(); });
  } catch(e) {}
  return audit;
}

// ===== 判断当前时段 =====
function isDayTime() {
  var h = new Date().getHours();
  return h >= 6 && h <= 23;
}
function isNightTime() {
  return !isDayTime();
}

// ===== 内置任务调度 =====
function checkAndRunBuiltins() {
  var now = Date.now();
  var day = isDayTime();
  
  // 1. 健康检查 (每30分钟, 白天)
  if (day && builtinSchedule.health_check) {
    var last = builtinSchedule.health_check.lastRun ? new Date(builtinSchedule.health_check.lastRun).getTime() : 0;
    if (now - last >= BUILTIN_TASKS.health_check.intervalMs) {
      builtinSchedule.health_check.lastRun = new Date().toISOString();
      builtinSchedule.health_check.runs = (builtinSchedule.health_check.runs || 0) + 1;
      syncBuiltinToFile('health_check', builtinSchedule.health_check);
      var result = doHealthCheck();
      if (result.issues.length > 0) {
        console.log('[Scheduler] ⚠ 健康检查发现异常:', result.issues.length, '个');
        saveAlert({ source: 'health_check', issues: result.issues, data: result });
        notifyCEO('health_check', result.issues);
      } else {
        console.log('[Scheduler] ✅ 健康检查正常');
      }
    }
  }
  // 2. 夜间P95监控 (每30分钟, 夜晚)
  if (isNightTime() && builtinSchedule.quiet_p95) {
    var last = builtinSchedule.quiet_p95.lastRun ? new Date(builtinSchedule.quiet_p95.lastRun).getTime() : 0;
    if (now - last >= BUILTIN_TASKS.quiet_p95.intervalMs) {
      builtinSchedule.quiet_p95.lastRun = new Date().toISOString();
      builtinSchedule.quiet_p95.runs = (builtinSchedule.quiet_p95.runs || 0) + 1;
      syncBuiltinToFile('quiet_p95', builtinSchedule.quiet_p95);
      var result2 = doP95Check();
      if (result2.issues.length > 0) {
        saveAlert({ source: 'quiet_p95', issues: result2.issues, data: result2 });
        console.log('[Scheduler] ⚠ 夜间P95异常:', result2.issues.length, '个');
        notifyCEO('quiet_p95', result2.issues);
      }
    }
  }
  // 3. 白天P95监控 (每5分钟)
  if (day && builtinSchedule.p95_monitor) {
    var last = builtinSchedule.p95_monitor.lastRun ? new Date(builtinSchedule.p95_monitor.lastRun).getTime() : 0;
    if (now - last >= BUILTIN_TASKS.p95_monitor.intervalMs) {
      builtinSchedule.p95_monitor.lastRun = new Date().toISOString();
      builtinSchedule.p95_monitor.runs = (builtinSchedule.p95_monitor.runs || 0) + 1;
      syncBuiltinToFile('p95_monitor', builtinSchedule.p95_monitor);
      var result3 = doP95Check();
      if (result3.issues.length > 0) {
        saveAlert({ source: 'p95_monitor', issues: result3.issues, data: result3 });
        console.log('[Scheduler] ⚠ P95异常:', result3.issues.length, '个');
        notifyCEO('p95_monitor', result3.issues);
      }
    }
  }
  // 4. 全系统摸底 (每天03:00)
  var nowH = new Date().getHours();
  var nowM = new Date().getMinutes();
  if (nowH === 3 && nowM < 5 && builtinSchedule.nightly_audit) {
    var lastDate = builtinSchedule.nightly_audit.lastRun ? (builtinSchedule.nightly_audit.lastRun || '').split('T')[0] : '';
    var today = new Date().toISOString().split('T')[0];
    if (lastDate !== today) {
      builtinSchedule.nightly_audit.lastRun = new Date().toISOString();
      builtinSchedule.nightly_audit.runs = (builtinSchedule.nightly_audit.runs || 0) + 1;
      syncBuiltinToFile('nightly_audit', builtinSchedule.nightly_audit);
      console.log('[Scheduler] 📊 执行全系统摸底');
      doNightlyAudit();
    }
  }
  
  // 5. ⭐ 子代理任务拉取（每60秒检测，空闲则唤醒，带并发保护）
  var SUB_AGENTS = ['cto-agent', 'security-agent', 'pm-agent'];
  var now = Date.now();
  SUB_AGENTS.forEach(function(agentId) {
    try {
      // 限制每个Agent每120秒最多唤醒1次
      if (lastWakeTime[agentId] && (now - lastWakeTime[agentId] < 600000)) return;
      var agentStatus = (heartbeats[agentId] && heartbeats[agentId].status) || 'idle';
      if (agentStatus !== 'busy') {
        var tPath = path.join(__dirname, '..', 'tasks.json');
        if (fs.existsSync(tPath)) {
          var tasks = JSON.parse(fs.readFileSync(tPath, 'utf8'));
          var hasPending = tasks.some(function(t) {
            return (t.status === 'pending' || t.status === 'todo') && t.assigneeId === agentId;
          });
          if (hasPending) {
            // 错峰唤醒：每个Agent间隔2-4秒
            var delay = (SUB_AGENTS.indexOf(agentId) * 2000) + Math.random() * 2000;
            setTimeout(function() {
              var p = JSON.stringify({ agentId: agentId, message: '系统调度：检查待办任务' });
              var o = { hostname: '127.0.0.1', port: 8005, method: 'POST', path: '/api/chat',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) }, timeout: 5000 };
              var r = http.request(o);
              r.on('error', function(){});
              r.write(p);
              r.end();
              console.log('[Scheduler] 唤醒子代理: ' + agentId);
            }, delay);
            lastWakeTime[agentId] = now;
          }
        }
      }
    } catch(e) { /* 拉取失败静默 */ }
  });
}

// ===== 通知CEO =====
function notifyCEO(source, issues) {
  // 将告警写入 alerts 数据，CEO可以在下次对话时看到
  // 也可以直接发消息到聊天窗口
  try {
    var msg = '【调度器告警】' + source + ' 发现 ' + issues.length + ' 个异常：' + issues.map(function(i) { return i.msg; }).join('；');
    httpPost('127.0.0.1', 8005, '/api/v4/channel/incoming', {
      message: msg,
      from: 'scheduler',
      channel: 'system'
    }).catch(function(e) { /* fail silently */ });
  } catch(e) {}
}

// ===== 原有函数 =====
function loadTasks() {
  try {
    var raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    tasks = JSON.parse(raw);
  } catch(e) { tasks = []; }
  return tasks;
}
function saveTasks() {
  try {
    if (!fs.existsSync(path.dirname(TASKS_FILE))) fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch(e) { console.error('[Scheduler] save error:', e.message); }
}

function addJob(job) {
  if (!job || !job.name) return { ok: false, error: '任务需要名称' };
  var newJob = {
    id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: job.name,
    type: job.type || 'task',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastRun: null,
    runs: 0,
    config: job.config || {}
  };
  tasks.push(newJob);
  saveTasks();
  return { ok: true, job: newJob };
}
function removeJob(id) {
  var idx = tasks.findIndex(function(t) { return t.id === id; });
  if (idx < 0) return { ok: false, error: '任务不存在' };
  tasks.splice(idx, 1);
  saveTasks();
  return { ok: true };
}
function pauseJob(id) {
  var t = tasks.find(function(j) { return j.id === id; });
  if (!t) return { ok: false, error: '任务不存在' };
  t.status = 'paused';
  saveTasks();
  return { ok: true };
}
function resumeJob(id) {
  var t = tasks.find(function(j) { return j.id === id; });
  if (!t) return { ok: false, error: '任务不存在' };
  t.status = 'active';
  saveTasks();
  return { ok: true };
}
function listJobs() {
  return tasks;
}

function cycle() {
  if (!running) return;
  lastRun = new Date().toISOString();
  cycles++;
  checkAndRunBuiltins();
}

function start(intervalMs) {
  if (running) return;
  running = true;
  intervalMs = intervalMs || 30000;  // 30秒检查一次
  loadTasks();
  timer = setInterval(cycle, intervalMs);
  console.log('[Scheduler] 已启动，检查间隔' + (intervalMs/1000) + '秒');
  console.log('[Scheduler] 内置任务: 健康检查30min, P95监控5min(白天)/30min(夜晚), 摸底03:00');
}

function stop() {
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
  console.log('[Scheduler] 已停止');
}

function getStatus() {
  return {
    running: running,
    status: running ? 'active' : 'disabled',
    tasks: tasks.length,
    activeTasks: tasks.filter(function(t) { return t.status === 'active'; }).length,
    lastRun: lastRun,
    cycles: cycles,
    builtin: {
      health_check: builtinSchedule.health_check || null,
      p95_monitor: builtinSchedule.p95_monitor || null,
      nightly_audit: builtinSchedule.nightly_audit || null,
      quiet_p95: builtinSchedule.quiet_p95 || null
    },
    baseline: loadBaseline(),
    alertsCount: loadAlerts().length
  };
}

var heartbeats = {};
function reportHeartbeat(agentId, data) {
  heartbeats[agentId] = Object.assign({ lastSeen: Date.now() }, data || {});
  return { ok: true };
}
function getHeartbeatStatus() {
  var now = Date.now();
  var result = {};
  Object.keys(heartbeats).forEach(function(id) {
    var hb = heartbeats[id];
    result[id] = Object.assign({}, hb, {
      alive: (now - hb.lastSeen) < HEARTBEAT_TIMEOUT
    });
  });
  return result;
}
function getPriorityStats() { return {}; }
function getAlerts() { return loadAlerts(); }



// 同步内置任务状态到文件（CEO报告可见）
function syncBuiltinToFile(key, state) {
  try {
    var data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    var idx = data.findIndex(function(t) { return t.name === (key + ':' + BUILTIN_TASKS[key].name); });
    if (idx >= 0) {
      data[idx].lastRun = state.lastRun;
      data[idx].runs = state.runs;
      fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch(e) { /* sync fail silently */ }
}
module.exports = {
  scheduler: {
    start: start, stop: stop, cycle: cycle,
    getStatus: getStatus, listJobs: listJobs,
    addJob: addJob, removeJob: removeJob,
    pauseJob: pauseJob, resumeJob: resumeJob,
    loadTasks: loadTasks, saveTasks: saveTasks,
    getHeartbeatStatus: getHeartbeatStatus,
    getPriorityStats: getPriorityStats,
    reportHeartbeat: reportHeartbeat,
    getAlerts: getAlerts
  }
};
