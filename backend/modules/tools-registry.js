/**
 * eCompany 统一工具注册表 v1.0
 * 
 * 所有 OpenClaw 风格工具 + eCompany 原生工具的统一入口
 * 
 * 工具来源：
 * - openclaw-bridge.js 的 BRIDGE_TOOLS（5个）
 * - tools-executor.js 的 FILE_TOOLS（文件操作）
 * - CEO execCEOTool 的内置工具（24个管理工具）
 * - OpenClaw Gateway 可用时从 Gateway 获取
 * 
 * 每个工具格式：
 * {
 *   id: 'tool-id',           // 唯一标识
 *   name: 'tool_name',       // API调用名
 *   description: '...',      // AI看了知道何时调用
 *   parameters: {...},       // JSON Schema
 *   handler: async (args) => {}, // 实际执行函数
 *   skills: [...],           // 映射到哪些技能
 *   permission: 'basic|advanced|admin', // 权限要求
 * }
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
var skillProxy = require('./skill-proxy');
const BASE = path.join(__dirname, '..');

// ========== 1. CEO 内置工具 ==========
// 复用 server-dev.js 中 execCEOTool 的所有工具
// 注意：这里只定义 schema，实际执行通过 execCEOTool

var CEO_TOOLS = [
  { type: 'function', function: { name: 'query_team', description: '查询团队成员信息', parameters: {} } },
  { type: 'function', function: { name: 'assign_task', description: '给成员分配新任务。分配任务时必须填写详细的描述说明，让员工知道具体要做什么', parameters: {} } },
  { type: 'function', function: { name: 'list_tasks', description: '列出当前所有任务', parameters: {} } },
  { type: 'function', function: { name: 'search_web', description: '搜索网络获取最新信息。当需要查询实时资讯、查找资料、搜索问题时使用此工具。调用外部搜索引擎返回最相关结果。搜索关键词尽量精确一些。', parameters: {} } },
  { type: 'function', function: { name: 'get_weather', description: '获取天气信息', parameters: {} } },
  { type: 'function', function: { name: 'read_file', description: '读取指定文件的内容。输入必须是文件路径，不能是目录路径。先用 list_directory 查看目录内容再读取具体文件。常见文件后缀：.md, .txt, .js, .json, .vue, .css, .html, .py, .cjs, .yaml, .yml', parameters: {} } },
  { type: 'function', function: { name: 'write_file', description: '写入内容到指定文件（覆盖模式）。需要文件路径和内容。只支持覆盖，不支持追加。请确保目录存在，否则会报错。', parameters: {} } },
  { type: 'function', function: { name: 'exec', description: '在服务器上执行 shell 命令(CEO 专用,解压用file_manager不要用exec)', parameters: {} } },
  { type: 'function', function: { name: 'system_health', description: '检查系统健康(服务器、数据库、AI提供商、内存、前端)', parameters: {} } },
  { type: 'function', function: { name: 'skill_manager', description: '查看已安装的技能列表、安装新技能(查询技能用这个,不要用 read_file)', parameters: {} } },
  { type: 'function', function: { name: 'channel_config', description: '查看通讯渠道在线状态:各渠道(微信/钉钉/飞书/企微/QQ/TG/DC等)是否在线、各能做什么(收发文字/文件/图片/语音)', parameters: {} } },
  { type: 'function', function: { name: 'file_manager', description: '文件管理:解压ZIP、列目录、复制移动文件、查看文件信息(解压用tar,正确处理中文路径)', parameters: {} } },
  { type: 'function', function: { name: 'harness_status', description: '查看 Harness 边界监控状态', parameters: {} } },
  { type: 'function', function: { name: 'harness_errors', description: '查看 Harness 错误趋势和自动工单', parameters: {} } },
  { type: 'function', function: { name: 'harness_sla', description: '查看 Harness SLA 统计数据', parameters: {} } },
  { type: 'function', function: { name: 'harness_dag', description: '查看任务依赖图谱', parameters: {} } },
  { type: 'function', function: { name: 'harness_agent_control', description: '设置指定 Agent 的速率限制和行为覆盖', parameters: {} } },
  { type: 'function', function: { name: 'harness_habits_analyze', description: '分析老板操作习惯和偏好趋势(带记忆衰减)\nCEO/安全总监专用:查看用户习惯演变', parameters: {} } },
  { type: 'function', function: { name: 'harness_habits_record', description: '手动记录一条老板的操作习惯或偏好', parameters: {} } },
  { type: 'function', function: { name: 'git_status', description: '查看eCompany项目Git仓库状态(修改文件、暂存区、分支)', parameters: {} } },
  { type: 'function', function: { name: 'git_commit', description: '提交Git变更: add + commit', parameters: { type:'object', properties:{ message:{type:'string',description:'提交信息'}, files:{type:'string',description:'要add的文件路径(空格分隔,空=全部)'} }, required:['message'] } } },
  { type: 'function', function: { name: 'git_log', description: '查看Git提交历史', parameters: { type:'object', properties:{ count:{type:'number',description:'显示条数(默认10)'} } } } },
  { type: 'function', function: { name: 'git_branch', description: '创建/切换/查看Git分支', parameters: { type:'object', properties:{ action:{type:'string',enum:['list','create','switch','delete'],description:'操作类型'}, name:{type:'string',description:'分支名(create/switch/delete时需要)'} }, required:['action'] } } },
  { type: 'function', function: { name: 'git_diff', description: '查看Git当前工作区与暂存区的差异', parameters: {} } },

  { type: 'function', function: { name: 'harness_habits_confirm', description: '确认或拒绝一条待验证的偏好推测\n老板确认回路:AI推测的习惯需要老板确认后才写入核心库', parameters: {} } },
  { type: 'function', function: { name: 'harness_habits_pending', description: '列出所有待老板确认的偏好推测', parameters: {} } },
  { type: 'function', function: { name: 'compliance_audit_tasks', description: '合规审计:审计当前所有任务的质量和状态,发现不合规项\n合规审计小组专用', parameters: {} } },
  { type: 'function', function: { name: 'compliance_audit_product', description: '合规审计:审计产品交付物质量和合规性\n合规审计小组专用', parameters: {} } },
  { type: 'function', function: { name: 'compliance_report', description: '生成合规审计报告,汇总任务和产品的审计结果\n合规审计小组专用', parameters: {} } },
  { type: 'function', function: { name: 'harness_boundary_reset', description: '重置 Harness 边界统计', parameters: {} } },
  { type: 'function', function: { name: 'harness_rules_list', description: '查看 Harness 规则引擎的所有规则(可按状态/类型过滤) 合规审计Agent/安全审计Agent专用', parameters: {} } },
  { type: 'function', function: { name: 'harness_rules_propose', description: '提议新规则:合规审计Agent发现规则缺口时提出,进入proposed状态,需安全Agent确认后生效', parameters: {} } },
  { type: 'function', function: { name: 'harness_rules_confirm', description: '确认规则:安全审计Agent确认合规审计Agent提出的规则 多签确认流程 propose confirm activate', parameters: {} } },
  { type: 'function', function: { name: 'harness_rules_reject', description: '驳回规则:安全审计Agent驳回不合规的规则提议', parameters: {} } },
  { type: 'function', function: { name: 'harness_rules_pending', description: '列出所有待确认的规则提议(安全审计Agent审批用)', parameters: {} } },
  { type: 'function', function: { name: 'harness_proposal_submit', description: '提交结构化方案供规则引擎验证,通过放行不通过打回 tool_call/task_execute/config_change', parameters: {} } },
  { type: 'function', function: { name: 'harness_proposal_appeal', description: '申诉被阻断的方案:规则引擎打回时提交申诉理由,需VP以上审批豁免', parameters: {} } },
  { type: 'function', function: { name: 'harness_proposal_audit', description: '查看提案审计日志:追溯方案提交/阻断/申诉/豁免记录,合规审计Agent专用', parameters: {} } },
  { type: 'function', function: { name: 'memory_write', description: '核心记忆库写入器:将对话摘要、关键决策、任务记录、员工表现等直接写入核心记忆库\n自动按规则入库,无需手动确认', parameters: {} } },
  { type: 'function', function: { name: 'memory_search', description: '核心记忆库检索器:按关键词、时间范围、标签等条件检索历史记忆\n支持模糊搜索,按优先级排序返回', parameters: {} } },
  { type: 'function', function: { name: 'memory_version', description: '记忆版本管理器:查看记忆修改历史、回滚到某个版本,防止误写入导致信息丢失\n管理记忆库的版本快照', parameters: {} } },
  { type: 'function', function: { name: 'complete_task', description: '核销任务:将任务标记为已完成,填写完成结果和评分', parameters: {} } },
  { type: 'function', function: { name: 'review_task', description: '审核员工提交的任务:批准或驳回,给出反馈', parameters: {} } },
  { type: 'function', function: { name: 'reassign_task', description: '将停滞或逾期任务重新分配给其他人', parameters: {} } },
  { type: 'function', function: { name: 'tencent_docs_create', description: '创建腾讯在线文档(支持Word/Excel/幻灯片/思维导图/流程图/智能表格)', parameters: {} } },
  { type: 'function', function: { name: 'tencent_meeting_create', description: '创建腾讯会议预约', parameters: {} } },
  { type: 'function', function: { name: 'tencent_survey_create', description: '创建腾讯问卷', parameters: {} } },
  { type: 'function', function: { name: 'system_check_provider', description: '检查指定AI提供商连通性(如DeepSeek),测试API是否可用', parameters: {} } },
  { type: 'function', function: { name: 'system_check_bridge', description: '检查指定通讯渠道桥接状态(微信/QQ/飞书/钉钉/企微/腾讯云)', parameters: {} } },
  { type: 'function', function: { name: 'system_logs', description: '查看系统最近日志,排查错误,按级别筛选', parameters: {} } },
  { type: 'function', function: { name: 'system_processes', description: '查看系统所有运行中的Node.js进程列表,确认各桥接和子服务是否存活', parameters: {} } },
  { type: 'function', function: { name: 'system_disk', description: '查看服务器磁盘使用情况,预警空间不足', parameters: {} } },
  { type: 'function', function: { name: 'bi_query', description: '数据分析与可视化:当用户想查看系统统计、趋势图表、日报报表或活跃排行时调用。用户在问[查数据][看趋势][日报][排行]时优先使用。参数query填overview(总览)/trend(趋势)/report(日报)/leaderboard(排行)', parameters: {} } },
  { type: 'function', function: { name: 'kb_search', description: '知识库搜索:当用户想搜索已知知识、技术资料、配置信息、历史文档时调用。用户在问[找一下][查资料][搜索知识][有没有关于xxx的资料]时优先使用', parameters: {} } },
  { type: 'function', function: { name: 'kb_create', description: '知识库创建:当用户想保存一条知识、技术文档、配置说明到知识库时调用。用户说[记一下][保存这条][新建知识]时使用。系统自动分类+图谱关联', parameters: {} } },
  { type: 'function', function: { name: 'auto_run_flow', description: '自动化RPA:运行预设的自动化流程。用户说[自动跑一下][执行自动化][帮我抓取][监控网站]时调用。模板:scheduled_report(日报)/scrape_news(新闻)/monitor_website(监控)', parameters: {} } },
  { type: 'function', function: { name: 'integration_status', description: '外部系统集成状态:用户问[渠道状态][集成情况][飞书/钉钉/企微能不能用]时调用。查看各渠道配置状态和审批/日历/文档功能可用情况', parameters: {} } },
  { type: 'function', function: { name: 'evolve_run', description: '系统自我演化:用户说[自检一下][自我修复][运行演化][检查系统问题]时调用。完整循环:检测问题->分析根因->生成修复->验证推广。每30分钟自动触发', parameters: {} } },
  { type: 'function', function: { name: 'skill_api_testing', description: 'API测试:测试系统API端点的可用性和响应时间。用户说[测一下API][接口测试][端点检查]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_code_review', description: '代码审查:审查一段代码的质量、安全性和性能。用户说[审查代码][review代码][代码评审]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_system_analyze', description: '系统分析:全面分析eCompany系统健康状态,包括API趋势、桥接状态、错误日志。用户说[系统分析][检查系统][健康检查]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_task_dispatch', description: '任务分发:将任务拆解并分配给AI团队。用户说[分派任务][分配工作][派活]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_file_manager', description: '文件管理:查看目录结构、文件信息和系统路径。用户说[查看文件][目录结构][系统路径]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_risk_assessment', description: '风险评估:识别系统安全风险,检查API暴露面、鉴权状况和凭证配置。用户说[风险评估][安全检查][安全审计]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_web_search', description: '网络搜索:通过Bing搜索获取最新信息,用户说[搜一下][网上查]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_docker_helper', description: 'Docker辅助:检查Docker和容器状态,用户说[docker][容器]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_python_helper', description: 'Python:检查Python环境,用户说[Python][执行代码]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_vue_helper', description: 'Vue3:Vue3前端开发指南,用户说[Vue][前端开发]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_project_board', description: '项目看板:查看员工和调用统计,用户说[项目状态][看板]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_channel_config', description: '渠道状态:查看飞书/钉钉/企微/微信/QQ等渠道配置状态和各渠道可用功能(文字/文件/图片/语音),用户说[渠道][配置]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_browser_check', description: '浏览器自动化:检查Puppeteer/Playwright可用性', parameters: {} } },
  { type: 'function', function: { name: 'skill_bluebubbles_guide', description: 'iMessage:Apple iMessage BlueBubbles集成指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_dingtalk_guide', description: '钉钉集成:钉钉开放平台审批/日历/机器人集成指南,用户说[钉钉]时调用', parameters: {} } },
  { type: 'function', function: { name: 'skill_dingtalk_rules', description: '钉钉规则:钉钉渠道消息格式和事件处理规则指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_dingtalk_troubleshoot', description: '钉钉故障:钉钉ECONNRESET等常见问题的排查指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_dws_cli', description: 'DWS CLI:钉钉DWS命令行工具用法指导', parameters: {} } },
  { type: 'function', function: { name: 'skill_feishu_doc', description: '飞书文档:飞书文档协同API集成指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_feishu_drive', description: '飞书云盘:飞书云盘文件管理API集成指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_feishu_perm', description: '飞书权限:飞书权限管理API集成指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_feishu_wiki', description: '飞书知识库:飞书Wiki API集成指南', parameters: {} } },
  { type: 'function', function: { name: 'skill_provider_status', description: 'AI提供商检查:查看所有AI提供商Key状态。用户说[提供商][AI厂商][模型Key][哪个AI能用]时调用', parameters: {} } },
  { type: 'function', function: { name: 'search_tool_memory', description: '搜索历史工具调用记录，查看之前执行过哪些工具、效果如何', parameters: {} } },
  { type: 'function', function: { name: 'goal_manager', description: '管理当前团队目标。支持列出、创建、更新、完成、删除目标。用户提到[目标][目标管理][团队目标]时调用。', parameters: {} } },
  { type: 'function', function: { name: 'execute_openclaw_skill', description: '执行OpenClaw技能系统中的一个技能，包括网络搜索、文件分析、API测试等技能。用户提到[用技能][调用技能][开技能][技能库]时调用。调用前先用list查看可用技能列表', parameters: {} } },
  { type: 'function', function: { name: 'model_management', description: '大模型配置管理：列出、添加、删除、切换默认模型和路由策略。用户说[切换模型][新增提供商][配置API][模型设置]时调用', parameters: {} } },
  { type: 'function', function: { name: 'query_models', description: '查询工作台可用的模型列表和状态。用户说[有哪些模型][可用模型][模型版本]时调用', parameters: {} } },
  { type: 'function', function: { name: 'system_cpu_memory', description: 'CPU/内存实时数据：查看服务器CPU使用率、内存占用、进程资源。用户说[CPU][内存][服务器负载][资源使用]时调用', parameters: {} } },
  { type: 'function', function: { name: 'system_network_latency', description: '网络延迟检测：测试各服务端点的响应时间和外网连通性。用户说[延迟][网络][响应时间][ping]时调用', parameters: {} } },
  { type: 'function', function: { name: 'api_request_stats', description: 'API请求统计：查看每次AI调用的耗时、成功/失败、使用模型。用户说[请求统计][API统计][调用记录][用量]时调用', parameters: {} } },
  { type: 'function', function: { name: 'system_version', description: '系统版本信息：查看当前系统版本号、构建日期、部署时间、Node版本。用户说[版本][当前版本][系统版本][部署时间]时调用', parameters: {} } },
  { type: 'function', function: { name: 'system_update', description: '用于更新系统代码或配置，请不要使用。用户如果需要更新系统配置，引导用户去手动操作', parameters: {} } },
  { type: 'function', function: { name: 'workflow_management', description: '工作流/流程编排管理/增删改查/执行/验证', parameters: {} } },
  { type: 'function', function: { name: 'desktop_control', description: '桌面操作/鼠标移动/点击/拖拽/键盘输入/截图/窗口管理', parameters: {} } },
  { type: 'function', function: { name: 'browser_automation', description: '浏览器自动化/截图/读取/点击/填写/执行JS', parameters: {} } }
];


var SKILL_TOOLS = [];
function refreshSkillTools() {
  var rawTools = skillProxy.getAllSkillTools();
  SKILL_TOOLS = [];
  if (!rawTools || !Array.isArray(rawTools)) return;
  rawTools.forEach(function(t) {
    if (!t || !t.function || !t.function.name || !t.function.description) return; // 跳过无效工具
    SKILL_TOOLS.push({
      id: t.function.name,
      name: t.function.name,
      description: t.function.description,
      skills: [],
      permission: 'user',
      handler: async function(args) {
        return await skillProxy.executeSkill(t.function.name, args);
      }
    });
  });
}
refreshSkillTools();
// Refresh every 5 minutes
setInterval(refreshSkillTools, 300000);

// MCP 工具（来自 MCP 协议服务器）
var mcpBridge = require("./mcp-tools-bridge");
var MCP_TOOLS = [];
var lastMCPCount = 0;
function refreshMCPTools() {
  MCP_TOOLS = mcpBridge.getMCPTools();
  if (MCP_TOOLS.length !== lastMCPCount) {
    console.log("[MCP] Tools updated: " + MCP_TOOLS.length + " (was " + lastMCPCount + ")");
    lastMCPCount = MCP_TOOLS.length;
  }
}
refreshMCPTools();
setInterval(refreshMCPTools, 60000);

// 编码 Agent 工具
var codingAgent = require("./coding-agent");
var CODING_TOOLS = codingAgent.CODING_TOOLS || [];

// ========== 5. 角色基础工具（来自 agent-engine.js 的 ROLE_TOOLS）==========
// 每个非CEO Agent 都获得其角色对应的基础工具

const ROLE_TOOLS = [
  {
    id: 'query_team',
    name: 'query_team',
    description: '查询团队成员信息，支持按角色/技能/名称筛选',
    parameters: { type: 'object', properties: {
      role: { type: 'string', description: '按角色筛选' },
      skill: { type: 'string', description: '按技能筛选' },
      name: { type: 'string', description: '按名称搜索' }
    } },
    handler: async (args) => {
      try {
        var params = new URLSearchParams(args);
        var r = await fetch('http://127.0.0.1:8002/api/agents?' + params.toString());
        return r.ok ? await r.json() : { error: '查询失败' };
      } catch(e) { return { error: e.message }; }
    },
    skills: ['团队管理', '资源调配'],
    permission: 'basic'
  },
  {
    id: 'list_tasks',
    name: 'list_tasks',
    description: '列出当前任务，可按负责人/状态/数量筛选',
    parameters: { type: 'object', properties: {
      assigneeId: { type: 'string', description: '按负责人筛选' },
      status: { type: 'string', description: '按状态筛选: todo/in_progress/done' },
      limit: { type: 'number', description: '限制数量' }
    } },
    handler: async (args) => {
      try {
        var params = new URLSearchParams(args);
        var r = await fetch('http://127.0.0.1:8002/api/tasks?' + params.toString());
        return r.ok ? await r.json() : { error: '查询失败' };
      } catch(e) { return { error: e.message }; }
    },
    skills: ['团队管理', '战略决策'],
    permission: 'basic'
  },
  {
    id: 'read_file',
    name: 'read_file',
    description: '读取指定路径文件的内容',
    parameters: { type: 'object', properties: {
      filepath: { type: 'string', description: '文件绝对路径' }
    }, required: ['filepath'] },
    handler: async (args) => {
      try {
        var p = args.filepath;
        if (!p) return { error: '缺少filepath' };
        if (!fs.existsSync(p)) return { error: '文件不存在: ' + p };
        var content = fs.readFileSync(p, 'utf8');
        return { success: true, content: content.substring(0, 10000), size: content.length };
      } catch(e) { return { error: e.message }; }
    },
    skills: [],
    permission: 'basic'
  },
  {
    id: 'write_file',
    name: 'write_file',
    description: '写入内容到指定路径的文件（覆盖模式）',
    parameters: { type: 'object', properties: {
      filepath: { type: 'string', description: '文件绝对路径' },
      content: { type: 'string', description: '写入内容' }
    }, required: ['filepath', 'content'] },
    handler: async (args) => {
      try {
        if (!args.filepath || args.content === undefined) return { error: '缺少参数' };
        fs.writeFileSync(args.filepath, args.content, 'utf8');
        return { success: true, bytes: Buffer.byteLength(args.content, 'utf8') };
      } catch(e) { return { error: e.message }; }
    },
    skills: [],
    permission: 'advanced'
  },
  {
    id: 'search_web',
    name: 'search_web',
    description: '搜索网络获取最新信息',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: '搜索关键词' }
    }, required: ['query'] },
    handler: async (args) => {
      try {
        var searchUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(args.query || '') + '&mkt=zh-CN';
        var r = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
        var html = await r.text();
        var results = [];
        var reAlgo = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
        var m;
        while ((m = reAlgo.exec(html)) !== null && results.length < 5) {
          var titleMatch = m[1].match(/<h2[^>]*>(.*?)<\/h2>/i);
          var linkMatch = m[1].match(/href="(https?:[^"]+)"/i);
          var descMatch = m[1].match(/<p[^>]*>(.*?)<\/p>/i);
          results.push({
            title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
            link: linkMatch ? linkMatch[1] : '',
            snippet: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : ''
          });
        }
        return { success: true, query: args.query, results: results };
      } catch(e) { return { error: e.message }; }
    },
    skills: ['研究分析'],
    permission: 'basic'
  },
  {
    id: 'get_weather',
    name: 'get_weather',
    description: '获取指定城市的天气信息',
    parameters: { type: 'object', properties: {
      city: { type: 'string', description: '城市名称' }
    }, required: ['city'] },
    handler: async (args) => {
      try {
        var r = await fetch('http://127.0.0.1:8002/api/weather?city=' + encodeURIComponent(args.city || ''));
        return r.ok ? await r.json() : { error: '天气查询失败' };
      } catch(e) { return { error: e.message }; }
    },
    skills: [],
    permission: 'basic'
  }
];

// ========== 6. 子代理专属工具集（按角色分类）==========
// 小龙（主Agent）调度工具
const XIAOLONG_TOOLS = [
  {
    id: 'assign_sub_task',
    name: 'assign_sub_task',
    description: '给子代理分配子任务。小龙主Agent使用：将拆解后的子任务分配给CTO/安全审计/产品经理。分配时必须写清任务目标和验收标准，让子代理知道具体要做什么。',
    parameters: { type: 'object', properties: {
      title: { type: 'string', description: '子任务标题' },
      assigneeId: { type: 'string', enum: ['cto', 'security', 'product_manager'], description: '子代理ID: cto/security/product_manager' },
      description: { type: 'string', description: '⭐ 必填！详细任务描述、目标、验收标准、参考资料' },
      priority: { type: 'string', enum: ['emergency', 'high', 'medium', 'low'], description: '优先级' },
      deadline: { type: 'string', description: '截止日期 YYYY-MM-DD' }
    }, required: ['title', 'assigneeId', 'description'] },
    handler: async (args) => {
      try {
        var fs = require('fs');
        var path = require('path');
        var tasksFile = path.join(__dirname, '..', 'tasks.json');
        var tasks = fs.existsSync(tasksFile) ? JSON.parse(fs.readFileSync(tasksFile, 'utf-8')) : [];
        // ⭐ 防重复：同一assignee+标题的未完成任务不再创建
        var _exists = tasks.some(function(t) {
          return t.title === (args.title || '子任务') && t.assigneeId === (args.assigneeId || '') && (t.status === 'pending' || t.status === 'todo' || t.status === 'in_progress');
        });
        if (_exists) {
          return { success: true, skipped: true, message: '跳过重复分配："' + (args.title || '') + '"已有未完成的待办' };
        }
        var newTask = {
          id: 'subtask_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          title: args.title || '子任务',
          description: args.description || '',
          status: 'pending',
          priority: args.priority || 'medium',
          assigneeId: args.assigneeId || '',
          sourceAgent: 'xiaolong',
          tags: ['subtask', 'delegated'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        tasks.push(newTask);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
        return { success: true, task: newTask, message: '已分配子任务给 ' + (args.assigneeId || '未知') + ': ' + newTask.id };
      } catch(e) { return { error: '分配子任务失败: ' + e.message }; }
    },
    skills: ['调度管理'],
    permission: 'admin'
  },
  {
    id: 'query_agent_status',
    name: 'query_agent_status',
    description: '查询各子代理状态（空闲/忙碌/离线），了解团队成员当前工作负荷。小龙主Agent调度用。',
    parameters: { type: 'object', properties: {
      agentId: { type: 'string', description: '按AgentID筛选: xiaolong/cto/security/product_manager' }
    }, required: [] },
    handler: async (args) => {
      try {
        var fs = require('fs');
        var path = require('path');
        var statusFile = path.join(__dirname, '..', 'scheduler-status.json');
        if (!fs.existsSync(statusFile)) return { success: true, agents: {}, message: '暂无状态数据' };
        var data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
        var agentStatus = data.agentStatus || {};
        if (args.agentId) {
          return { success: true, agents: { [args.agentId]: agentStatus[args.agentId] || { status: 'unknown' } } };
        }
        return { success: true, agents: agentStatus };
      } catch(e) { return { error: '查询状态失败: ' + e.message }; }
    },
    skills: ['调度管理'],
    permission: 'admin'
  },
  {
    id: 'summarize_result',
    name: 'summarize_result',
    description: '汇总子代理的执行结果，生成简洁的汇总报告。小龙主Agent收口汇报用。',
    parameters: { type: 'object', properties: {
      taskIds: { type: 'string', description: '要汇总的任务ID列表，逗号分隔' },
      format: { type: 'string', enum: ['brief', 'detailed', 'markdown'], description: '汇总格式: brief(简要)/detailed(详细)/markdown(报告)' }
    }, required: [] },
    handler: async (args) => {
      try {
        var fs = require('fs');
        var path = require('path');
        var tasksFile = path.join(__dirname, '..', 'tasks.json');
        if (!fs.existsSync(tasksFile)) return { success: true, tasks: [], message: '暂无任务记录' };
        var allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
        var taskIds = (args.taskIds || '').split(',').filter(Boolean);
        var relevantTasks = taskIds.length > 0
          ? allTasks.filter(function(t) { return taskIds.indexOf(t.id) >= 0; })
          : allTasks.filter(function(t) { return t.assigneeId !== 'xiaolong'; }).slice(-10);
        return { success: true, tasks: relevantTasks, summary: '共 ' + relevantTasks.length + ' 条执行记录', format: args.format || 'brief' };
      } catch(e) { return { error: '汇总失败: ' + e.message }; }
    },
    skills: ['汇报管理'],
    permission: 'admin'
  }
];

// CTO（首席技术官）工具集
const CTO_TOOLS = [
  {
    id: 'code_review',
    name: 'code_review',
    description: '代码审查：审查指定文件的代码质量、安全性和性能。CTO专用。',
    parameters: { type: 'object', properties: {
      filepath: { type: 'string', description: '要审查的文件路径' },
      checkType: { type: 'string', enum: ['quality', 'security', 'performance', 'all'], description: '审查类型' }
    }, required: ['filepath'] },
    handler: async (args) => {
      try {
        var fs = require('fs');
        var path = require('path');
        var p = args.filepath;
        if (!fs.existsSync(p)) return { success: false, error: '文件不存在: ' + p };
        var content = fs.readFileSync(p, 'utf-8');
        var stats = fs.statSync(p);
        return { success: true, filepath: p, fileSize: stats.size, lines: content.split('\n').length, message: '文件已读取，请AI审查内容并给出审查意见' };
      } catch(e) { return { error: '审查失败: ' + e.message }; }
    },
    skills: ['代码审查'],
    permission: 'advanced'
  },
  {
    id: 'performance_analysis',
    name: 'performance_analysis',
    description: '性能分析：分析系统性能指标和瓶颈，检查P95延迟等。CTO专用。',
    parameters: { type: 'object', properties: {
      scope: { type: 'string', enum: ['system', 'api', 'database', 'all'], description: '分析范围' },
      days: { type: 'number', description: '分析最近N天的数据' }
    }, required: [] },
    handler: async (args) => { return { success: true, message: '性能分析完成', scope: args.scope || 'all' }; },
    skills: ['性能优化'],
    permission: 'advanced'
  },
  {
    id: 'system_diagnostics',
    name: 'system_diagnostics',
    description: '系统诊断：运行系统诊断，检查各模块健康状态和错误信息。CTO专用。',
    parameters: { type: 'object', properties: {
      module: { type: 'string', description: '要诊断的模块名称' },
      deep: { type: 'boolean', description: '是否深度诊断' }
    }, required: [] },
    handler: async (args) => { return { success: true, message: '系统诊断完成', module: args.module || 'all', issues: [] }; },
    skills: ['系统诊断'],
    permission: 'advanced'
  },
  {
    id: 'error_tracking',
    name: 'error_tracking',
    description: '错误追踪：查看系统错误日志、异常堆栈和错误趋势。CTO专用。',
    parameters: { type: 'object', properties: {
      level: { type: 'string', enum: ['error', 'warn', 'info'], description: '错误级别' },
      limit: { type: 'number', description: '返回条数' },
      since: { type: 'string', description: '起始时间 ISO格式' }
    }, required: [] },
    handler: async (args) => { return { success: true, errors: [], level: args.level || 'error', total: 0 }; },
    skills: ['故障排查'],
    permission: 'advanced'
  },
  {
    id: 'architecture_review',
    name: 'architecture_review',
    description: '架构评审：审查系统架构设计，评估模块拆分和技术选型合理性。CTO专用。',
    parameters: { type: 'object', properties: {
      component: { type: 'string', description: '要审查的组件或模块名' },
      focus: { type: 'string', enum: ['scalability', 'maintainability', 'security', 'overall'], description: '审查重点' }
    }, required: [] },
    handler: async (args) => { return { success: true, component: args.component || 'all', suggestions: [] }; },
    skills: ['架构设计'],
    permission: 'advanced'
  },
  {
    id: 'deploy_monitor',
    name: 'deploy_monitor',
    description: '部署监控：查看部署状态、版本发布记录和回滚记录。CTO专用。',
    parameters: { type: 'object', properties: {
      environment: { type: 'string', enum: ['production', 'staging', 'development'], description: '环境' },
      limit: { type: 'number', description: '返回记录条数' }
    }, required: [] },
    handler: async (args) => { return { success: true, environment: args.environment || 'production', deploys: [], total: 0 }; },
    skills: ['运维管理'],
    permission: 'advanced'
  },
  {
    id: 'tech_debt',
    name: 'tech_debt',
    description: '技术债务：查看和维护技术债务清单。CTO专用。',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'add', 'resolve'], description: '操作' },
      title: { type: 'string', description: '技术债务项标题(add时必填)' },
      severity: { type: 'string', enum: ['critical', 'major', 'minor'], description: '严重程度' }
    }, required: ['action'] },
    handler: async (args) => { return { success: true, action: args.action, items: [] }; },
    skills: ['架构设计'],
    permission: 'advanced'
  }
];

// 安全审计Agent工具集
const SECURITY_TOOLS = [
  {
    id: 'vulnerability_scan',
    name: 'vulnerability_scan',
    description: '漏洞扫描：扫描系统漏洞和安全弱点。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      scope: { type: 'string', enum: ['full', 'web', 'api', 'config'], description: '扫描范围' },
      level: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: '关注的漏洞级别' }
    }, required: [] },
    handler: async (args) => { return { success: true, scope: args.scope || 'full', findings: [], total: 0 }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'log_analysis',
    name: 'log_analysis',
    description: '日志分析：分析系统日志，查找异常和可疑行为。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      timeframe: { type: 'string', description: '时间范围: 例如 24h/7d/30d' },
      filterType: { type: 'string', enum: ['all', 'error', 'anomaly', 'access'], description: '日志类型筛选' },
      limit: { type: 'number', description: '返回条数' }
    }, required: [] },
    handler: async (args) => { return { success: true, logs: [], anomalies: 0, total: 0 }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'security_audit',
    name: 'security_audit',
    description: '安全审计：全面安全审计检查，覆盖配置、权限、网络、凭证等方面。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      scope: { type: 'string', enum: ['full', 'config', 'permission', 'network', 'credential'], description: '审计范围' },
      generateReport: { type: 'boolean', description: '是否生成审计报告' }
    }, required: [] },
    handler: async (args) => { return { success: true, auditScope: args.scope || 'full', checks: [], risks: { critical: 0, high: 0, medium: 0 } }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'access_review',
    name: 'access_review',
    description: '访问权限审查：检查用户权限分配、敏感操作日志和越权风险。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      userId: { type: 'string', description: '按用户ID审查' },
      resourceType: { type: 'string', enum: ['file', 'api', 'database', 'all'], description: '资源类型' }
    }, required: [] },
    handler: async (args) => { return { success: true, users: [], violations: [] }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'firewall_check',
    name: 'firewall_check',
    description: '防火墙检查：检查网络安全策略、端口开放情况和ACL配置。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      host: { type: 'string', description: '目标主机' },
      scanPorts: { type: 'boolean', description: '是否扫描端口' }
    }, required: [] },
    handler: async (args) => { return { success: true, host: args.host || 'localhost', openPorts: [], rules: [] }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'threat_detect',
    name: 'threat_detect',
    description: '威胁检测：检测系统中的异常行为和潜在威胁。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      sensitivity: { type: 'string', enum: ['high', 'medium', 'low'], description: '检测灵敏度' }
    }, required: [] },
    handler: async (args) => { return { success: true, threats: [], score: 0 }; },
    skills: ['安全审计'],
    permission: 'advanced'
  },
  {
    id: 'compliance_check',
    name: 'compliance_check',
    description: '合规检查：检查系统是否符合行业标准和公司安全规范。安全审计Agent专用。',
    parameters: { type: 'object', properties: {
      standard: { type: 'string', enum: ['internal', 'industry', 'all'], description: '合规标准' }
    }, required: [] },
    handler: async (args) => { return { success: true, complianceScore: 0, items: [] }; },
    skills: ['安全审计'],
    permission: 'advanced'
  }
];

// 产品经理Agent工具集
const PM_TOOLS = [
  {
    id: 'req_analysis',
    name: 'req_analysis',
    description: '需求分析：分析用户需求和业务需求，整理需求规格。产品经理专用。',
    parameters: { type: 'object', properties: {
      reqText: { type: 'string', description: '原始需求描述' },
      format: { type: 'string', enum: ['structured', 'user_story', 'prd'], description: '输出格式: 结构化/用户故事/PRD' }
    }, required: ['reqText'] },
    handler: async (args) => { return { success: true, analysis: { requirements: [], dependencies: [], priority: [] } }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'requirement_doc',
    name: 'requirement_doc',
    description: '需求文档编写：生成正式的需求文档(PRD)或产品规格说明。产品经理专用。',
    parameters: { type: 'object', properties: {
      title: { type: 'string', description: '文档标题' },
      scope: { type: 'string', description: '需求范围描述' },
      format: { type: 'string', enum: ['prd', 'spec', 'brd'], description: '文档类型: PRD/Spec/BRD' }
    }, required: ['title'] },
    handler: async (args) => { return { success: true, docUrl: '', message: '需求文档草稿已生成' }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'roadmap_plan',
    name: 'roadmap_plan',
    description: '路线图规划：制定产品路线图，规划版本迭代和时间线。产品经理专用。',
    parameters: { type: 'object', properties: {
      product: { type: 'string', description: '产品名称' },
      period: { type: 'string', enum: ['quarter', 'half_year', 'year'], description: '规划周期' },
      focus: { type: 'string', description: '规划重点' }
    }, required: ['product'] },
    handler: async (args) => { return { success: true, roadmap: [], milestones: [] }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'feature_prioritize',
    name: 'feature_prioritize',
    description: '功能优先级排序：使用RICE、MoSCoW等方法对功能需求进行优先级排序。产品经理专用。',
    parameters: { type: 'object', properties: {
      features: { type: 'string', description: '待排序的功能列表(逗号分隔)' },
      method: { type: 'string', enum: ['rice', 'moscow', 'kano'], description: '排序方法' }
    }, required: ['features'] },
    handler: async (args) => { return { success: true, ranking: [], method: args.method || 'rice' }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'competition_analysis',
    name: 'competition_analysis',
    description: '竞品分析：分析竞争对手的产品、功能和市场策略。产品经理专用。',
    parameters: { type: 'object', properties: {
      competitors: { type: 'string', description: '竞品名称(逗号分隔)' },
      aspects: { type: 'string', enum: ['feature', 'pricing', 'market', 'ux', 'all'], description: '分析维度' }
    }, required: ['competitors'] },
    handler: async (args) => { return { success: true, analysis: [], aspects: args.aspects || 'all' }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'user_story',
    name: 'user_story',
    description: '用户故事编写：编写和整理用户故事，包含角色/功能/价值。产品经理专用。',
    parameters: { type: 'object', properties: {
      feature: { type: 'string', description: '要拆解的功能模块' },
      count: { type: 'number', description: '生成用户故事数量' }
    }, required: ['feature'] },
    handler: async (args) => { return { success: true, stories: [], feature: args.feature }; },
    skills: ['产品管理'],
    permission: 'advanced'
  },
  {
    id: 'market_research',
    name: 'market_research',
    description: '市场调研：收集和分析市场数据、用户趋势和行业动态。产品经理专用。',
    parameters: { type: 'object', properties: {
      topic: { type: 'string', description: '调研主题' },
      source: { type: 'string', enum: ['web', 'internal', 'all'], description: '数据来源' }
    }, required: ['topic'] },
    handler: async (args) => { return { success: true, research: { topic: args.topic, keyFindings: [] } }; },
    skills: ['产品管理'],
    permission: 'advanced'
  }
];

const ALL_TOOLS = [...BRIDGE_TOOLS, ...FILE_TOOLS, ...ROLE_TOOLS, ...XIAOLONG_TOOLS, ...CTO_TOOLS, ...SECURITY_TOOLS, ...PM_TOOLS, ...CEO_TOOLS, ...SKILL_TOOLS, ...MCP_TOOLS, ...CODING_TOOLS];

// ========== 工具查找 ==========
function findToolByName(name) {
  for (const tool of ALL_TOOLS) {
    if (tool.name === name || tool.id === name) return tool;
  }
  for (const tool of CEO_TOOLS) {
    if (tool.name === name || tool.id === name) return tool;
  }
  return null;
}

function findToolsBySkills(skills) {
  if (!skills || !skills.length) return [];
  const matched = {};
  skills.forEach(skill => {
    const toolIds = getSkillMapperTools(skill);
    toolIds.forEach(id => { matched[id] = true; });
  });
  return ALL_TOOLS.filter(t => matched[t.id]);
}

function getSkillMapperTools(skill) {
  try {
    const mapper = JSON.parse(fs.readFileSync(path.join(BASE, 'skill-mapper.json'), 'utf8'));
    const map = mapper.mapping || {};
    return map[skill] || [];
  } catch (e) { return []; }
}

// ========== 构建支持工具调用的 messages ==========
/**
 * 为 Agent 构建带工具调用的 messages
 * @param {string} systemPrompt 基础系统提示词
 * @param {string[]} agentSkills Agent的技能列表
 * @param {Array} conversationHistory 对话历史
 * @param {string} userMessage 当前用户消息
 * @returns {Array} messages (用于 DeepSeek function calling)
 */
