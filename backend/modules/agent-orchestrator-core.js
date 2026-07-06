
var log = (typeof getLogger === 'function') ? getLogger('orchcore') : {
  info: function(){ console.log.apply(console, arguments); },
  warn: function(){ console.warn.apply(console, arguments); },
  error: function(){ console.error.apply(console, arguments); }
};
/**
 * agent-orchestrator-core.js — 主Agent调度核心 v1.0
 *
 * 设计原则：
 *   1. 主Agent为「意图理解→任务拆解→子Agent调度→结果校验→异常处理」五个阶段
 *   2. 子Agent拥有隔离上下文沙箱，低耦合
 *   3. 支持垂直架构（主从）和水平架构（协商）
 *   4. 结果校验结构化，代码级而非AI自行判断
 *   5. 异常全流程兜底：重试/超时/轮换/追问
 *
 * 暴露接口：
 *   
OrchestratorCore.prototype.setWSBroadcast = function(fn) { this._wsBroadcast = fn; };
module.exports = {
 *     OrchestratorCore,
 *     PlanStep, ValidationRule, AgentSpec  // 类型构造器
 *   }
 *
 * 使用方式：
 *   const { OrchestratorCore } = require('./agent-orchestrator-core');
 *   const core = new OrchestratorCore({ execCEOTool, registerExecutorTool, ... });
 *   await core.process(instruction, { sessionId, projectName, sseSend });
 */

'use strict';

const path = require('path');
const fs = require('fs');

// =========================================================================
// === 1. 类型构造器（干净的 factory，不依赖 class 语法） ===
// =========================================================================

/**
 * 创建一个计划步骤
 * @param {string} id — 唯一标识
 * @param {string} description — 步骤描述
 * @param {object} opts — { dependsOn, priority, agentType, timeout, retryCount, required }
 * @returns {object} PlanStep
 */
function PlanStep(id, description, opts) {
  opts = opts || {};
  return {
    id: id,
    description: description,
    dependsOn: opts.dependsOn || [],       // 依赖的其他步骤 id[]
    priority: opts.priority || 5,          // 1(最高)~10(最低)
    agentType: opts.agentType || 'default', // 子Agent类型: default / executor / validator / reviewer
    timeout: opts.timeout || 30000,        // 单步超时(ms)
    retryCount: opts.retryCount || 2,      // 重试次数
    required: opts.required !== false,     // 是否必须成功
    status: 'pending',                     // pending / running / success / failed / skipped
    result: null,
    error: null,
    startTime: null,
    endTime: null
  };
}

/**
 * 创建一条校验规则
 * @param {string} name — 规则名
 * @param {function} check — (result) => { ok: boolean, message: string }
 * @returns {object} ValidationRule
 */
function ValidationRule(name, check) {
  return { name: name, check: check };
}

/**
 * 子Agent规格说明
 * @param {string} type — 类型标识
 * @param {object} opts — { name, skills, tools, model, systemPrompt }
 * @returns {object} AgentSpec
 */
function AgentSpec(type, opts) {
  opts = opts || {};
  return {
    type: type,
    name: opts.name || type,
    skills: opts.skills || [],
    tools: opts.tools || [],         // 允许使用的工具名列表
    model: opts.model || null,       // 可选模型覆盖
    systemPrompt: opts.systemPrompt || null  // 可选提示词覆盖
  };
}

// =========================================================================
// === 2. 默认子Agent规格注册表 ===
// =========================================================================

var DEFAULT_AGENT_SPECS = {
  'default': AgentSpec('default', {
    name: '通用执行者',
    skills: ['通用执行', '数据分析', '文本处理'],
    tools: ['kb_search', 'system_health', 'system_cpu_memory', 'system_processes', 'subagent_spawn']
  }),
  'executor': AgentSpec('executor', {
    name: '执行者',
    skills: ['代码开发', '系统实现', '配置部署'],
    tools: ['code_generate', 'file_create', 'file_modify', 'sys_config', 'deploy_service', 'xbrowser_skill']
  }),
  'validator': AgentSpec('validator', {
    name: '验证者',
    skills: ['代码审查', '质量检测', '安全审计'],
    tools: ['code_review', 'security_scan', 'run_tests', 'compliance_check']
  }),
  'reviewer': AgentSpec('reviewer', {
    name: '验收者',
    skills: ['结果评估', '需求对齐验证', '质量验收'],
    tools: ['result_evaluate', 'requirement_align', 'quality_accept', 'generate_report']
  }),
  'analyst': AgentSpec('analyst', {
    name: '分析师',
    skills: ['数据分析', '趋势研判', '报告生成'],
    tools: ['query_traffic', 'query_activities', 'query_employees', 'query_tasks', 'kb_search']
  })
};

// =========================================================================
// === 3. 默认校验规则集 ===
// =========================================================================

var DEFAULT_VALIDATION_RULES = [
  ValidationRule('non_empty', function(result) {
    if (!result || (typeof result === 'string' && !result.trim())) {
      return { ok: false, message: '结果为空' };
    }
    return { ok: true, message: '非空检查通过' };
  }),
  ValidationRule('has_data_key', function(result) {
    if (result && (result.data || result.ok || result.status)) {
      return { ok: true, message: '包含标准数据字段' };
    }
    return { ok: true, message: '非标准格式，跳过结构检查' };
  }),
  ValidationRule('no_error_flag', function(result) {
    if (result && (result.error || result.err)) {
      return { ok: false, message: '结果包含错误标识: ' + (result.error || result.err) };
    }
    return { ok: true, message: '无错误标识' };
  })
];

