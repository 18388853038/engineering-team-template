/**
 * eCompany Multi-Model Router v1.0
 * 多模型智能路由 — 根据任务类型自动选择最优模型
 * 
 * 路由策略:
 * - 主模型: Ollama 本地 (Qwen 3.5 9B / DeepSeek Coder V2)
 * - 备用: DeepSeek V4 Flash 云端
 * - 兜底: Qwen 免费云端
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ========== 默认模型配置 ==========
const DEFAULT_PROVIDERS = {
  ollama: {
    name: 'Ollama (本地)',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    apiFormat: '/v1/chat/completions',
    noApiKey: true,
    models: {
      'qwen3.5:9b': {
        name: 'Qwen 3.5 9B',
        capabilities: ['simple', 'search', 'translate', 'summarize', 'analysis', 'code', 'chat'],
        cost: { input: 0, output: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
        reasoning: true,
        speed: 'fast'
      },
      'deepseek-coder-v2:16b': {
        name: 'DeepSeek Coder V2 16B',
        capabilities: ['code', 'debug', 'analysis', 'reasoning'],
        cost: { input: 0, output: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
        reasoning: true,
        speed: 'normal'
      }
    }
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiFormat: '/v1/chat/completions',
    models: {
      'deepseek-v4-flash': {
        name: 'DeepSeek V4 Flash',
        capabilities: ['simple', 'search', 'translate', 'summarize', 'chat', 'creative'],
        cost: { input: 0.14, output: 0.28 },
        contextWindow: 1000000,
        maxTokens: 384000,
        reasoning: true,
        speed: 'fast'
      },
      'deepseek-v4-pro': {
        name: 'DeepSeek V4 Pro',
        capabilities: ['analysis', 'code', 'reasoning', 'complex', 'math'],
        cost: { input: 1.74, output: 3.48 },
        contextWindow: 1000000,
        maxTokens: 384000,
        reasoning: true,
        speed: 'normal'
      },
      'deepseek-chat': {
        name: 'DeepSeek Chat (V3, 最新默认对话模型)',
        capabilities: ['simple', 'chat', 'translate', 'analysis', 'code', 'reasoning', 'search', 'creative', 'complex'],
        cost: { input: 0.14, output: 0.28 },
        contextWindow: 1000000,
        maxTokens: 65536,
        reasoning: true,
        speed: 'fast',
        legacy: false
      },
      'deepseek-reasoner': {
        name: 'DeepSeek Reasoner (R1, 深度推理模型)',
        capabilities: ['reasoning', 'analysis', 'math', 'complex', 'code', 'debug'],
        cost: { input: 0.14, output: 0.28 },
        contextWindow: 262144,
        maxTokens: 8192,
        reasoning: true,
        speed: 'normal',
        legacy: false
      }
    }
  },
  qwen: {
    name: 'Qwen (阿里云)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: '',
    models: {
      'qwen3.7-max': {
        name: 'Qwen 3.7 Max（最新旗舰）',
        capabilities: ['complex', 'analysis', 'reasoning', 'code', 'creative'],
        cost: { input: 0, output: 0 },
        contextWindow: 1000000,
        maxTokens: 65536,
        reasoning: true,
        speed: 'fast'
      },
      'qwen3.7-plus': {
        name: 'Qwen 3.7 Plus（均衡型）',
        capabilities: ['simple', 'chat', 'translate', 'analysis', 'code'],
        cost: { input: 0, output: 0 },
        contextWindow: 1000000,
        maxTokens: 65536,
        reasoning: false,
        speed: 'fast'
      },
      'qwen3.6-flash': {
        name: 'Qwen 3.6 Flash（快速型）',
        capabilities: ['simple', 'chat', 'translate', 'summarize'],
        cost: { input: 0, output: 0 },
        contextWindow: 1000000,
        maxTokens: 65536,
        reasoning: false,
        speed: 'fast'
      },
      'qwen3-max-2026-01-23': {
        name: 'Qwen3 Max（稳定版）',
        capabilities: ['complex', 'analysis', 'reasoning', 'code'],
        cost: { input: 0, output: 0 },
        contextWindow: 262144,
        maxTokens: 65536,
        reasoning: false,
        speed: 'normal'
      }
    }
  }
};

// ========== 任务类型识别 ==========

const TASK_PATTERNS = {
  simple: [
    /^(你好|hi|hello|在吗|早安|晚安|你是谁|你叫什么)/i,
    /^(天气|搜索|翻译)/i,
    /^(谢谢|好的|明白|知道了|ok|yes|no|是|否)/i,
  ],
  search: [
    /^(?!.*(趋势|报表|数据|统计|排行|系统|分析)).*(搜索|查找|找一下|搜一下|查一下|search)/i,
  ],
  code: [
    /写一个|写一段|代码|编程|实现|函数|class|function|bug|debug|修复.*问题/,
    /api|接口|api|API|路由|端点|endpoint/,
    /docker|dockerfile|deploy|部署|ci|cd/,
    /登录|注册|认证|auth|token|jwt/i,
  ],
  analysis: [
    /分析|统计|对比|比较|评估|review|总结|归纳|汇报|报告|报表/,
    /为什么|如何|原理|机制|架构|设计方案/,
    /数据|图表|趋势|维度|dashboard/,
    /^查(一下|一?下)?(系统|趋势|数据|报表|统计|排行)/i,
  ],
  creative: [
    /写(一|篇|首|段)|创作|创意|文案|策划|脚本|方案/,
    /故事|文章|文章|内容|描述|形容/,
  ],
  complex: [
    /系统设计|架构设计|技术方案|整体方案/,
    /多轮|复杂|大型|综合/,
    /计划|规划|路线图|roadmap/,
  ]
};

function classifyTask(text) {
  if (!text) return 'simple';
  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(text)) return type;
    }
  }
  if (text.length > 500) return 'analysis';
  if (text.length > 200) return 'complex';
  return 'simple';
}

// ========== 路由表 (DeepSeek 云端为主, Ollama 本地为备用) ==========
// 策略说明：云端模型有更好的质量/速度比，本地模型仅在离线/无 Key 时使用

const ROUTING_TABLE = {
  simple: [
    { provider: 'deepseek', model: 'deepseek-chat', reason: '云端快速响应' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地备用' },
  ],
  search: [
    { provider: 'deepseek', model: 'deepseek-chat', reason: '云端搜索问答' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地备用' },
  ],
  code: [
    { provider: 'deepseek', model: 'deepseek-v4-pro', reason: '云端专业代码' },
    { provider: 'deepseek', model: 'deepseek-chat', reason: '云端快速备用' },
    { provider: 'ollama', model: 'deepseek-coder-v2:16b', reason: '本地代码备用' },
  ],
  analysis: [
    { provider: 'deepseek', model: 'deepseek-v4-pro', reason: '云端深度分析' },
    { provider: 'deepseek', model: 'deepseek-chat', reason: '云端快速备用' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地备用' },
  ],
  creative: [
    { provider: 'deepseek', model: 'deepseek-chat', reason: '云端创意写作' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地备用' },
  ],
  complex: [
    { provider: 'deepseek', model: 'deepseek-v4-pro', reason: '云端深度处理' },
    { provider: 'deepseek', model: 'deepseek-v4-flash', reason: '云端快速备用' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地兜底' },
  ],
  reasoning: [
    { provider: 'deepseek', model: 'deepseek-v4-pro', reason: '云端深度推理' },
    { provider: 'deepseek', model: 'deepseek-v4-flash', reason: '云端备用' },
    { provider: 'ollama', model: 'deepseek-coder-v2:16b', reason: '本地深度推理备用' },
    { provider: 'ollama', model: 'qwen3.5:9b', reason: '本地通用兜底' },
  ]
};

// ========== 配置管理 ==========

let providerConfigs = {};
let usageStats = { calls: 0, byProvider: {}, totalCost: 0, todayCost: 0 };
let strategyConfig = { mode: 'speed-first', backupModels: [] };
let roundRobinIndex = {};


// === Strategy config ===
function loadStrategy() {
  try {
    const cfgPath = path.join(BASE, 'model-router.json');
    if (fs.existsSync(cfgPath)) {
      var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      strategyConfig.mode = cfg.strategy || 'speed-first';
      strategyConfig.backupModels = cfg.backupModels || [];
    }
  } catch(e) {
    strategyConfig = { mode: 'speed-first', backupModels: [] };
  }
}

function setStrategy(mode, backupModels) {
  try {
    const cfgPath = path.join(BASE, 'model-router.json');
    var cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch(e) {}
    cfg.strategy = mode || cfg.strategy || 'speed-first';
    if (backupModels) cfg.backupModels = backupModels;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    // Update in-memory state
    strategyConfig.mode = cfg.strategy;
    strategyConfig.backupModels = cfg.backupModels || [];
    return true;
  } catch(e) { return false; }
}
function loadConfig() {
  loadStrategy();
  try {
    const cfgPath = path.join(BASE, 'model-router.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      providerConfigs = cfg.providers || {};
      // Merge apiKeys from provider-keys.json into providerConfigs
      try {
        var pkPath = path.join(BASE, 'provider-keys.json');
        if (fs.existsSync(pkPath)) {
          var pk = JSON.parse(fs.readFileSync(pkPath, 'utf-8'));
          Object.keys(pk).forEach(function(k) {
            if (providerConfigs[k] && pk[k]) {
              providerConfigs[k].apiKey = pk[k];
            } else if (pk[k] && !providerConfigs[k]) {
              if (['deepseek','openai','claude','gemini','tongyi','zhipu','siliconflow','ernie','yi','moonshot','doubao','hunyuan','step','minimax','baichuan','openrouter'].indexOf(k) >= 0) {
                providerConfigs[k] = { enabled: true, apiKey: pk[k], models: {} };
              }
            }
          });
        }
      } catch(pkE) {}
      // credential-store 覆盖（最高优先级）
      try {
        var credStore = require('./credential-store');
        Object.keys(providerConfigs).forEach(function(k) {
          var activeKey = credStore.getApiKey(k);
          if (activeKey) {
            providerConfigs[k].apiKey = activeKey;
          }
        });
      } catch(credE) {
        console.error('[model-router] credential-store 读取失败:', credE.message);
      }
      if (cfg.routingOverride) {
        Object.assign(ROUTING_TABLE, cfg.routingOverride);
      }
      if (cfg.defaults) {
        Object.keys(providerConfigs).forEach(p => {
          const def = cfg.defaults;
          if (!providerConfigs[p].models) providerConfigs[p].models = {};
          Object.keys(DEFAULT_PROVIDERS[p]?.models || {}).forEach(m => {
            if (!providerConfigs[p].models[m]) {
              providerConfigs[p].models[m] = { enabled: true };
            }
          });
        });
      }
    } else {
      const defaultCfg = generateDefaultConfig();
      fs.writeFileSync(cfgPath, JSON.stringify(defaultCfg, null, 2), 'utf-8');
      providerConfigs = defaultCfg.providers;
    }
  } catch(e) {
    console.error('[ModelRouter] Config load error:', e.message);
    providerConfigs = {};
  }
}

function generateDefaultConfig() {
  return {
    enabled: true,
    strategy: 'speed-first',
    providers: {
      ollama: {
        enabled: true,
        noApiKey: true,
        apiKey: '',
        models: {
          'qwen3.5:9b': { enabled: true, priority: 1 },
          'deepseek-coder-v2:16b': { enabled: true, priority: 2 }
        }
      },
      deepseek: {
        enabled: true,
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        models: {
          'deepseek-v4-flash': { enabled: true, priority: 1 },
          'deepseek-v4-pro': { enabled: true, priority: 2 },
          'deepseek-chat': { enabled: true, priority: 3 },
          'deepseek-reasoner': { enabled: true, priority: 4 }
        }
      },
      qwen: {
        enabled: true,
        apiKey: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '',
        models: {
          'qwen3.7-max': { enabled: true, priority: 1 },
          'qwen3.5-plus': { enabled: true, priority: 2 },
          'qwen3-max-2026-01-23': { enabled: false, priority: 3 },
          'qwen3-coder-plus': { enabled: false, priority: 4 }
        }
      }
    },
    routingOverride: {},
    createdAt: new Date().toISOString()
  };
}

// ========== 核心路由函数 ==========

function selectModel(taskText, options = {}) {
  // 如果用户明确指定了模型名（如 deepseek-reasoner / deepseek-chat），直接返回精确路由
  if (options.preferredModel) {
    var prefModel = options.preferredModel;
    // 匹配 deepseek 提供者下的所有模型
    var provMap = { 'deepseek': 'deepseek', 'ds': 'deepseek' };
    var provider = 'deepseek';
    var rawModel = prefModel;
    // 支持 'deepseek/deepseek-reasoner' 或 'ds/deepseek-chat' 格式
    if (prefModel.indexOf('/') >= 0) {
      var parts = prefModel.split('/');
      provider = provMap[parts[0]] || parts[0];
      rawModel = parts[1];
    }
    loadConfigIfNeeded();
    var provCfg = providerConfigs[provider];
    var apiKey = (provCfg && provCfg.apiKey) || '';
    // 优先从 provider-keys.json 读取最信配置，再 fallback 到 env
    if (!apiKey) {
      try { var pkf = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'provider-keys.json'), 'utf-8')); if (pkf[provider]) apiKey = pkf[provider]; } catch(e) {}
    }
    if (!apiKey) {
      apiKey = process.env[provider.toUpperCase() + '_API_KEY'] || '';
    }
    if (!apiKey && provider !== 'ollama') {
      // 没 API Key 时仍然返回配置但标记空 key，让调用方处理
    }
    return {
      provider: provider,
      model: rawModel,
      apiKey: apiKey,
      apiBase: provCfg ? getApiBase(provider, rawModel, provCfg) : 'https://api.deepseek.com/v1/chat/completions',
      taskType: 'preferred',
      reason: '用户显式选择模型: ' + rawModel,
      cost: DEFAULT_PROVIDERS[provider]?.models[rawModel]?.cost || { input: 0.14, output: 0.28 },
      contextWindow: DEFAULT_PROVIDERS[provider]?.models[rawModel]?.contextWindow || 131072
    };
  }

  const taskType = options.taskType || classifyTask(taskText);
  const routes = ROUTING_TABLE[taskType] || ROUTING_TABLE.simple;

  loadConfigIfNeeded();

  
  // === Strategy-aware routing ===
  var strategy = options.strategy || strategyConfig.mode || 'speed-first';
  var backupModels = options.backupModels || strategyConfig.backupModels || [];

  // Get all enabled providers for current routing
  function getEnabledRoutes(specificType) {
    var type = specificType || taskType;
    var rts = ROUTING_TABLE[type] || ROUTING_TABLE.simple;
    return rts.filter(function(rt) {
      var provCfg = providerConfigs[rt.provider];
      if (!provCfg || !provCfg.enabled) return false;
      var modelCfg = provCfg.models && provCfg.models[rt.model];
      if (modelCfg && modelCfg.enabled === false) return false;
      if (!provCfg.noApiKey) {
        var ak = provCfg.apiKey || process.env[rt.provider.toUpperCase() + '_API_KEY'] || '';
        if (!ak) return false;
      }
      return true;
    });
  }

  // === Fixed mode: always use first enabled model ===
  if (strategy === 'fixed') {
    var enabledRoutes = getEnabledRoutes();
    if (enabledRoutes.length) {
      var rt = enabledRoutes[0];
      var provCfg = providerConfigs[rt.provider];
      return {
        provider: rt.provider,
        model: rt.model,
        apiKey: provCfg.apiKey || process.env[rt.provider.toUpperCase() + '_API_KEY'] || '',
        apiBase: getApiBase(rt.provider, rt.model, provCfg),
        taskType: taskType,
        reason: '固定模型: ' + rt.model,
        cost: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.cost || { input: 0, output: 0 },
        contextWindow: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.contextWindow || 131072
      };
    }
    return getLegacyFallback();
  }

  // === Fallback mode: try primary, then backup models ===
  if (strategy === 'fallback') {
    var enabledRoutes = getEnabledRoutes();
    for (var i = 0; i < enabledRoutes.length; i++) {
      var rt = enabledRoutes[i];
      var provCfg = providerConfigs[rt.provider];
      return {
        provider: rt.provider,
        model: rt.model,
        apiKey: provCfg.apiKey || process.env[rt.provider.toUpperCase() + '_API_KEY'] || '',
        apiBase: getApiBase(rt.provider, rt.model, provCfg),
        taskType: taskType,
        reason: 'fallback 主模型: ' + rt.model,
        cost: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.cost || { input: 0, output: 0 },
        contextWindow: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.contextWindow || 131072
      };
    }
    // Try backup models if any
    if (backupModels && backupModels.length) {
      for (var bi = 0; bi < backupModels.length; bi++) {
        var bm = backupModels[bi];
        for (var pi in providerConfigs) {
          var provCfg = providerConfigs[pi];
          if (!provCfg || !provCfg.enabled) continue;
          var mCfg = provCfg.models && provCfg.models[bm];
          if (mCfg && mCfg.enabled !== false) {
            var ak = provCfg.apiKey || process.env[pi.toUpperCase() + '_API_KEY'] || '';
            if (provCfg.noApiKey || ak) {
              return {
                provider: pi,
                model: bm,
                apiKey: ak,
                apiBase: getApiBase(pi, bm, provCfg),
                taskType: taskType,
                reason: 'fallback 备用: ' + bm,
                cost: DEFAULT_PROVIDERS[pi]?.models[bm]?.cost || { input: 0, output: 0 },
                contextWindow: DEFAULT_PROVIDERS[pi]?.models[bm]?.contextWindow || 131072
              };
            }
          }
        }
      }
    }
    return getLegacyFallback();
  }

  // === RoundRobin mode: cycle through enabled models ===
  if (strategy === 'roundrobin') {
    var enabledRoutes = getEnabledRoutes();
    if (!roundRobinIndex[taskType]) roundRobinIndex[taskType] = 0;
    if (enabledRoutes.length) {
      var idx = roundRobinIndex[taskType] % enabledRoutes.length;
      roundRobinIndex[taskType] = (idx + 1) % Math.max(1, enabledRoutes.length);
      var rt = enabledRoutes[idx];
      var provCfg = providerConfigs[rt.provider];
      return {
        provider: rt.provider,
        model: rt.model,
        apiKey: provCfg.apiKey || process.env[rt.provider.toUpperCase() + '_API_KEY'] || '',
        apiBase: getApiBase(rt.provider, rt.model, provCfg),
        taskType: taskType,
        reason: '轮询 (' + (idx+1) + '/' + enabledRoutes.length + '): ' + rt.model,
        cost: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.cost || { input: 0, output: 0 },
        contextWindow: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.contextWindow || 131072
      };
    }
    return getLegacyFallback();
  }

  // === Smart mode (default): task-type aware + cost-aware ===
for (const route of routes) {
    const provCfg = providerConfigs[route.provider];
    if (!provCfg || !provCfg.enabled) continue;

    const modelCfg = provCfg.models && provCfg.models[route.model];
    if (modelCfg && modelCfg.enabled === false) continue;

    // 本地模型（Ollama）不需要 API Key
    if (!provCfg.noApiKey) {
      const apiKey = provCfg.apiKey || process.env[route.provider.toUpperCase() + '_API_KEY'] || '';
      if (!apiKey) continue;
    }

    return {
      provider: route.provider,
      model: route.model,
      apiKey: provCfg.apiKey || process.env[route.provider.toUpperCase() + '_API_KEY'] || '',
      apiBase: getApiBase(route.provider, route.model, provCfg),
      taskType: taskType,
      reason: route.reason,
      cost: DEFAULT_PROVIDERS[route.provider]?.models[route.model]?.cost || { input: 0, output: 0 },
      contextWindow: DEFAULT_PROVIDERS[route.provider]?.models[route.model]?.contextWindow || 131072
    };
  }

  return getLegacyFallback();
}

function getApiBase(provider, model, provCfg) {
  const defaults = DEFAULT_PROVIDERS[provider];
  if (provCfg && provCfg.baseUrl) {
    let base = provCfg.baseUrl.replace(/\/+$/, '');
    if (provCfg.apiFormat) base += provCfg.apiFormat;
    else base += defaults?.apiFormat || '/v1/chat/completions';
    return base;
  }
  var envUrl = process.env.OLLAMA_BASE_URL;
  if (!envUrl && defaults) return (defaults.baseUrl + (defaults.apiFormat || '/v1/chat/completions'));
  return envUrl || 'http://127.0.0.1:11434/v1/chat/completions';
}

let configLoaded = false;
function loadConfigIfNeeded() {
  if (!configLoaded) { loadConfig(); configLoaded = true; }
}

function getLegacyFallback() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'ai-provider.json'), 'utf-8'));
    const p = cfg.provider || 'ollama';
    return {
      provider: p,
      model: cfg.model || 'qwen3.5:9b',
      apiKey: cfg.apiKey || '',
      apiBase: (function(){ if(cfg.apiBase) return cfg.apiBase; var d=DEFAULT_PROVIDERS[p]; return d ? d.baseUrl+(d.apiFormat||'/v1/chat/completions') : 'http://127.0.0.1:11434/v1/chat/completions'; })(),
      taskType: 'fallback',
      reason: 'Legacy config fallback',
      cost: { input: 0, output: 0 }
    };
  } catch(e) {
    return {
      provider: 'ollama',
      model: 'qwen3.5:9b',
      apiKey: '',
      apiBase: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1/chat/completions',
      taskType: 'fallback',
      reason: 'Ultimate fallback',
      cost: { input: 0, output: 0 }
    };
  }
}

// ========== 用量统计 ==========

function recordUsage(route, inputTokens, outputTokens) {
  usageStats.calls++;
  const key = route.provider + '/' + route.model;
  if (!usageStats.byProvider[key]) usageStats.byProvider[key] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
  usageStats.byProvider[key].calls++;
  usageStats.byProvider[key].inputTokens += inputTokens || 0;
  usageStats.byProvider[key].outputTokens += outputTokens || 0;
  const cost = (route.cost?.input || 0) * (inputTokens || 0) / 1000000 + (route.cost?.output || 0) * (outputTokens || 0) / 1000000;
  usageStats.byProvider[key].cost += cost;
  usageStats.totalCost += cost;
  usageStats.todayCost += cost;
}

function getUsageStats() {
  return usageStats;
}

function resetDailyStats() {
  usageStats.todayCost = 0;
}

// ========== 路由测试 ==========

function testRoute(text) {
  const taskType = classifyTask(text);
  const route = selectModel(text);
  return {
    input: text.substring(0, 100),
    classified: taskType,
    selected: route
  };
}

// ========== 注册HTTP路由 ==========

function registerRouterRoutes(registerRoute, parseBody, json) {
  registerRoute(['POST'], /^\/api\/router\/select$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const text = body.text || body.query || '';
      const taskType = body.taskType || classifyTask(text);
      const route = selectModel(text, { taskType, strategy: body.strategy });
      json(res, { ok: true, taskType, route });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['POST'], /^\/api\/router\/classify$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const text = body.text || body.query || '';
      const taskType = classifyTask(text);
      json(res, { ok: true, taskType, input: text.substring(0, 200) });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['GET'], /^\/api\/router\/stats$/, (req, res) => {
    json(res, { ok: true, ...usageStats });
  });

  registerRoute(['GET'], /^\/api\/router\/config$/, (req, res) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'model-router.json'), 'utf-8'));
      Object.keys(cfg.providers || {}).forEach(p => {
        if (cfg.providers[p].apiKey) cfg.providers[p].apiKey = cfg.providers[p].apiKey.slice(0,8) + '...';
      });
      json(res, { ok: true, config: cfg, routingTable: ROUTING_TABLE });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  registerRoute(['POST'], /^\/api\/router\/config$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const cfgPath = path.join(BASE, 'model-router.json');
      const current = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (body.providers) {
        Object.keys(body.providers).forEach(p => {
          if (!current.providers[p]) current.providers[p] = {};
          Object.assign(current.providers[p], body.providers[p]);
        });
      }
      if (body.strategy) current.strategy = body.strategy;
      fs.writeFileSync(cfgPath, JSON.stringify(current, null, 2), 'utf-8');
      configLoaded = false;
      loadConfig();
      json(res, { ok: true, message: '配置已更新' });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

loadConfig();


// === Save enabled models from frontend settings ===

// === Get config summary for frontend ===
function getConfigSummary() {
  loadConfigIfNeeded();
  return {
    providers: providerConfigs
  };
}

function getModelList() {
  loadConfigIfNeeded();
  var models = [];
  Object.keys(providerConfigs).forEach(function(p) {
    var pc = providerConfigs[p];
    if (pc.enabled === false || !pc.models) return;
    Object.keys(pc.models).forEach(function(m) {
      var mc = pc.models[m];
      if (mc.enabled === false) return;
      models.push({
        provider: p,
        model: m,
        name: mc.name || (p + ' · ' + m)
      });
    });
  });
  return { models: models };
}

function setEnabledModels(provider, enabledMap) {
  loadConfigIfNeeded();
  if (!providerConfigs[provider]) return false;
  var provCfg = providerConfigs[provider];
  if (!provCfg.models) provCfg.models = {};
  for (var modelId in enabledMap) {
    if (provCfg.models[modelId]) {
      provCfg.models[modelId].enabled = enabledMap[modelId] !== false;
    } else {
      provCfg.models[modelId] = { enabled: enabledMap[modelId] !== false, priority: 99 };
    }
  }
  // Persist to file (merge with default)
  var cfgPath = path.join(BASE, 'model-router.json');
  try {
    var config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (!config.providers) config.providers = {};
    if (!config.providers[provider]) config.providers[provider] = {};
    if (!config.providers[provider].models) config.providers[provider].models = {};
    for (var modelId in enabledMap) {
      if (!config.providers[provider].models[modelId]) {
        config.providers[provider].models[modelId] = {};
      }
      config.providers[provider].models[modelId].enabled = enabledMap[modelId] !== false;
    }
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    return true;
  } catch(e) {
    console.error('[ModelRouter] Failed to save config:', e.message);
    return false;
  }
}


// ========== 模型自动切换（带健康检查 + fallback链） ==========

/**
 * 返回当前可用模型的排序列表（按健康度），供调用者做自动 Fallback。
 * 返回格式：[{ provider, model, apiKey, apiBase, reason }, ...]
 * 会按配置的优先级排序，并跳过无 API Key 的供应商。
 */
