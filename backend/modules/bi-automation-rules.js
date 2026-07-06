/**
 * eCompany BI Automation Rules Engine v1.0
 * BI 数据驱动的自动化规则引擎
 * 
 * 功能：
 * - 基于 BI 统计数据的规则匹配（错误率、流量、响应时间等）
 * - 规则命中后自动触发：通知、自动化流程、自愈、任务创建
 * - 定时规则扫描（搭配 scheduler 使用）
 * - 结果回写 BI recordAPICall，形成闭环
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

const RULES_FILE = path.join(BASE, 'bi-rules.json');

// ========== 规则存储 ==========

let rules = [];

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
    }
  } catch(e) { rules = []; }
}

function saveRules() {
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

loadRules();

// ========== 规则定义 ==========

/**
 * 规则结构：
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   enabled: boolean,
 *   trigger: { type: 'error_rate'|'traffic_drop'|'slow_response'|'cron'|'custom', params: {} },
 *   condition: string, // 可执行的 JS 条件表达式，获取 stats 对象
 *   action: { type: 'notify'|'auto_flow'|'self_heal'|'create_task', params: {} },
 *   cooldownMs: number, // 冷却时间，防止重复触发
 *   lastTriggeredAt: string|null,
 *   triggerCount: number,
 *   createdAt: string,
 *   updatedAt: string
 * }
 */

// ========== 内置规则模板 ==========

const BUILTIN_TEMPLATES = {
  high_error_rate: {
    name: '高错误率告警',
    description: 'BI 统计中错误率超过阈值时触发告警',
    enabled: true,
    trigger: { type: 'error_rate', params: { threshold: 5, windowMinutes: 60 } },
    condition: 'stats.errorRate > params.threshold',
    action: { type: 'notify', params: { message: '⚠️ 系统错误率异常：{errorRate}%（阈值{threshold}%）', severity: 'warning' } },
    cooldownMs: 1800000
  },
  traffic_drop_alert: {
    name: '流量骤降告警',
    description: 'API 调用量较昨日同期下降超过 50% 时告警',
    enabled: true,
    trigger: { type: 'traffic_drop', params: { dropPercent: 50, compareHours: 24 } },
    condition: 'stats.trafficDrop > params.dropPercent',
    action: { type: 'notify', params: { message: '📉 流量骤降 {trafficDrop}%（较{compareHours}h前）', severity: 'warning' } },
    cooldownMs: 3600000
  },
  slow_response: {
    name: '响应缓慢告警',
    description: 'P95 响应时间超过阈值时告警',
    enabled: true,
    trigger: { type: 'slow_response', params: { thresholdMs: 5000, windowMinutes: 30 } },
    condition: 'stats.p95Duration > params.thresholdMs',
    action: { type: 'notify', params: { message: '🐢 响应缓慢：P95={p95Duration}ms（阈值{thresholdMs}ms）', severity: 'warning' } },
    cooldownMs: 1800000
  },
  daily_report_push: {
    name: '每日推送日报',
    description: '每天 09:00 自动生成并推送 BI 日报',
    enabled: true,
    trigger: { type: 'cron', params: { schedule: 'daily 09:00', timezone: 'Asia/Shanghai' } },
    condition: 'true',
    action: { type: 'auto_flow', params: { template: 'scheduled_report', notify: true } },
    cooldownMs: 0
  },
  evening_report_push: {
    name: '晚间推送日报',
    description: '每天 20:00 自动推送 BI 日报',
    enabled: true,
    trigger: { type: 'cron', params: { schedule: 'daily 20:00', timezone: 'Asia/Shanghai' } },
    condition: 'true',
    action: { type: 'auto_flow', params: { template: 'scheduled_report', notify: true } },
    cooldownMs: 0
  },
  hourly_health_check: {
    name: '每小时健康检查',
    description: '每小时检查系统健康状态',
    enabled: true,
    trigger: { type: 'cron', params: { schedule: 'every 1h', timezone: 'Asia/Shanghai' } },
    condition: 'true',
    action: { type: 'auto_flow', params: { template: 'health_check', notify: false } },
    cooldownMs: 0
  },
  auto_heal_p95: {
    name: 'P95 响应缓慢自动修复',
    description: '[已禁用] 之前会触发 Evolve 自修复循环，误判系统问题并消耗 Token',
    enabled: false,
    trigger: { type: 'slow_response', params: { thresholdMs: 3000, windowMinutes: 10 } },
    condition: 'false',
    action: { type: 'notify', params: { message: '规则已禁用 - 不再自动触发修复' } },
    cooldownMs: 0
  },
  auto_heal_errors: {
    name: '高错误率自动自愈',
    description: '[已禁用] 之前会触发 Evolve 自修复循环，误判系统问题并消耗 Token',
    enabled: false,
    trigger: { type: 'error_rate', params: { threshold: 10, windowMinutes: 15 } },
    condition: 'false',
    action: { type: 'notify', params: { message: '规则已禁用 - 不再自动触发修复' } },
    cooldownMs: 0
  }
};