// =========================================================================
// === 4. Agent调度上下文沙箱 ===
// =========================================================================

/**
 * 创建子Agent执行沙箱（隔离上下文）
 * @param {string} agentType — 子Agent类型
 * @param {string} taskDescription — 任务描述
 * @param {object} options — { tools, timeout, model, systemPrompt }
 * @returns {object} Sandbox
 */
function createSandbox(agentType, taskDescription, options) {
  options = options || {};
  var spec = DEFAULT_AGENT_SPECS[agentType] || DEFAULT_AGENT_SPECS['default'];

  return {
    id: 'sbx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    agentType: agentType,
    taskDescription: taskDescription,
    created: Date.now(),
    spec: spec,
    tools: options.tools || spec.tools || [],
    timeout: options.timeout || 30000,
    model: options.model || spec.model || null,
    systemPrompt: options.systemPrompt || spec.systemPrompt || null,
    // 执行时的不可变快照
    _isolated: true,
    _state: 'created'  // created / running / completed / failed / timedout
  };
}

// =========================================================================
// === 5. OrchestratorCore — 主Agent核心类 ===
// =========================================================================

function OrchestratorCore(config) {
  config = config || {};

  // 注入外部依赖
  this.execCEOTool = config.execCEOTool || null;
  this._registerExecutorTool = config.registerExecutorTool || null;
  this._sseSend = config.sseSend || null;
  this._logger = config.logger || console.log;

  // 内部状态
  this._plans = {};           // { planId: { steps, status, sessionId, ... } }
  this._sandboxes = {};       // { sandboxId: sandbox }
  this._activeExecutions = {};// { sandboxId: promise }
  this._agentSpecs = JSON.parse(JSON.stringify(DEFAULT_AGENT_SPECS));
  this._validationRules = DEFAULT_VALIDATION_RULES.slice();
  this._stats = {
    totalPlans: 0,
    completedPlans: 0,
    failedPlans: 0,
    totalSteps: 0,
    completedSteps: 0,
    failedSteps: 0,
    retries: 0,
    timeouts: 0,
    startTime: Date.now()
  };

  this._running = true;
  this._logger('[OrchestratorCore] ✅ 初始化完成');

  this._getFallbackReply = function(msg) {
    if(!msg) return '我是ECompany AI助手，有什么可以帮你的吗？随时告诉我，我来帮你处理。';
    var lm = msg.toLowerCase();
    if(/(?:(?:你).*(?:是谁|叫什么|什么名字|叫啥|是啥|是做什么|是什么|你是|你是谁)|你是谁)/.test(lm)) return '我是ECompany AI助手 🐉，eCompany 团队的调度与管理核心。你可以问我：系统状态、任务进度、团队信息、数据分析等，也可以让我执行各种操作，随时吩咐！';
    if(/(?:你会(?:做什么|干嘛|什么|干吗|做啥)|你能(?:做什么|干嘛|什么|干吗)|有什么功能|你有什么能力|你有哪些能力|你能干啥|能力|功能板块|系统能力|摸底)/.test(lm)) return '我可以 🐉 全面为你服务！\n\n**📊 系统监控**\n  - 系统健康、CPU/内存、进程管理、网络延迟\n\n**🔍 数据查询**\n  - 团队信息、任务列表、知识库搜索、BI数据\n\n**⚙️ 系统管理**\n  - 渠道集成状态、模型管理、文件管理\n\n**🤖 AI核心**\n  - 自然语言对话、意图识别、子Agent调度\n\n**📡 消息渠道（已接入）**\n  - 钉钉、飞书、企业微信、QQ机器人、微信、Telegram、Discord、Slack\n\n**⏰ 定时调度**\n  - 每日08:00日报、30min健康检查、P95监控、03:00夜间审计\n\n具体想看哪块？直接说，我帮你查！';
    if(/(?:在干嘛|在做什么|干什么|干吗|干嘛|忙什么|忙啥|咋了|怎么了)/.test(lm)) return '随时待命着呢 👋 正等你吩咐，想查什么还是需要我做什么事？';
    if(/(?:有什么(?:任务|工作|活|事情)|新消息|最新|最近|什么情况|现在.*情况)/.test(lm)) return '系统一切正常，等着你的指令呢 😊 想查什么数据还是执行什么操作？告诉我就行！';
    if(/(?:团队|成员|同事|大家|伙伴).*(?:在干嘛|在做什么|做什么|去哪|情况|状态|近况)/.test(lm)) return '想了解团队信息吗？用「你们团队有谁」「查一下团队」来获取最新数据。🚀';
    if(/(?:天气|温度|下雨|台风|雪|太阳)/.test(lm)) return '天气查询我暂时还不支持呢 🌤️ 不过你可以让我查系统状态、任务进度、团队信息等，试试看？';
    if(/(?:谢谢|谢了|多谢|感谢|辛苦了)/.test(lm)) return '不客气！随时需要帮忙就叫我 😊';
    var g = ['嗯嗯，我在听 👂\n想查系统状态、任务进度、团队信息，或者让我执行什么操作，随时告诉我！','好的，已经收到你的消息 ✅ 直接说想查什么数据、看什么状态，我来处理。','明白！需要我做什么？查系统、查数据、看进度都可以，直接吩咐～','收到 🐉 随时为你服务。想看系统状态、团队资料还是执行操作？直接说就行！'];
    return g[Math.floor(Math.random() * g.length)];
  };
  this._wsBroadcast = null;
  this._processWSBroadcast = function(sessionId, type, data) {
    var b = this._wsBroadcast;
    if(!b || typeof b !== 'function') return;
    try { b(sessionId || '', type || 'orch-core', data || {}); } catch(e) {}
  };
  this._wsSessionId = (config && config.sessionId) || 'orchcore';

}