function selectModelWithFallback(taskText, options = {}) {
  loadConfigIfNeeded();

  const taskType = options.taskType || classifyTask(taskText);
  const routes = ROUTING_TABLE[taskType] || ROUTING_TABLE.simple;

  // 收集所有可用路由 + 备用模型
  var candidates = [];
  var seen = {};

  // 1. 主路由表的路由
  function addCandidate(rt) {
    var provCfg = providerConfigs[rt.provider];
    if (!provCfg || provCfg.enabled === false) return;
    var modelCfg = provCfg.models && provCfg.models[rt.model];
    if (modelCfg && modelCfg.enabled === false) return;
    var ak = provCfg.apiKey || process.env[rt.provider.toUpperCase() + '_API_KEY'] || '';
    if (!ak && !provCfg.noApiKey) return;
    var key = rt.provider + '/' + rt.model;
    if (seen[key]) return;
    seen[key] = true;
    candidates.push({
      provider: rt.provider,
      model: rt.model,
      apiKey: ak,
      apiBase: getApiBase(rt.provider, rt.model, provCfg),
      taskType: taskType,
      reason: rt.reason || ('候选模型: ' + rt.model),
      cost: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.cost || { input: 0, output: 0 },
      contextWindow: DEFAULT_PROVIDERS[rt.provider]?.models[rt.model]?.contextWindow || 131072
    });
  }

  routes.forEach(addCandidate);

  // 2. 备用模型（来自配置文件的 backupModels）
  if (options.backupModels) {
    options.backupModels.forEach(function(bm) {
      // 按 provider 匹配
      if (bm.indexOf('/') > 0) {
        var parts = bm.split('/');
        addCandidate({ provider: parts[0], model: parts[1], reason: '备用: ' + parts[1] });
      } else {
        // 无 provider 前缀，尝试所有有 API Key 的 provider
        Object.keys(providerConfigs).forEach(function(p) {
          var pc = providerConfigs[p];
          var ak = pc.apiKey || process.env[p.toUpperCase() + '_API_KEY'] || '';
          if (!ak && !pc.noApiKey) return;
          var mc = pc.models && pc.models[bm];
          if (mc && mc.enabled !== false) {
            addCandidate({ provider: p, model: bm, reason: '备用: ' + p + '/' + bm });
          }
        });
      }
    });
  }

  // 3. 策略排序
  var strategy = options.strategy || 'speed-first';
  if (strategy === 'speed-first') {
    // 速度优先：同一 provider 的先排
    candidates.sort(function(a, b) { return (a.cost?.output || 99) - (b.cost?.output || 99); });
  } else if (strategy === 'cost-first') {
    candidates.sort(function(a, b) { return (a.cost?.output || 99) - (b.cost?.output || 99); });
  } else if (strategy === 'quality-first') {
    candidates.sort(function(a, b) { return ((b.cost?.output || 0) - (a.cost?.output || 0)); });
  }

  return candidates;
}