function buildToolMessages(systemPrompt, agentSkills, conversationHistory, userMessage) {
  const messages = [{ role: 'system', content: systemPrompt }];
  
  // 对话历史
  for (const c of (conversationHistory || []).slice(-20)) {
    if (c.role && c.content) messages.push({ role: c.role, content: c.content });
  }
  
  // 当前消息
  messages.push({ role: 'user', content: userMessage });
  
  return messages;
}

/**
 * 获取 Agent 可用的工具列表（基于 role 或 skill-mapper 映射）
 * 为不同的角色（xiaolong/cto/security/product_manager）返回不同的工具集
 */
function getAgentTools(agentSkills, agentRole) {
  const tools = [];
  const seen = {};

  // ⭐ 角色专属工具集（按 role 直接匹配）
  var roleToolMap = {
    'xiaolong': XIAOLONG_TOOLS,
    'cto': CTO_TOOLS,
    'security': SECURITY_TOOLS,
    'product_manager': PM_TOOLS
  };

  if (agentRole && roleToolMap[agentRole]) {
    // 注入角色专属工具
    roleToolMap[agentRole].forEach(function(t) {
      if (!seen[t.id]) { seen[t.id] = true; tools.push(t); }
    });
  }

  // 通过 skill-mapper 映射工具（如果技能名称能匹配到工具）
  for (const skill of (agentSkills || [])) {
    const toolIds = getSkillMapperTools(skill);
    for (const id of toolIds) {
      if (!seen[id]) {
        seen[id] = true;
        const tool = ALL_TOOLS.find(t => t.id === id);
        if (tool) tools.push(tool);
      }
    }
  }
  
  // 如果没有技能匹配也没有角色匹配，回退到角色基础工具
  if (!tools.length) {
    tools.push(...ROLE_TOOLS);
  }
  
  return tools;
}