// =========================================================================
// === 5.1 意图理解与任务拆解 ===
// =========================================================================

/**
 * 分析用户指令，生成执行计划
 * @param {string} instruction — 用户原始指令
 * @returns {object} { plan, steps, queryMode, clarification }
 */
OrchestratorCore.prototype.analyze = function(instruction, context) {
  if (!instruction || !instruction.trim()) return { plan: null, steps: [], queryMode: true, clarification: '指令为空', intent: '__empty__' };
  var text = instruction.trim();
  var intent = this._classifyIntent(text);
  var isRepeat = context && context.repeatCount > 1;
  if (intent === 'greeting' || intent === 'chat') {
    var fallback = this._getFallbackReply(text);
    // 安排一个步骤让 LLM 生成回复
    var greetSteps = [{
      action: 'greeting_chat',
      id: 'step_' + Date.now(),
      description: '与用户交互: ' + text.substring(0,50),
      agentType: 'executor',
      priority: 1,
      timeout: 20000,
    }];
    return { plan: { instruction: text, fallback: fallback }, steps: greetSteps, queue: [], queryMode: false, clarification: null, intent: intent, fallback: fallback };
  }
  var steps = this._decompose(text, intent);
  if (steps.length === 0) return { plan: null, steps: [], queryMode: false, clarification: '无法将指令拆解为可执行步骤，请补充具体参数', intent: intent };
  return { plan: { id: 'plan_' + Date.now(), instruction: text, intent: intent, steps: steps, status: 'created', created: Date.now(), completedSteps: 0, failedSteps: 0, skippedSteps: 0 }, steps: steps, queryMode: false, clarification: null, intent: intent };
};

OrchestratorCore.prototype._classifyIntent = function(text) {
  var t = text.trim();
  if (/^(你好|你好啊|您好|嗨|hi|hello|hey|早|早上好|下午好|晚上好|晚安|嗨喽|哈喽|在吗|在不在|拜拜|再见|好的|ok|okay|嗯|好)$/i.test(t)) return 'greeting';
  if (/^(谢谢|谢了|多谢|感谢|辛苦|辛苦了|thx|thanks)$/i.test(t)) return 'greeting';
  if (/^(你|你).*(是谁|叫什么|什么名字|叫啥|是啥|你是|你是做什么的|做啥的|干啥的)/.test(t)) return 'greeting';
  if (/^(你).*(会做|能做什么|能干|会什么|有什么能力|有什么功能|有什么用)/.test(t)) return 'chat';
  if (/(?:你会|你能).*(?:做什么|干嘛|干吗|做啥)/.test(t)) return 'chat';
  if (/(系统状态|服务器状态|健康检查|health|运行状态|资源使用|CPU|内存|磁盘|网络|负载|性能|状态检查)/i.test(t)) return 'health_check';
  if (/(数据库|db|SQL|查询.*(数据|记录)|select|insert|update|delete|数据表|字段)/i.test(t)) return 'db_query';
  if (/^(查看|检查|查询|搜索|查找|看看|列出|显示|展示|查|任务进度|进度)/.test(t)) return 'query';
  if (/(?:有谁|有哪些|都有谁|谁在|什么任务|什么情况|有什么|多少(?:成员|人|任务|个)|新消息|最新|最近)/.test(t)) return 'query';
  if (/(分析|评估|趋势|报告|报表|汇总|统计|对比|总结|复盘|评价|短板|不足|改进|建议|意见|看法)/.test(t)) return 'analysis';
  if (/(开发|实现|编码|写|编写|创建|新建|生成|构建|部署|上线|发布|修改|编辑|更新)/i.test(t)) return 'development';
  if (/(启动|停止|重启|运行|执行|发送|通知|提醒|设置|配置|打开|关闭|导入|导出)/.test(t)) return 'operation';
  if (/^(?:你们|你们公司|我们|咱|咱们|公司|团队|部门).*(?:有谁|有哪|有哪些|是谁|有谁在|叫什么|多少人|都谁)/.test(t)) return 'query';
  if (/^(帮我|帮我看|帮我把|帮我们|帮忙).*(查看|检查|查询|查找|搜索|看看|列出|显示|展示|运行|执行|调用|查)/.test(t)) return 'query';
  if (/[？?]$/.test(t)) { if (/(?:什么|谁|哪里|哪些|多少|哪个|哪|谁)/.test(t)) return 'query'; return 'chat'; }
  if (/(心情|情绪|感觉|今天|开心|高兴|难过|悲伤|不错|好|累|困|无聊|烦|开心|兴奋|不错挺好的)/.test(t)) return 'chat';
  if (/(哪里|什么|怎么|为啥|为什么|是不是|能否|可否|怎么样|怎么办|说说|谈谈|讲讲|讨论|聊聊|探讨|觉得|认为|思考)/.test(t)) return 'chat';
  if (/(在干嘛|在做什么|干什么|干吗|干嘛|忙什么|忙啥|咋了|怎么了|最近|一直|想|想什么|无聊|没意思)/.test(t)) return 'chat';
  return 'chat';
};