// ========== 条件评估（安全模式：仅允许运算符和属性访问，禁止调用、赋值、声明） ==========

function evaluateCondition(condition, context) {
  const { stats, params } = context || {};
  if (typeof condition !== 'string') {
    console.error('[BI-Rules] 条件格式异常:', condition);
    return false;
  }
  // 安全检查：禁止函数调用、赋值、声明、new
  var _safeRe = /^[\s\S]*$/;
  if (/[(){}=`]/.test(condition.replace(/['"]stats['"]/g, '').replace(/['"]params['"]/g, '').replace(/>|>=|<|<=|===?|!==?|&&|\|\||[+\-*/%]|\?|:|\[|\]|\.|\btrue\b|\bfalse\b|\bnull\b|\bundefined\b|\d+\.\d*|\d+|\s+|['"][^'"]*['"]/g, ''))) {
    // 包含非法字符（括号、花括号、等号、反引号），安全回退
    return false;
  }
  // 安全求值：只允许 stats./params./数字/字符串/布尔/比较/逻辑运算符
  var fnBody = 'return (' + condition + ')';
  try {
    return new Function('stats', 'params', fnBody)(stats, params);
  } catch(e) {
    // 如果是未定义变量错误，自动注入默认值重试
    var undefinedVars = [];
    var m;
    var idRe = /\b([a-zA-Z_$][\w$]*)\b/g;
    while ((m = idRe.exec(condition)) !== null) {
      var v = m[1];
      if (v !== 'stats' && v !== 'params' && v !== 'true' && v !== 'false' && v !== 'null' && v !== 'undefined') {
        if (!undefinedVars.includes(v)) undefinedVars.push(v);
      }
    }
    if (undefinedVars.length > 0) {
      var prefix = undefinedVars.map(function(v) { return 'var ' + v + '=0'; }).join(',');
      try {
        return new Function('stats', 'params', prefix + ';return (' + condition + ')')(stats, params);
      } catch(e2) {
        console.error('[BI-Rules] 条件评估失败（含自动注入）:', condition, e2.message);
        return false;
      }
    }
    console.error('[BI-Rules] 条件评估失败:', condition, e.message);
    return false;
  }
}

// ========== 统计收集 ==========

async function collectStats(rule) {
  const PORT = process.env.PORT || 8005;
  const baseURL = 'http://127.0.0.1:' + PORT;
  const stats = {};

  try {
    // 基础健康
    const hr = await fetch(baseURL + '/api/bi/overview', { signal: AbortSignal.timeout(5000) });
    if (hr.ok) {
      const hd = await hr.json();
      stats.healthScore = hd.health?.score || 100;
      stats.healthLevel = hd.health?.level || 'excellent';
      stats.todayCalls = hd.todayCalls || 0;
      stats.totalWindow = hd.totalWindow || 0;
      stats.uptime = hd.uptime || 0;
      stats.errorRate = hd.health?.errorRate || 0;
      stats.slowRate = hd.health?.slowRate || 0;
    }

    // 趋势数据
    const tr = await fetch(baseURL + '/api/bi/trend?days=3', { signal: AbortSignal.timeout(5000) });
    if (tr.ok) {
      const td = await tr.json();
      stats.trendSlope = td.slope || 0;
      stats.trendDirection = td.trend || 'stable';
      stats.trendAvg = td.avg || 0;
      if (td.data && td.data.length >= 2) {
        const today = td.data[td.data.length - 1].value || 0;
        const yesterday = td.data[td.data.length - 2].value || 0;
        stats.trafficDrop = yesterday > 0 ? Math.round((yesterday - today) / yesterday * 100) : 0;
      }
    }

    // 报表数据
    const rr = await fetch(baseURL + '/api/bi/report?type=daily', { signal: AbortSignal.timeout(5000) });
    if (rr.ok) {
      const rd = await rr.json();
      if (rd.report?.summary) {
        stats.totalCalls24h = rd.report.summary.totalCalls || 0;
        stats.avgPerDay = rd.report.summary.avgPerDay || 0;
        stats.errorRate24h = rd.report.summary.errorRate || 0;
        stats.activeAgents = rd.report.summary.activeAgents || 0;
        // P95 from leaderboard
        if (rd.report.details?.topRoutes?.length) {
          const sorted = rd.report.details.topRoutes.slice().sort((a, b) => (b.avgDuration || 0) - (a.avgDuration || 0));
          stats.p95Duration = sorted[0]?.avgDuration || 0;
          stats.topRoute = sorted[0]?.route || '';
        }
      }
    }
  } catch(e) {
    console.error('[BI-Rules] 统计收集失败:', e.message);
    stats._error = e.message;
  }

  return stats;
}

// ========== 规则匹配与执行 ==========

async function evaluateRule(rule, stats, recordAPICall) {
  if (!rule.enabled) return null;
  
  // 冷却检查
  if (rule.lastTriggeredAt && rule.cooldownMs > 0) {
    const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
    if (elapsed < rule.cooldownMs) return null;
  }

  const context = { stats, params: rule.trigger.params };
  const matched = evaluateCondition(rule.condition, context);
  if (!matched) return null;

  // 命中！触发动作
  rule.lastTriggeredAt = new Date().toISOString();
  rule.triggerCount = (rule.triggerCount || 0) + 1;
  saveRules();

  const result = await executeAction(rule, stats);
  result.ruleId = rule.id;
  result.ruleName = rule.name;

  // 回写 BI 统计
  if (recordAPICall) {
    recordAPICall('POST', '/api/bi/rules/evaluate', 200, Date.now() % 1000, 'bi_automation');
  }

  return result;
}

async function executeAction(rule, stats) {
  const action = rule.action;
  const PORT = process.env.PORT || 8005;
  const baseURL = 'http://127.0.0.1:' + PORT;

  // 替换模板变量
  function fillTemplate(tpl) {
    return (tpl || '').replace(/\{(\w+)\}/g, function(_, k) {
      return stats[k] !== undefined ? stats[k] : (rule.trigger.params[k] !== undefined ? rule.trigger.params[k] : '{' + k + '}');
    });
  }

  switch (action.type) {
    case 'notify': {
      const message = fillTemplate(action.params.message);
      console.log('[BI-Rules] 通知:', message);
      // 尝试通过通知 API 发送
      try {
        await fetch(baseURL + '/api/v4/channel/forward', {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channels: ['all'],
            message: message,
            msgtype: action.params.severity === 'critical' ? 'warning' : 'info'
          })
        });
      } catch(e) {
        // channel/forward 可能未注册，fallback
        console.log('[BI-Rules] 通知发送失败(非关键):', e.message);
      }
      return { action: 'notify', message, severity: action.params.severity || 'info' };
    }

    case 'auto_flow': {
      try {
        let steps = [];
        if (action.params.template === 'scheduled_report') {
          steps = [
            { name: '获取日报', type: 'api_call', params: { url: baseURL + '/api/bi/report?type=daily', method: 'GET' } },
            { name: '通知', type: 'notify', params: { message: '📊 BI 日报已生成' } }
          ];
        } else if (action.params.template === 'health_check') {
          steps = [
            { name: '健康检查', type: 'api_call', params: { url: baseURL + '/api/bi/overview', method: 'GET' } },
            { name: '条件判断', type: 'condition', params: { fromData: 'ok', operator: 'is_true', failOnFalse: false } }
          ];
        }

        const flowResp = await fetch(baseURL + '/api/auto/flows', {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'BI-Rule_' + rule.name + '_' + Date.now(), steps, trigger: 'bi_rule' })
        });
        if (flowResp.ok) {
          const flowData = await flowResp.json();
          if (flowData.flow?.id) {
            const runResp = await fetch(baseURL + '/api/auto/flows/' + flowData.flow.id + '/run', {
              method: 'POST',
              signal: AbortSignal.timeout(15000),
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            });
            if (runResp.ok) {
              const runData = await runResp.json();
              return { action: 'auto_flow', flowId: flowData.flow.id, run: runData.run, flowName: flowData.flow.name };
            }
          }
        }
      } catch(e) {
        console.error('[BI-Rules] auto_flow 执行失败:', e.message);
      }
      return { action: 'auto_flow', error: '执行失败' };
    }

    case 'self_heal': {
      try {
        const resp = await fetch(baseURL + (action.params.endpoint || '/api/evolve/cycle'), {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl: baseURL, trigger: 'bi_rule_' + rule.id })
        });
        const data = resp.ok ? await resp.json() : { error: 'HTTP ' + resp.status };
        return { action: 'self_heal', result: data };
      } catch(e) {
        return { action: 'self_heal', error: e.message };
      }
    }

    case 'create_task': {
      return { action: 'create_task', task: action.params };
    }

      // [ECompany AI助手] 写回触发日志到 bi-rules.json，供规则面板实时查看
      try {
        var rulesLogFile = path.join(BASE, 'bi-rules.json');
        var allRules = JSON.parse(fs.readFileSync(rulesLogFile, 'utf-8'));
        var matchedRule = allRules.find(function(r) { return r.id === rule.id; });
        if (matchedRule) {
          if (!matchedRule.triggerLog) matchedRule.triggerLog = [];
          matchedRule.triggerLog.unshift({
            time: new Date().toISOString(),
            action: action.type,
            detail: action.type === 'notify' ? fillTemplate(action.params.message) : (action.params.template || action.params.endpoint || ''),
            stats: { errorRate: stats.errorRate, todayCalls: stats.todayCalls, healthScore: stats.healthScore }
          });
          // Keep last 50 logs
          if (matchedRule.triggerLog.length > 50) matchedRule.triggerLog.length = 50;
          fs.writeFileSync(rulesLogFile, JSON.stringify(allRules, null, 2));
        }
      } catch(e) {
        console.error('[BI-Rules] 写回触发日志失败:', e.message);
      }

    default:
      return { action: 'unknown', error: '未知动作类型: ' + action.type };
  }
}

// ========== 完整扫描周期 ==========

async function runCycle(recordAPICall) {
  const results = [];
  const activeRules = rules.filter(r => r.enabled);
  
  if (activeRules.length === 0) {
    return { ok: true, evaluated: 0, triggered: 0, message: '无启用规则' };
  }

  // 收集一次统计，供所有规则使用
  const stats = await collectStats();
  stats._cycleTime = new Date().toISOString();

  for (const rule of activeRules) {
    const result = await evaluateRule(rule, stats, recordAPICall);
    if (result) {
      results.push(result);
      console.log('[BI-Rules] ⚡ 规则命中:', rule.name, JSON.stringify(result).slice(0, 200));
    }
  }

  return {
    ok: true,
    evaluated: activeRules.length,
    triggered: results.length,
    results,
    stats: {
      errorRate: stats.errorRate,
      todayCalls: stats.todayCalls,
      healthScore: stats.healthScore,
      trendDirection: stats.trendDirection
    },
    cycleTime: stats._cycleTime
  };
}

// ========== CRUD API ==========

function listRules() {
  return rules.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    triggerType: r.trigger?.type,
    lastTriggeredAt: r.lastTriggeredAt,
    triggerCount: r.triggerCount || 0,
    createdAt: r.createdAt
  }));
}

function getRule(id) {
  return rules.find(r => r.id === id) || null;
}

function createRule(data) {
  const now = new Date().toISOString();
  const rule = {
    id: 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: data.name || '未命名规则',
    description: data.description || '',
    enabled: data.enabled !== false,
    trigger: data.trigger || { type: 'custom', params: {} },
    condition: data.condition || 'true',
    action: data.action || { type: 'notify', params: { message: '规则命中' } },
    cooldownMs: data.cooldownMs || 300000,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: now,
    updatedAt: now
  };
  rules.push(rule);
  saveRules();
  return rule;
}

function updateRule(id, data) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return null;
  Object.keys(data).forEach(k => {
    if (k !== 'id' && k !== 'createdAt' && k !== 'triggerCount' && k !== 'lastTriggeredAt') {
      rule[k] = data[k];
    }
  });
  rule.updatedAt = new Date().toISOString();
  saveRules();
  return rule;
}

function deleteRule(id) {
  const idx = rules.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rules.splice(idx, 1);
  saveRules();
  return true;
}

function resetRuleTriggers(id) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return null;
  rule.lastTriggeredAt = null;
  rule.triggerCount = 0;
  saveRules();
  return rule;
}

function initDefaults() {
  let added = 0;
  Object.entries(BUILTIN_TEMPLATES).forEach(([key, tpl]) => {
    if (!rules.find(r => r.name === tpl.name)) {
      const now = new Date().toISOString();
      rules.push({
        id: 'rule_builtin_' + key,
        ...tpl,
        lastTriggeredAt: null,
        triggerCount: 0,
        createdAt: now,
        updatedAt: now
      });
      added++;
    }
  });
  if (added > 0) saveRules();
  return added;
}

// ========== HTTP 路由注册 ==========

function registerBIRulesRoutes(registerRoute, parseBody, json) {
  // 初始化默认规则
  initDefaults();

  // ====== 特殊路径路由（必须在通用 :id 之前注册）======

  // 模板列表
  registerRoute(['GET'], /^\/api\/bi\/rules\/templates$/, (req, res) => {
    json(res, { ok: true, templates: BUILTIN_TEMPLATES });
  });

  // 手动触发扫描周期
  registerRoute(['POST'], /^\/api\/bi\/rules\/cycle$/, async (req, res) => {
    try {
      const result = await runCycle();
      json(res, { ok: true, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 重置所有规则为默认
  registerRoute(['POST'], /^\/api\/bi\/rules\/reset-all$/, (req, res) => {
    rules = [];
    const added = initDefaults();
    json(res, { ok: true, message: '已重置为默认规则', count: added });
  });

  // ====== 列表与 CRUD ======

  // 列表
  registerRoute(['GET'], /^\/api\/bi\/rules$/, (req, res) => {
    json(res, { ok: true, rules: listRules() });
  });

  // 创建
  registerRoute(['POST'], /^\/api\/bi\/rules$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const rule = createRule(body);
      json(res, { ok: true, rule });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // ====== 通用 :id 路由（必须最后注册）======

  // 获取单个
  registerRoute(['GET'], /^\/api\/bi\/rules\/([^/]+)$/, (req, res, m) => {
    const rule = getRule(m[1]);
    if (!rule) { json(res, { error: '规则未找到' }, 404); return; }
    json(res, { ok: true, rule });
  });

  // 更新
  registerRoute(['PUT'], /^\/api\/bi\/rules\/([^/]+)$/, async (req, res, m) => {
    try {
      const body = await parseBody(req);
      const rule = updateRule(m[1], body);
      if (!rule) { json(res, { error: '规则未找到' }, 404); return; }
      json(res, { ok: true, rule });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // 删除
  registerRoute(['DELETE'], /^\/api\/bi\/rules\/([^/]+)$/, (req, res, m) => {
    const ok = deleteRule(m[1]);
    json(res, { ok, message: ok ? '已删除' : '未找到' });
  });

  // 重置触发计数
  registerRoute(['POST'], /^\/api\/bi\/rules\/([^/]+)\/reset$/, (req, res, m) => {
    const rule = resetRuleTriggers(m[1]);
    if (!rule) { json(res, { error: '规则未找到' }, 404); return; }
    json(res, { ok: true, rule });
  });
}

// ========== 定时扫描任务（由调度器调用） ==========

let scanInterval = null;

function startPeriodicScan(intervalMs, recordAPICall) {
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = setInterval(async () => {
    try {
      const result = await runCycle(recordAPICall);
      if (result.triggered > 0) {
        console.log('[BI-Rules] 周期扫描: 触发', result.triggered, '条规则', JSON.stringify(result.stats));
      }
    } catch(e) {
      console.error('[BI-Rules] 周期扫描失败:', e.message);
    }
  }, intervalMs || 300000); // 默认每5分钟扫描一次
  console.log('[BI-Rules] 周期扫描已启动, 间隔:', (intervalMs || 300000) / 1000 + 's');
  return scanInterval;
}

function stopPeriodicScan() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  resetRuleTriggers,
  runCycle,
  initDefaults,
  registerBIRulesRoutes,
  startPeriodicScan,
  stopPeriodicScan,
  BUILTIN_TEMPLATES
};
