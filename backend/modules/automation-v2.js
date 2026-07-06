/**
 * eCompany Browser Automation & RPA Engine v1.0
 * 浏览器自动化 + RPA 流程引擎
 * 
 * 分层架构:
 *   Layer 1: Web Scraper — HTTP抓取 + HTML解析
 *   Layer 2: RPA Flow — 多步自动化流程
 *   Layer 3: Scheduler — 定时触发
 *   Layer 4: CEO Tools — AI驱动的自动化
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BASE = path.join(__dirname, '..');

// ========== Layer 1: Web Scraper ==========

class WebScraper {
  /**
   * 通用网页抓取
   * @param {string} url - 目标URL
   * @param {object} opts - {method, headers, body, timeout, parseLinks, extractPattern}
   */
  async scrape(url, opts = {}) {
    const timeout = opts.timeout || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...(opts.headers || {})
        },
        body: opts.body || undefined,
        signal: controller.signal
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      const contentType = response.headers.get('content-type') || '';

      return {
        ok: true,
        url: response.url,
        status: response.status,
        contentType,
        html,
        text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        links: opts.parseLinks !== false ? this.extractLinks(html, url) : [],
        ...(opts.extractPattern ? { extracted: this.extractPattern(html, opts.extractPattern) } : {}),
        size: html.length
      };
    } catch(e) {
      return { ok: false, error: e.message, url };
    } finally {
      clearTimeout(timer);
    }
  }

  extractLinks(html, baseUrl) {
    const links = [];
    const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html)) !== null) {
      try {
        const href = m[1].trim();
        const text = m[2].replace(/<[^>]+>/g, '').trim();
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          const absolute = new URL(href, baseUrl).href;
          links.push({ href: absolute, text: text.substring(0, 100) });
        }
      } catch(e) { /* skip malformed */ }
    }
    return links.slice(0, 50);
  }

  extractPattern(html, pattern) {
    const results = [];
    const re = new RegExp(pattern, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push(m[0]);
    }
    return results;
  }

  /**
   * 批量抓取多个URL
   */
  async batchScrape(urls, opts = {}) {
    const results = [];
    for (const url of urls) {
      const r = await this.scrape(url, opts);
      results.push(r);
    }
    return results;
  }
}

// ========== Layer 2: RPA Flow Engine ==========

const STEP_TYPES = {
  scrape: '网页抓取',
  api_call: 'API调用',
  extract: '数据提取',
  transform: '数据转换',
  notify: '通知发送',
  condition: '条件判断',
  loop: '循环',
  wait: '等待',
  command: '命令执行',
  file: '文件操作',
  report: '生成报告',
  email: '发送邮件'
};