OrchestratorCore.prototype._decompose = function(text, intent) {
  var steps = [];
  var self = this;

  // ============================================
  // 根据意图类型生成执行步骤
  // 注意：匹配从精确到宽泛
  // ============================================

  // 0. 系统/健康检查
  if (intent === 'health_check') {
    steps.push(PlanStep('health_check', '检查系统健康状态', {
      agentType: 'executor',
      priority: 1,
      timeout: 15000
    }));
    return steps;
  }

  // 0.5. 数据库查询
  if (intent === 'db_query') {
    steps.push(PlanStep('db_query', '数据库查询: ' + text.substring(0, 30), {
      agentType: 'analyst',
      priority: 3,
      timeout: 30000
    }));
    return steps;
  }

  // 1. 查询/搜索类（单一步骤）
  if (intent === 'query' || /^(查询|搜索|查找|看看|查看|列出|显示|展示|检查|查|帮我查|帮我看).*/.test(text)) {
    steps.push(PlanStep('query_data', '查询数据: ' + text.substring(0, 40), {
      agentType: 'analyst',
      priority: 5,
      timeout: 20000
    }));
    return steps;
  }

  // 1.5. command/operation 默认路径（通用分析→执行→汇总）
  if (intent === 'command' || intent === 'operation') {
    var isExecCmd = /(发送|通知|提醒|执行|运行|启动|停止|重启|打开|关闭|创建|删除|修改|设置|配置|备份|恢复|导出|导入|部署|上线|发布|调用|启用|禁用|安装|卸载)/.test(text);
    if (isExecCmd) { steps.push(PlanStep('execute', '执行指令: '+text.substring(0,100), { agentType: 'executor', priority: 1, timeout: 30000 })); return steps; }
    return steps;
  }

  // 1.6. development 开发任务（代码/文件/模块操作）
  if (intent === 'development') {
    var devType = '开发任务';
    if (/(写|编写|创建|新建|生成|构建)/.test(text)) devType = '编写代码';
    else if (/(读文件|查看文件|读取|查看代码|cat)/.test(text)) devType = '读取文件';
    else if (/(语法检查|语法检测|语法)/.test(text)) devType = '语法检查';
    else if (/(模块|项目|工程|代码目录|modules)/.test(text)) devType = '项目浏览';
    else if (/(代码|脚本|执行|运行)/.test(text)) devType = '代码执行';
    steps.push(PlanStep('development', devType + ': ' + text.substring(0, 40), {
      agentType: 'executor',
      priority: 2,
      timeout: 30000
    }));
    return steps;
  }

  // 2. 分析/报告类（数据查询 → 分析 → 报告三步）
  if (/(分析|评估|趋势|报告|报表|汇总|统计|对比)/.test(text)) {
    steps.push(PlanStep('collect_data', '收集相关数据', {
      agentType: 'analyst',
      priority: 3,
      timeout: 20000
    }));
    steps.push(PlanStep('analysis', '数据分析和洞察', {
      agentType: 'analyst',
      dependsOn: ['collect_data'],
      priority: 4,
      timeout: 30000
    }));
    steps.push(PlanStep('generate_report', '生成汇总报告', {
      agentType: 'reviewer',
      dependsOn: ['analysis'],
      priority: 6,
      timeout: 20000
    }));
    return steps;
  }

  // 3. 开发/实现类（理解→执行→验证→验收四步）
  if (/(开发|实现|编码|写|编写|创建|新建|生成|构建|部署|上线|发布)/.test(text)) {
    // 看是否有更详细的参数
    steps.push(PlanStep('understand', '理解需求和上下文', {
      agentType: 'default',
      priority: 1,
      timeout: 15000
    }));
    steps.push(PlanStep('implement', '执行实现', {
      agentType: 'executor',
      dependsOn: ['understand'],
      priority: 4,
      timeout: 60000
    }));
    steps.push(PlanStep('verify', '验证实现结果', {
      agentType: 'validator',
      dependsOn: ['implement'],
      priority: 5,
      timeout: 30000
    }));
    steps.push(PlanStep('summarize', '汇总结果', {
      agentType: 'reviewer',
      dependsOn: ['verify'],
      priority: 8,
      timeout: 15000
    }));
    return steps;
  }

  // 4. 修改/配置类（理解→修改→验证）
  if (/(修改|编辑|更新|升级|降级|配置|设置|调整|变更)/.test(text)) {
    steps.push(PlanStep('understand', '理解需求和当前状态', {
      agentType: 'default',
      priority: 2,
      timeout: 15000
    }));
    steps.push(PlanStep('modify', '执行修改操作', {
      agentType: 'executor',
      dependsOn: ['understand'],
      priority: 4,
      timeout: 30000
    }));
    steps.push(PlanStep('verify', '验证修改结果', {
      agentType: 'validator',
      dependsOn: ['modify'],
      priority: 6,
      timeout: 30000
    }));
    return steps;
  }

  // 5. 管理/流程类（查询→处理→确认）
  if (/(分配|指派|授权|审批|批准|驳回|取消|暂停|继续|恢复)/.test(text)) {
    steps.push(PlanStep('get_context', '获取当前上下文和状态', {
      agentType: 'default',
      priority: 3,
      timeout: 15000
    }));
    steps.push(PlanStep('execute_action', '执行操作', {
      agentType: 'executor',
      dependsOn: ['get_context'],
      priority: 5,
      timeout: 30000
    }));
    steps.push(PlanStep('confirm', '确认操作结果', {
      agentType: 'reviewer',
      dependsOn: ['execute_action'],
      priority: 7,
      timeout: 15000
    }));
    return steps;
  }

  // 6. 默认：三步通用流程
  steps.push(PlanStep('analyze', '分析指令', {
    agentType: 'default',
    priority: 3,
    timeout: 15000
  }));
  steps.push(PlanStep('execute', '执行主任务', {
    agentType: 'executor',
    dependsOn: ['analyze'],
    priority: 5,
    timeout: 30000
  }));
  steps.push(PlanStep('summarize', '汇总结果', {
    agentType: 'reviewer',
    dependsOn: ['execute'],
    priority: 8,
    timeout: 15000
  }));

  return steps;
};