/**
 * 构建 DeepSeek API 格式的 tools 参数
 */
function buildDeepSeekTools(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters || { type: 'object', properties: {} }
    }
  }));
}

/**
 * 执行工具调用
 */
async function executeTool(name, args) {
  const tool = findToolByName(name);
  if (!tool) return { error: 'unknown tool: ' + name };
  try {
    // 如果是 execute_openclaw_skill，通过 skill-proxy 执行
    if (name === 'execute_openclaw_skill') {
      return await executeOpenClawSkill(args);
    }
    return await tool.handler(args);
  } catch (e) {
    return { error: 'tool execution failed: ' + e.message };
  }
}

/**
 * 执行 OpenClaw 技能
 */
async function executeOpenClawSkill(args) {
  try {
    var skillName = args.skillName;
    var params = args.params || {};
    if (!skillName) return { error: '缺少技能名称(skillName)' };
    
    // 统一格式：去掉 skill_ / openclaw-skill_ 前缀，尝试多种匹配
    var normalizedName = skillName.replace(/^(skill_|openclaw-skill_|openclaw_)/, '');
    
    // 先尝试精确匹配 skill-proxy 中的技能
    var result = await skillProxy.executeSkill(normalizedName, params);
    if (result && !result.error) return result;
    
    // 用原始名称再试一次
    var result2 = await skillProxy.executeSkill(skillName, params);
    if (result2 && !result2.error) return result2;
    
    // 用带 skill_ 前缀再试
    var result3 = await skillProxy.executeSkill('skill_' + normalizedName, params);
    if (result3 && !result3.error) return result3;
    
    return { error: '技能执行失败: ' + skillName + '，可用技能列表通过 skill_list 获取' };
  } catch(e) {
    return { error: 'OpenClaw技能执行异常: ' + e.message };
  }
}

/**
 * 获取工具注册表统计
 */
function getToolStats() {
  return {
    total: ALL_TOOLS.length,
    bridge: BRIDGE_TOOLS.length,
    file: FILE_TOOLS.length,
    ceo: CEO_TOOLS.length,
    tools: ALL_TOOLS.map(t => ({ id: t.id, name: t.name, permission: t.permission }))
  };
}

module.exports = {
  ALL_TOOLS,
  BRIDGE_TOOLS,
  FILE_TOOLS,
  ROLE_TOOLS,
  CEO_TOOLS,
  XIAOLONG_TOOLS,
  CTO_TOOLS,
  SECURITY_TOOLS,
  PM_TOOLS,
  findToolByName,
  findToolsBySkills,
  getAgentTools,
  getSkillMapperTools,
  buildToolMessages,
  buildDeepSeekTools,
  executeTool,
  getToolStats
};