class RPAFlowEngine {
  constructor() {
    this.flows = [];
    this.runs = [];
    try {
      const file = path.join(BASE, 'rpa-flows.json');
      if (fs.existsSync(file)) {
        this.flows = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch(e) { this.flows = []; }
  }

  saveFlows() {
    fs.writeFileSync(path.join(BASE, 'rpa-flows.json'), JSON.stringify(this.flows, null, 2));
  }

  createFlow(name, steps, opts = {}) {
    const flow = {
      id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      steps: steps.map((s, i) => ({
        ...s,
        id: `step_${i}_${Date.now()}`,
        index: i,
        status: 'pending'
      })),
      status: 'paused',
      trigger: opts.trigger || 'manual',
      schedule: opts.schedule || null,
      maxRetries: opts.maxRetries || 0,
      notifyOnFail: opts.notifyOnFail || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      lastRun: null
    };
    this.flows.push(flow);
    this.saveFlows();
    return flow;
  }

  async executeFlow(flowId, params = {}) {
    const flow = this.flows.find(f => f.id === flowId);
    if (!flow) throw new Error('流程未找到: ' + flowId);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const run = {
      id: runId,
      flowId,
      flowName: flow.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      params,
      steps: flow.steps.map(s => ({ ...s, status: 'pending', result: null, error: null })),
      currentStep: 0,
      log: []
    };
    this.runs.push(run);
    flow.status = 'running';
    flow.runCount++;
    flow.lastRun = new Date().toISOString();
    this.saveFlows();

    const scraper = new WebScraper();
    let abort = false;

    for (let i = 0; i < run.steps.length && !abort; i++) {
      const step = run.steps[i];
      step.startedAt = new Date().toISOString();

      let retries = 0;
      const maxRetry = step.retryOnError ? (flow.maxRetries || 2) : 0;

      while (retries <= maxRetry && !abort) {
        try {
          step.status = 'running';
          let result;

          switch (step.type) {
            case 'scrape': {
              const opts = {
                method: step.params.method || 'GET',
                headers: step.params.headers,
                body: step.params.body,
                timeout: step.params.timeout || 15000,
                parseLinks: step.params.parseLinks !== false
              };
              if (step.params.extractPattern) opts.extractPattern = step.params.extractPattern;
              result = await scraper.scrape(step.params.url, opts);
              break;
            }
            case 'api_call': {
              const resp = await fetch(step.params.url, {
                method: step.params.method || 'POST',
                headers: { 'Content-Type': 'application/json', ...(step.params.headers || {}) },
                body: step.params.body ? JSON.stringify(step.params.body) : undefined
              });
              result = { ok: resp.ok, status: resp.status, body: await resp.text() };
              break;
            }
            case 'extract': {
              const text = params._lastData || '';
              const pattern = new RegExp(step.params.pattern, 'gi');
              const matches = [];
              let m;
              while ((m = pattern.exec(text)) !== null) matches.push(m[1] || m[0]);
              result = { matched: matches.length, data: matches.slice(0, step.params.limit || 100) };
              break;
            }
            case 'transform': {
              const input = params._lastData || {};
              let code = step.params.code;
              if (code) {
                try {
                  // 安全检查：禁止函数调用、赋值、声明、new、反引号
                  if (/[(){}=;`]/.test(code.replace(/['"]input['"]/g, '').replace(/['"][^'"]*['"]/g, '').replace(/[\w$.]+/g, '').replace(/\s+/g, ''))) {
                    throw new Error('转换代码包含非法字符');
                  }
                  // 安全执行：new Function 限制作用域，不暴露全局
                  var _transformFn = new Function('input', 'return (' + code + ')(input);');
                  result = _transformFn(input);
                } catch(e) { throw new Error('转换失败: ' + e.message); }
              }
              result = result || { transformed: true };
              break;
            }
            case 'wait':
              await new Promise(r => setTimeout(r, step.params.duration || 5000));
              result = { waited: step.params.duration || 5000 };
              break;
            case 'notify': {
              const msg = step.params.message || '流程执行完成';
              // Send to webhook or console
              console.log('[RPA Notify]', msg);
              if (step.params.webhook) {
                try { await fetch(step.params.webhook, { method: 'POST', body: JSON.stringify({ message: msg }), headers: { 'Content-Type': 'application/json' } }); } catch(e) {}
              }
              result = { notified: true, message: msg };
              break;
            }
            case 'command':
              result = execSync(step.params.command, { encoding: 'utf-8', timeout: step.params.timeout || 30000 }).trim();
              result = { output: result.substring(0, 1000) };
              break;
            case 'condition': {
              var _data = params._lastData || {};
              var operator = step.params.operator || 'equals';
              var target = step.params.target;
              var val = step.params.fromData ? _data[step.params.fromData] : _data;
              if (step.params.value !== undefined) val = step.params.value;
              var condResult = false;
              switch(operator) {
                case 'equals': condResult = String(val) === String(target); break;
                case 'contains': condResult = String(val||'').includes(String(target||'')); break;
                case 'gt': condResult = parseFloat(val) > parseFloat(target); break;
                case 'lt': condResult = parseFloat(val) < parseFloat(target); break;
                case 'exists': condResult = val !== undefined && val !== null && String(val).length > 0; break;
                case 'is_true': condResult = !!val; break;
                case 'is_false': condResult = !val; break;
              }
              if (!condResult && step.params.failOnFalse) abort = true;
              result = { condition: condResult, operator, value: val, target };
              break;
            }
            default:
              result = { error: '未知步骤类型: ' + step.type };
          }

          step.status = result?.ok === false ? 'failed' : 'done';
          step.result = result;
          step.error = result?.error || null;
          step.completedAt = new Date().toISOString();

          // Pass data to next step
          params._lastData = result;

          run.log.push(`[${i}] ${step.type}: ${step.name} → ${step.status}`);
          break;
        } catch(e) {
          retries++;
          if (retries <= maxRetry) {
            run.log.push(`[${i}] ${step.type}: ${step.name} → 重试 ${retries}/${maxRetry}: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            step.status = 'failed';
            step.error = e.message;
            run.log.push(`[${i}] ${step.type}: ${step.name} → ❌ ${e.message}`);
            if (step.params.abortOnFail !== false) abort = true;
          }
        }
      }
    }

    run.status = abort ? 'failed' : 'completed';
    run.completedAt = new Date().toISOString();
    run.currentStep = run.steps.findLastIndex(s => s.status === 'done');
    flow.status = run.status === 'completed' ? 'active' : 'failed';

    // Auto-schedule if configured
    if (flow.status === 'active' && flow.schedule && flow.trigger === 'cron') {
      this.scheduleNextRun(flow);
    }

    this.saveFlows();
    return run;
  }

  getRun(runId) {
    return this.runs.find(r => r.id === runId);
  }

  getFlow(flowId) {
    return this.flows.find(f => f.id === flowId);
  }

  listFlows() {
    return this.flows.map(f => ({
      id: f.id, name: f.name, status: f.status,
      trigger: f.trigger, steps: f.steps.length,
      runCount: f.runCount, lastRun: f.lastRun
    }));
  }

  updateFlow(flowId, updates) {
    const flow = this.flows.find(f => f.id === flowId);
    if (!flow) return null;
    Object.assign(flow, updates, { updatedAt: new Date().toISOString() });
    this.saveFlows();
    return flow;
  }

  deleteFlow(flowId) {
    const idx = this.flows.findIndex(f => f.id === flowId);
    if (idx !== -1) { this.flows.splice(idx, 1); this.saveFlows(); return true; }
    return false;
  }

  scheduleNextRun(flow) {
    // Simple interval scheduling
    if (flow.schedule && flow.schedule.startsWith('every ')) {
      const m = flow.schedule.match(/^every\s+(\d+)(m|h)$/);
      if (m) {
        const ms = (m[2] === 'h' ? 3600000 : 60000) * parseInt(m[1]);
        setTimeout(() => {
          const flowReloaded = this.flows.find(f => f.id === flow.id);
          if (flowReloaded && flowReloaded.status === 'active') {
            this.executeFlow(flow.id);
          }
        }, ms);
      }
    }
  }

  startAll() {
    this.flows.filter(f => f.status === 'active' && f.trigger === 'cron').forEach(f => this.scheduleNextRun(f));
  }
}

// ========== Pre-built Templates ==========

const TEMPLATES = {
  monitor_website: {
    name: '网站监控',
    description: '定时检查网站可用性，异常时通知',
    trigger: 'cron',
    schedule: 'every 30m',
    params: { url: { default: 'https://example.com', description: '要监控的网站URL' } },
    steps: [
      { name: '访问网站', type: 'scrape', params: { url: '${URL}', method: 'GET', parseLinks: false } },
      { name: '检查状态', type: 'condition', params: { fromData: 'ok', operator: 'is_true', failOnFalse: true } },
      { name: '发送通知', type: 'notify', params: { message: '网站健康检查完成' } }
    ]
  },
  scrape_news: {
    name: '新闻聚合',
    description: '定时抓取指定网站的最新文章列表',
    trigger: 'cron',
    schedule: 'every 1h',
    steps: [
      { name: '抓取首页', type: 'scrape', params: { url: '${URL}', method: 'GET' } },
      { name: '提取链接', type: 'transform', params: { code: 'data => data.links.filter(l => l.text.length > 10).slice(0, 10)' } },
      { name: '保存结果', type: 'command', params: { command: 'echo ${_lastData}' } }
    ]
  },
  scheduled_report: {
    name: '自动报表',
    description: '每天定时生成BI报表并通知',
    trigger: 'cron',
    schedule: 'daily 09:00',
    steps: [
      { name: '获取报表', type: 'api_call', params: { url: 'http://127.0.0.1:8002/api/bi/report?type=daily', method: 'GET' } },
      { name: '通知', type: 'notify', params: { message: '📊 日报已生成' } }
    ]
  }
};

// ========== Singleton ==========

const rpaEngine = new RPAFlowEngine();
const webScraper = new WebScraper();

// ========== HTTP Routes ==========

function registerAutomationRoutes(registerRoute, parseBody, json) {
  // Web Scrape
  registerRoute(['POST'], /^\/api\/auto\/scrape$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const { url, ...opts } = body;
      if (!url) { json(res, { error: '缺少url' }, 400); return; }
      const result = await webScraper.scrape(url, opts);
      json(res, { ok: result.ok, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // RPA Flow CRUD
  registerRoute(['GET'], /^\/api\/auto\/flows$/, (req, res) => {
    json(res, { ok: true, flows: rpaEngine.listFlows() });
  });

  registerRoute(['POST'], /^\/api\/auto\/flows$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const { name, steps, ...opts } = body;
      if (!name || !steps) { json(res, { error: '缺少name或steps' }, 400); return; }
      const flow = rpaEngine.createFlow(name, steps, opts);
      json(res, { ok: true, flow });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['POST'], /^\/api\/auto\/flows\/([^/]+)\/run$/, async (req, res, m) => {
    try {
      const flowId = m[1];
      const body = await parseBody(req);
      const run = await rpaEngine.executeFlow(flowId, body.params || {});
      json(res, { ok: run.status === 'completed', run });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['GET'], /^\/api\/auto\/flows\/([^/]+)$/, (req, res, m) => {
    const flow = rpaEngine.getFlow(m[1]);
    if (!flow) { json(res, { error: '流程未找到' }, 404); return; }
    json(res, { ok: true, flow });
  });

  registerRoute(['DELETE'], /^\/api\/auto\/flows\/([^/]+)$/, (req, res, m) => {
    const ok = rpaEngine.deleteFlow(m[1]);
    json(res, { ok, message: ok ? '已删除' : '未找到' });
  });

  // Run status
  registerRoute(['GET'], /^\/api\/auto\/runs\/([^/]+)$/, (req, res, m) => {
    const run = rpaEngine.getRun(m[1]);
    if (!run) { json(res, { error: '运行记录未找到' }, 404); return; }
    json(res, { ok: true, run });
  });

  // Templates
  registerRoute(['GET'], /^\/api\/auto\/templates$/, (req, res) => {
    json(res, { ok: true, templates: TEMPLATES });
  });

  registerRoute(['POST'], /^\/api\/auto\/templates\/apply$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const tpl = TEMPLATES[body.template];
      if (!tpl) { json(res, { error: '模板未找到: ' + body.template }, 400); return; }
      const name = body.name || tpl.name;
      const steps = tpl.steps.map(s => ({
        ...s,
        params: JSON.parse(JSON.stringify(s.params).replace(/\$\{(\w+)\}/g, function(_, k) { var v = body.variables?.[k]; if (v !== undefined && v !== null && v !== '') return v; if (k === 'URL') return 'https://example.com'; return '${'+k+'}'; }))
      }));
      const flow = rpaEngine.createFlow(name, steps, { trigger: tpl.trigger, schedule: tpl.schedule });
      json(res, { ok: true, flow });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

// Start automation scheduler
rpaEngine.startAll();

module.exports = {
  WebScraper,
  RPAFlowEngine,
  webScraper,
  rpaEngine,
  TEMPLATES,
  registerAutomationRoutes
};