// 用于 P95 等无感知降级场景
function createFallbackChain(taskText, options = {}) {
  var list = selectModelWithFallback(taskText, options);
  var idx = 0;

  /**
   * 自动遍历候选链：当前一个失败，自动尝试下一个。
   * @param {Function} caller - async (model) => reply，模型参数就是候选对象
   * @returns {Object} { reply, model, fallbacks: number }
   */
  async function execute(caller) {
    var lastErr = null;
    for (; idx < list.length; idx++) {
      var m = list[idx];
      try {
        var reply = await caller(m);
        if (reply) {
          return { reply: reply, model: m.provider + '/' + m.model, fallbacks: idx };
        }
      } catch (e) {
        lastErr = e;
        console.log('[Fallback] ' + m.provider + '/' + m.model + ' 失败: ' + e.message + '，尝试下一个... (' + (list.length - idx - 1) + ' 个剩余)');
      }
    }
    throw lastErr || new Error('所有模型都失败');
  }

  return { execute: execute, list: list };
}

// === Strategy API ===
module.exports = {
  classifyTask,
  selectModel,
  recordUsage,
  getUsageStats,
  resetDailyStats,
  testRoute,
  registerRouterRoutes,
  getConfigSummary,
  getModelList,
  setEnabledModels,
  loadStrategy,
  setStrategy,
  selectModelWithFallback,
  createFallbackChain
};