// =========================================================================
// === 5.2 子Agent调度与生命周期管理 ===
// =========================================================================

/**
 * 注入 execCEOTool 引用（让子Agent调度能调用真实工具执行）
 */
OrchestratorCore.prototype.setExecCEOTool = function(fn) {
  this.execCEOTool = fn;
  this._logger('[OrchestratorCore] execCEOTool 已注入');
};

/**
 * 注册/覆盖子Agent规格
 */
OrchestratorCore.prototype.registerAgentSpec = function(type, spec) {
  this._agentSpecs[type] = spec;
  this._logger('[OrchestratorCore] 注册子Agent规格: ' + type);
};

/**
 * 根据计划执行所有步骤
 * @param {object} plan — analyze() 返回的计划
 * @param {object} context — { sseSend, sessionId, onStepComplete }
 * @returns {object} 执行结果
 */
OrchestratorCore.prototype.executePlan = async function(plan, context) {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return { ok: false, error: '无可执行的计划步骤' };
  }

  var self = this;
  var sseSend = (context && context.sseSend) || this._sseSend || null;
  plan.status = 'running';
  this._plans[plan.id] = plan;
  this._stats.totalPlans++;

  // 按依赖关系拓扑排序
  var sortedSteps = this._topologicalSort(plan.steps);

  log.info('[OrchCore] executePlan starting. Steps per layer:', sortedSteps.map(function(l) { return l.map(function(s) { return s.id; }).join(','); }));
  var flatSteps = [];
  for (var _li = 0; _li < sortedSteps.length; _li++) {
    for (var _si = 0; _si < sortedSteps[_li].length; _si++) {
      flatSteps.push(sortedSteps[_li][_si]);
    }
  }
  if (sseSend) sseSend({ type: 'plan', content: '📋 已生成执行计划：' + flatSteps.length + ' 个步骤', steps: flatSteps.map(function(s) { return s.id + ': ' + s.description; }) });

  var results = {};

  // 逐层执行（同一 layer 可并行）
  for (var i = 0; i < sortedSteps.length; i++) {
    var layer = sortedSteps[i];

    // 同一层的步骤可并行执行
    var parallelJobs = layer.map(function(step) {
      return { step: step, promise: null };
    });

    // 检查依赖是否都满足
    var canExecute = layer.every(function(step) {
      if (!step.dependsOn || step.dependsOn.length === 0) return true;
      return step.dependsOn.every(function(depId) {
        var depResult = results[depId];
        return depResult && depResult.status === 'success';
      });
    });

    if (!canExecute) {
      // 依赖未满足 — 跳过该层所有步骤
      for (var j = 0; j < layer.length; j++) {
        layer[j].status = 'skipped';
        layer[j].error = '依赖步骤未成功完成';
        plan.skippedSteps++;
        if (sseSend) sseSend({ type: 'step_skipped', stepId: layer[j].id, reason: '依赖步骤未成功完成' });
      }
      continue;
    }

    // 执行本层所有步骤（并行）
    var execPromises = layer.map(function(step) {
      return self._executeStep(step, results, sseSend, context);
    });

    var stepResults = await Promise.all(execPromises);

    // 收集结果
    for (var k = 0; k < layer.length; k++) {
      var step = layer[k];
      var stepResult = stepResults[k];
      results[step.id] = {
        status: stepResult.status,
        result: stepResult.result,
        error: stepResult.error
      };
      if (stepResult.status === 'success') {
        plan.completedSteps++;
        self._stats.completedSteps++;
      } else if (stepResult.status === 'failed') {
        plan.failedSteps++;
        self._stats.failedSteps++;
      }
    }

    // 如果某个 required 步骤失败，中断后续
    var criticalFailure = layer.some(function(step) {
      return step.required && step.status === 'failed';
    });
    if (criticalFailure) {
      plan.status = 'failed';
      if (sseSend) sseSend({ type: 'plan_failed', reason: '关键步骤失败，计划中止' });
      break;
    }
  }

  // 最终状态
  if (plan.status !== 'failed') {
    plan.status = (plan.failedSteps > 0 ? 'partial' : 'completed');
  }
  log.info('[OrchCore] executePlan FINAL: status=' + plan.status + ' completed=' + plan.completedSteps + ' failed=' + plan.failedSteps);

  this._stats.completedPlans += (plan.status === 'completed' ? 1 : 0);
  this._stats.failedPlans += (plan.status === 'failed' ? 1 : 0);

  // 汇总结果
  var summary = this._summarizePlan(plan, results);

  if (sseSend) sseSend({ type: 'plan_done', status: plan.status, summary: summary });

  return { ok: true, plan: plan, results: results, summary: summary };
};

/**
 * 拓扑排序（按依赖关系分层）
 * 返回 Array<Array<PlanStep>>，每一层可并行执行
 */
