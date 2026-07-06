// 意图-工具路由表
// 根据用户输入关键词快速筛选相关工具，减少传递给 LLM 的工具数
// 在 server-modern.js 中用于替换全量 CEO_TOOLS

function filterToolsByIntent(userMsg, allTools) {
  if (!userMsg || !allTools) return allTools;

  var msg = (typeof userMsg === 'string' ? userMsg : userMsg.content || '').toLowerCase();

  // 核心工具:对话基础能力（精简至最小集）
  var always = new Set([
    'search_web', 'memory_search',
    'execute_openclaw_skill',
    'model_management',
    'query_models',
    'evolve_run',
    'analyze_project',
    'code_sandbox',
    'decision_backtest',
    'failure_postmortem',
    'learn_from_past',
    'value_check',
    'cascade_goal',
    'strategic_memo',
    'goal_manager',
    'list_tasks', 'complete_task', 'assign_task', 'review_task', 'reassign_task', 'cleanup_tasks',
    'sync_task_state',
    'workflow_management',
    'desktop_control',
    'browser_automation',
    'channel_send'
  ]);

  // 任务管理类
  var taskSet = new Set([
    'assign_task', 'list_tasks', 'complete_task', 'review_task', 'reassign_task',
    'decision_backtest', 'cascade_goal'
  ]);

  // 文件/代码类
  var fileSet = new Set(['read_file', 'write_file', 'exec',
    'file_manager', 'skill_file_manager',
    'skill_vue_helper', 'skill_python_helper', 'skill_docker_helper',
    'analyze_project',
    'code_sandbox'
  ]);

  // 系统管理类
  var sysSet = new Set([
    'system_check_provider', 'system_check_bridge', 'system_logs',
    'system_processes', 'system_disk', 'skill_manager', 'channel_config',
    'skill_channel_config', 'skill_provider_status',
    'channel_send'
  ]);

  // AI/知识库类
  var aiSet = new Set([
    'kb_search', 'kb_create', 'bi_query', 'auto_run_flow',
    'integration_status', 'evolve_run'
  ]);

  // Harness（纪律监督）类
  // 模型管理类
  var modelSet = new Set([
    'model_management', 'query_models'
  ]);

  // OpenClaw 技能
  var ocSet = new Set([
    'execute_openclaw_skill'
  ]);

  var harnessSet = new Set([
    'harness_status', 'harness_errors', 'harness_sla', 'harness_dag',
    'harness_agent_control', 'harness_habits_analyze', 'harness_habits_record',
    'harness_habits_confirm', 'harness_habits_pending',
    'harness_boundary_reset', 'harness_rules_list', 'harness_rules_propose',
    'harness_rules_confirm', 'harness_rules_reject', 'harness_rules_pending',
    'harness_proposal_submit', 'harness_proposal_appeal', 'harness_proposal_audit',
    'compliance_audit_tasks', 'compliance_audit_product', 'compliance_report'
  ]);

  // 腾讯系
  var txSet = new Set([
    'tencent_docs_create', 'tencent_meeting_create', 'tencent_survey_create'
  ]);

  // 技能类（非核心，通常不需要）
  var skillSet = new Set([
    'skill_api_testing', 'skill_code_review', 'skill_system_analyze',
    'skill_task_dispatch', 'skill_risk_assessment', 'skill_web_search',
    'skill_project_board', 'skill_browser_check', 'skill_bluebubbles_guide',
    'skill_dingtalk_guide', 'skill_dingtalk_rules', 'skill_dingtalk_troubleshoot',
    'skill_dws_cli', 'skill_feishu_doc', 'skill_feishu_drive',
    'skill_feishu_perm', 'skill_feishu_wiki'
  ]);

  // 关键词匹配 - 返回匹配的工具名集合
  var matched = new Set(always); // 始终包含核心工具

  // 任务关键词（注意:check会被健康检查误触发）
  if (/任务|待办|分配|创建任务|进度|指派|转派|完成|todo|task|assign/.test(msg) && !/健康|health|检查/.test(msg)) {
    taskSet.forEach(function(n) { matched.add(n); });
  }

  // 文件/代码关键词
  if (/文件|读取|写入|编辑|代码|脚本|编译|运行|部署|docker|git|程序|源码|npm|node|py/.test(msg)) {
    fileSet.forEach(function(n) { matched.add(n); });
  }

  // 系统/健康关键词
  if (/系统|状态|日志|进程|磁盘|端口|配置|渠道|插件|重启|停止|启动|server|服务|健康|健康检查/.test(msg)) {
    sysSet.forEach(function(n) { matched.add(n); });
    matched.add('system_health');
  }
  // 纯检查关键词（不匹配'检查'给任务类，仅匹配系统检查）
  if (/检查/.test(msg) && !/任务|todo|task|分配|指派/.test(msg)) {
    sysSet.forEach(function(n) { matched.add(n); });
  }

  // AI/知识库关键词
  if (/AI|知识库|检索|查询|分析|报表|BI|图|趋势|数据|统计|智能|模型|学习|预测|趋势|报表/.test(msg)) {
    aiSet.forEach(function(n) { matched.add(n); });
  }

  // 纪律监督关键词
  if (/纪律|规则|习惯|合规|审计|边界|提案|审核|slip|SLA|违规|考核|评分|自律|harness/.test(msg)) {
    harnessSet.forEach(function(n) { matched.add(n); });
  }

  // 腾讯系关键词
  if (/腾讯|文档|会议|问卷|tencent|docs/.test(msg)) {
    txSet.forEach(function(n) { matched.add(n); });
  }

  // 模型管理关键词
  if (/模型|AI|提供商|provider|切换|设置|配置|apikey|密钥|路由/.test(msg)) {
    modelSet.forEach(function(n) { matched.add(n); });
  }

  // OpenClaw 技能关键词
  if (/技能|skill|外部|打开|调用|执行|下载|搜索|抓取|API|测试|审查|文档|浏览/.test(msg)) {
    ocSet.forEach(function(n) { matched.add(n); });
  }

  // 技能类关键词
  if (/技能|skill|测试|审查|风险评估|看板|浏览器|钉钉|飞书|微信/.test(msg)) {
    skillSet.forEach(function(n) { matched.add(n); });
  }

  function toolName(t) {
    if (t.function && t.function.name) return t.function.name;
    if (t.name) return t.name;
    return '';
  }

  // 无匹配时返回核心工具（最小集）
  if (matched.size <= always.size) {
    return allTools.filter(function(t) { return always.has(toolName(t)); });
  }

  return allTools.filter(function(t) { return matched.has(toolName(t)); });
}

module.exports = { filterToolsByIntent };