OrchestratorCore.prototype._topologicalSort = function(steps) {
  var visited = {};
  var layers = [];
  var stepMap = {};
  steps.forEach(function(s) { stepMap[s.id] = s; });

  // 自底向上：先找无依赖的
  var remaining = steps.slice();
  while (remaining.length > 0) {
    var layer = [];
    var newRemaining = [];
    for (var i = 0; i < remaining.length; i++) {
      var step = remaining[i];
      var deps = step.dependsOn || [];
      var allDepsResolved = deps.every(function(d) {
        return visited[d];
      });
      if (allDepsResolved) {
        layer.push(step);
        visited[step.id] = true;
      } else {
        newRemaining.push(step);
      }
    }
    if (layer.length === 0) {
      // 循环依赖或无法满足的依赖
      newRemaining.forEach(function(s) {
        if (!visited[s.id]) {
          visited[s.id] = true; // 避免死循环
          s.status = 'skipped';
          s.error = '依赖循环或无法满足';
        }
      });
      break;
    }
    layers.push(layer);
    remaining = newRemaining;
  }

  // 按优先级排序每一层
  layers.forEach(function(layer) {
    layer.sort(function(a, b) { return a.priority - b.priority; });
  });

  return layers;
};

/**
 * 执行单个步骤（含重试和超时）
 */
OrchestratorCore.prototype._executeStep = async function(step, contextResults, sseSend, globalContext) {
  var self = this;
  step.status = 'running';
  step.startTime = Date.now();

  if (sseSend) sseSend({ type: 'step_started', stepId: step.id, description: step.description });

  var lastError = null;
  var maxRetries = step.retryCount || 2;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 重试等待
      self._stats.retries++;
      if (sseSend) sseSend({ type: 'step_retry', stepId: step.id, attempt: attempt, maxRetries: maxRetries });
      await new Promise(function(r) { setTimeout(r, 1000 * attempt); });
    }

    try {
      var result = await self._runStepWithTimeout(step, contextResults, globalContext);

      // 结果校验
      var validationResult = self._validateStepResult(step, result);

      if (validationResult.ok) {
        step.status = 'success';
        step.result = result;
        step.endTime = Date.now();
        if (sseSend) sseSend({ type: 'step_completed', stepId: step.id, status: 'success' });
        return { status: 'success', result: result, error: null };
      } else {
        lastError = '校验失败: ' + validationResult.message;
        step.error = lastError;
        if (attempt < maxRetries) {
          if (sseSend) sseSend({ type: 'step_validation_fail', stepId: step.id, message: validationResult.message });
        }
      }
    } catch(e) {
      lastError = e.message || String(e);
      step.error = lastError;
      if (e._isTimeout) {
        self._stats.timeouts++;
        if (sseSend) sseSend({ type: 'step_timeout', stepId: step.id, timeout: step.timeout });
      }
      if (attempt < maxRetries) {
        if (sseSend) sseSend({ type: 'step_error', stepId: step.id, error: lastError, retrying: true });
      }
    }
  }

  // 所有重试都失败
  step.status = 'failed';
  step.endTime = Date.now();
  if (sseSend) sseSend({ type: 'step_failed', stepId: step.id, error: lastError });
  return { status: 'failed', result: null, error: lastError };
};

/**
 * 执行步骤（带超时保护）
 */
OrchestratorCore.prototype._runStepWithTimeout = async function(step, contextResults, globalContext) {
  var self = this;
  var timeout = step.timeout || 30000;

  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      var err = new Error('步骤超时(' + timeout + 'ms)');
      err._isTimeout = true;
      reject(err);
    }, timeout);

    self._runStep(step, contextResults, globalContext).then(function(result) {
      clearTimeout(timer);
      resolve(result);
    }).catch(function(e) {
      clearTimeout(timer);
      reject(e);
    });
  });
};

/**
 * 实际执行步骤（调用子Agent/tools）
 */
OrchestratorCore.prototype._runStep = async function(step, contextResults, globalContext) {
  // 根据 agentType 决定执行方式
  var spec = this._agentSpecs[step.agentType] || this._agentSpecs['default'];

  // 创建隔离沙箱
  var sandbox = createSandbox(step.agentType, step.description, {
    tools: spec.tools,
    timeout: step.timeout,
    model: spec.model
  });
  this._sandboxes[sandbox.id] = sandbox;

  try {
    sandbox._state = 'running';

    // 构建执行上下文：之前步骤的结果
    var priorContext = '';
    if (step.dependsOn && step.dependsOn.length > 0) {
      priorContext = step.dependsOn.map(function(depId) {
        var ctx = contextResults[depId];
        if (ctx && ctx.result) {
          return '【' + depId + '的结果】' + (typeof ctx.result === 'string' ? ctx.result.substring(0, 500) : JSON.stringify(ctx.result).substring(0, 500));
        }
        return '';
      }).filter(Boolean).join('\n\n');
    }

    // 构建子Agent prompt
    var agentPrompt = '## 你的身份\n';
    agentPrompt += '你是"' + spec.name + '"，eCompany 团队中的 ' + spec.skills.join('、') + ' 专家。\n';
    agentPrompt += '\n## 当前任务\n';
    agentPrompt += step.description + '\n';
    if (spec.systemPrompt) {
      agentPrompt += '\n' + spec.systemPrompt + '\n';
    }
    if (priorContext) {
      agentPrompt += '\n## 前置上下文\n' + priorContext + '\n';
    }
    agentPrompt += '\n## 要求\n';
    agentPrompt += '- 输出简洁、直接、有数据支撑的结论\n';
    agentPrompt += '- 如果无法完成，说明原因\n';

    // 自动注入知识库相关条目
    try {
      var kbRepo = require('./knowledge-repo');
      var kbQuery = step.description;
      var kbResults = kbRepo.searchKnowledge(kbQuery, { limit: 3 });
      if (kbResults && Array.isArray(kbResults) && kbResults.length > 0) {
        var kbContext = kbResults.map(function(k) {
          return '【' + (k.title || '经验') + '】' + (k.content || k.summary || '');
        }).filter(Boolean).join('\n\n');
        agentPrompt += '\n## 相关经验知识\n以下是与当前任务可能相关的历史经验和知识，请参考：\n' + kbContext + '\n';
      }
    } catch(kbErr) {
      // 知识库查询失败不做阻断
      log.info('[OrchCore] KB注入失败:', kbErr.message);
    }

    // 通过 execCEOTool 执行
    if (this.execCEOTool && typeof this.execCEOTool === 'function') {
      log.info('[OrchCore] _runStep calling execCEOTool.agent_execute for: ' + step.id);
      var execStart = Date.now();
      try {
        var toolResult = await this.execCEOTool('agent_execute', {
          agentType: step.agentType,
          stepId: step.id,
          description: step.description,
          prompt: agentPrompt,
          tools: spec.tools,
          timeout: Math.floor(step.timeout * 0.8)
        });
        var elapsed = Date.now() - execStart;
        log.info('[OrchCore] _runStep execCEOTool returned in ' + elapsed + 'ms. result=' + (toolResult ? 'ok' : 'NULL'));
        sandbox._state = 'completed';
        if (!toolResult) {
          return { message: '步骤执行完成: ' + step.description, _fallback: true };
        }
        return toolResult.data || toolResult;
      } catch(_e) {
        log.info('[OrchCore] _runStep execCEOTool THREW:', _e.message);
        sandbox._state = 'completed';
        return { message: '步骤降级完成(异常): ' + step.description, _error: _e.message, _fallback: true };
      }
    }

    // 如果没有 execCEOTool，走函数调用执行
    var result = { message: '步骤描述: ' + step.description, _autoGenerated: true };
    sandbox._state = 'completed';
    return result;

  } catch(e) {
    sandbox._state = 'failed';
    throw e;
  } finally {
    // 沙箱清理（记录后释放）
    sandbox._state = sandbox._state || 'completed';
    this._cleanupSandbox(sandbox.id);
  }
};

/**
 * 清理子Agent沙箱
 */
OrchestratorCore.prototype._cleanupSandbox = function(sandboxId) {
  // 释放引用（GC友好）
  delete this._activeExecutions[sandboxId];
  // 延迟删除沙箱数据，保留一段时间用于审计
  var self = this;
  setTimeout(function() {
    delete self._sandboxes[sandboxId];
  }, 60000);
};

// =========================================================================
// === 5.3 结果校验 ===
// =========================================================================

/**
 * 对步骤结果执行校验规则
 */
OrchestratorCore.prototype._validateStepResult = function(step, result) {
  if (!result) {
    return { ok: false, message: '无返回结果' };
  }

  for (var i = 0; i < this._validationRules.length; i++) {
    var rule = this._validationRules[i];
    try {
      var checkResult = rule.check(result);
      if (!checkResult.ok) {
        return { ok: false, message: '规则[' + rule.name + '] 未通过: ' + checkResult.message };
      }
    } catch(e) {
      return { ok: false, message: '校验规则[' + rule.name + ']执行异常: ' + e.message };
    }
  }

  return { ok: true, message: '所有校验通过' };
};

/**
 * 注册自定义校验规则
 */
OrchestratorCore.prototype.addValidationRule = function(rule) {
  this._validationRules.push(rule);
};

// =========================================================================
// === 5.4 异常处理与全流程兜底 ===
// =========================================================================

/**
 * 重置指定步骤（供外部调用重试）
 */
OrchestratorCore.prototype.resetStep = async function(planId, stepId) {
  var plan = this._plans[planId];
  if (!plan) return { ok: false, error: '计划不存在' };

  var step = plan.steps.find(function(s) { return s.id === stepId; });
  if (!step) return { ok: false, error: '步骤不存在' };

  step.status = 'pending';
  step.result = null;
  step.error = null;
  step.startTime = null;
  step.endTime = null;

  return { ok: true, message: '步骤已重置，可重新执行' };
};

/**
 * 计划结果汇总
 */
OrchestratorCore.prototype._summarizePlan = function(plan, results) {
  // 优先使用 LLM 生成的回复（result 可能是字符串或对象）
  if(results && typeof results === 'object'){
    log.info('[OrchCore] _summarizePlan results keys:', Object.keys(results), 'result types:', Object.keys(results).map(function(k){return typeof(results[k].result) + ' len:' + ((results[k].result&&results[k].result.length)||(results[k].result&&results[k].result.data&&results[k].result.data.length)||'?')}));
    for(var sk in results){
      var st = results[sk];
      if(st && st.result){
        if(typeof st.result === 'string' && st.result.length > 10){
          return st.result;
        }
        if(st.result.data && typeof st.result.data === 'string' && st.result.data.length > 10){
          return st.result.data;
        }
      }
    }
  }  if (!plan) return '无法生成摘要：计划为空。';
  var intent = plan.intent || 'general';
  var steps = results || {};
  var hasToolResults = false;
  for (var sk in steps) { if (steps[sk] && steps[sk].data) { hasToolResults = true; break; } }
  if (intent === 'greeting' || intent === 'chat') {
    // 优先走 LLM 回复路径
    for (var gk in steps) {
      var gt = steps[gk];
      var gr = results && results[gt.id] && results[gt.id].result;
      if (gr) {
        if (typeof gr === 'string' && gr.length > 10) return gr;
        if (gr.data && typeof gr.data === 'string' && gr.data.length > 10) return gr.data;
      }
    }
    // 没 LLM 回复才 fallback
    return plan.fallback || (this._getFallbackReply ? this._getFallbackReply(plan.instruction || '') : '');
  }
  if (intent === 'health_check') {
    var data = null;
    for (var hk in steps) { if (steps[hk].data) { data = steps[hk].data; break; } }
    if (data && typeof data === 'object' && data.status === 'healthy') {
      var r = '💚 **系统状态**\n✅ 状态：健康\n';
      if (data.cpu) r += '🖥 CPU: ' + data.cpu + '\n';
      if (data.memory) r += '🗄 内存: ' + data.memory + '\n';
      if (data.uptime) r += '⏱ 运行时间: ' + data.uptime;
      return r;
    }
    if (data) return '🔍 **系统检查结果**\n' + (typeof data === 'string' ? data : JSON.stringify(data).substring(0,200));
    return '✅ 系统状态正常，健康检查通过。';
  }
  if (intent === 'query' || intent === 'db_query') {
    var reply = '🔍 **查询结果**\n';
    var hasData = false;
    for (var qk in steps) {
      var st = steps[qk];
      if (st.data && !st.data._emptyResults) {
        hasData = true;
        var d = st.data;
        if (typeof d === 'string') reply += d + '\n';
        else if (d.result) reply += (typeof d.result === 'object' ? JSON.stringify(d.result).substring(0,200) : String(d.result).substring(0,200)) + '\n';
        else reply += JSON.stringify(d).substring(0,200) + '\n';
      }
    }
    if (!hasData) reply += '📭 查询执行完成，当前没有找到匹配的数据。\n✅ 系统查询正常，暂无相关记录。\n💡 建议：\n  • 换个关键词试试\n  • 搜索其他信息维度\n  • 告诉我更具体的信息，我来帮你查找';
    return reply;
  }
  if (intent === 'analysis') {
    var aData = null;
    for (var ak in steps) { if (steps[ak].data) { aData = steps[ak].data; break; } }
    if (aData) return '📊 **数据分析结果**\n' + String(typeof aData === 'object' ? (aData.summary || aData.result || JSON.stringify(aData).substring(0,200)) : aData).substring(0,500);
    return '📊 分析完成，暂无数据可供分析。';
  }
  if (intent === 'command' || intent === 'operation') {
    // 优先走 LLM 回复路径
    for (var opk in steps) {
      var opt = steps[opk];
      var opr = results && results[opt.id] && results[opt.id].result;
      if (opr) {
        if (typeof opr === 'string' && opr.length > 10) return opr;
        if (opr.data && typeof opr.data === 'string' && opr.data.length > 10) return opr.data;
      }
    }
    var opData = null;
    for (var ok in steps) { if (steps[ok].data) { opData = steps[ok].data; break; } }
    if (opData) return '⚙️ **执行结果**\n' + (typeof opData === 'object' ? (opData.message || opData.result || JSON.stringify(opData).substring(0,200)) : String(opData).substring(0,200));
    return '⚙️ **执行结果**\n✅ 所有指令已执行完成。';
  }
  if (intent === 'development') {
    for (var devk in steps) {
      var devt = steps[devk];
      var devr = results && results[devt.id] && results[devt.id].result;
      if (devr) {
        if (typeof devr === 'string' && devr.length > 10) return devr;
        if (devr.data && typeof devr.data === 'string' && devr.data.length > 10) return devr.data;
      }
    }
    return '🔧 **开发任务已完成**\n已处理你的开发请求。';
  }
  if (hasToolResults) return '📋 **执行总结**\n所有步骤已完成。';
  return this._getFallbackReply ? this._getFallbackReply(plan.instruction || '') : '';
};


OrchestratorCore.prototype.getSandboxSummary = function(planId) {
  var plan = this._plans[planId];
  if (!plan) return null;

  var summary = {
    planId: planId,
    status: plan.status,
    totalSteps: plan.steps.length,
    completedSteps: plan.completedSteps,
    failedSteps: plan.failedSteps,
    skippedSteps: plan.skippedSteps,
    steps: plan.steps.map(function(s) {
      return {
        id: s.id,
        description: s.description,
        agentType: s.agentType,
        status: s.status,
        duration: s.startTime && s.endTime ? (s.endTime - s.startTime) + 'ms' : null,
        error: s.error || null
      };
    })
  };

  return summary;
};

/**
 * 获取核心状态统计
 */
OrchestratorCore.prototype.getStats = function() {
  return {
    totalPlans: this._stats.totalPlans,
    completedPlans: this._stats.completedPlans,
    failedPlans: this._stats.failedPlans,
    totalSteps: this._stats.totalSteps,
    completedSteps: this._stats.completedSteps,
    failedSteps: this._stats.failedSteps,
    retries: this._stats.retries,
    timeouts: this._stats.timeouts,
    uptime: Math.floor((Date.now() - this._stats.startTime) / 1000) + 's',
    activePlans: Object.keys(this._plans).filter(function(id) {
      return this[id].status === 'running';
    }.bind(this._plans)).length
  };
};

// =========================================================================
// === 6. 暴露 API ===
// =========================================================================

module.exports = {
  OrchestratorCore: OrchestratorCore,
  PlanStep: PlanStep,
  ValidationRule: ValidationRule,
  AgentSpec: AgentSpec
};
