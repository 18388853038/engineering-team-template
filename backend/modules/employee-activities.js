// backend/modules/employee-activities.js
// AI员工工作动态生成器 - 实时生成41名员工的工作活动

function registerEmployeeActivitiesAPI(registerRoute) {
  // 41名员工定义
  const employees = [
    { id: 'ai_ceo', name: '张明远', role: 'CEO', icon: '👔' },
    { id: 'ai_cto', name: '李思源', role: 'CTO', icon: '💻' },
    { id: 'ai_cpo', name: '王品卓', role: 'CPO', icon: '📐' },
    { id: 'ai_coo', name: '陈运达', role: 'COO', icon: '🔄' },
    { id: 'ai_ciso', name: '赵安澜', role: 'CISO', icon: '🛡️' },
    { id: 'ai_cfo', name: '周瑾瑜', role: 'CFO', icon: '💰' },
    { id: 'ai_architect', name: '林架构', role: '架构总监', icon: '🏗️' },
    { id: 'ai_fe_dir', name: '杨前端', role: '前端总监', icon: '🎨' },
    { id: 'ai_be_dir', name: '吴后端', role: '后端总监', icon: '⚙️' },
    { id: 'ai_qa_dir', name: '郑测试', role: '测试总监', icon: '🧪' },
    { id: 'ai_sec_dir', name: '孙安全', role: '安全总监', icon: '🔐' },
    { id: 'ai_sr_frontend', name: '韩素云', role: '资深前端', icon: '🖥️' },
    { id: 'ai_sr_backend', name: '冯志远', role: '资深后端', icon: '🔌' },
    { id: 'ai_sr_fullstack', name: '褚全栈', role: '资深全栈', icon: '🔧' },
    { id: 'ai_sr_ai', name: '蒋智能', role: '资深AI', icon: '🤖' },
    { id: 'ai_sr_mobile', name: '沈移动', role: '资深移动', icon: '📱' },
    { id: 'ai_sr_devops', name: '韩运维', role: '资深DevOps', icon: '🐳' },
    { id: 'ai_sr_data', name: '杨数据', role: '资深数据', icon: '📊' },
    { id: 'ai_sr_sec', name: '秦安全', role: '资深安全', icon: '🔒' },
    { id: 'ai_sec_engineer1', name: '罗护卫', role: '安全工程师', icon: '🛡️' },
    { id: 'ai_sec_engineer2', name: '梁守护', role: '安全工程师', icon: '🔑' },
    { id: 'ai_fe_vue', name: '许文斌', role: 'Vue工程师', icon: '💚' },
    { id: 'ai_fe_react', name: '叶思琪', role: 'React工程师', icon: '⚛️' },
    { id: 'ai_be_python', name: '范志远', role: 'Python工程师', icon: '🐍' },
    { id: 'ai_be_java', name: '罗嘉银', role: 'Java工程师', icon: '☕' },
    { id: 'ai_be_go', name: '秦子轩', role: 'Go工程师', icon: '🦫' },
    { id: 'ai_mobile_ios', name: '彭子豪', role: 'iOS工程师', icon: '🍎' },
    { id: 'ai_mobile_android', name: '叶子轩', role: 'Android工程师', icon: '🤖' },
    { id: 'ai_test_auto', name: '胡自测', role: '自动化测试', icon: '🤖' },
    { id: 'ai_test_manual', name: '何手测', role: '手工测试', icon: '👆' },
    { id: 'ai_db_admin', name: '吕数管', role: 'DBA', icon: '🗄️' },
    { id: 'ai_ui_design', name: '苏设计', role: 'UI设计师', icon: '🎭' },
    { id: 'ai_sre', name: '潘稳定', role: 'SRE', icon: '📡' },
    { id: 'ai_doc_dev', name: '纪文档', role: '文档开发', icon: '📝' },
    { id: 'ai_sr_fullstack2', name: '任全才', role: '资深全栈', icon: '🔧' },
    { id: 'ai_sr_fullstack3', name: '于全能', role: '资深全栈', icon: '🔧' },
    { id: 'ai_fs_xuwenbin', name: '许文斌', role: '全栈工程师', icon: '💻' },
    { id: 'ai_fs_yesiqi', name: '叶思琪', role: '全栈工程师', icon: '💻' },
    { id: 'ai_fs_fanzhiyuan', name: '范志远', role: '全栈工程师', icon: '💻' },
    { id: 'ai_fs_luojiayin', name: '罗嘉银', role: '全栈工程师', icon: '💻' },
    { id: 'ai_fs_qinzixuan', name: '秦子轩', role: '全栈工程师', icon: '💻' },
  ];

  // 每个角色的典型工作活动
  const activityTemplates = {
    'CEO': [
      '召开了管理层周会', '审批了新的战略方案', '审核了季度财务报告',
      '与客户进行了商务谈判', '签署了合作协议', '发布了公司内部公告',
      '主持了全员大会', '审批了人事任命', '审核了预算调整方案',
      '组织了跨部门协调会', '审查了风险管理报告', '批准了新项目立项'
    ],
    'CTO': [
      '完成了技术架构评审', '审核了代码合并请求', '更新了技术路线图',
      '组织了技术分享会', '优化了CI/CD流水线', '评估了新技术方案',
      '修复了生产环境紧急Bug', '审核了系统扩容方案', '检查了代码质量报告',
      '调整了微服务部署策略', '评审了安全扫描报告', '制定了技术债务清理计划'
    ],
    'CPO': [
      '更新了产品需求文档', '进行了用户调研分析', '设计了新功能原型',
      '组织了产品评审会', '分析了竞品功能对比', '整理了用户反馈报告',
      '制定了产品迭代计划', '审核了UI设计稿', '更新了产品路线图',
      '分析了功能使用数据', '完成了A/B测试方案', '评审了交互优化方案'
    ],
    'COO': [
      '审核了运营数据周报', '优化了工作流程', '协调了跨部门资源',
      '更新了项目进度表', '组织了运营复盘会', '检查了SLA达标情况',
      '审批了资源申请单', '梳理了业务流程', '制定了应急预案',
      '审核了供应商合同', '优化了成本控制方案', '检查了合规执行情况'
    ],
    'CISO': [
      '完成了安全漏洞扫描', '更新了安全策略文档', '审核了访问权限变更',
      '组织了安全意识培训', '检查了防火墙规则', '审查了安全事件日志',
      '更新了入侵检测规则', '审核了数据加密方案', '制定了应急响应计划',
      '检查了第三方合规要求', '评估了安全风险等级', '更新了安全基线配置'
    ],
    'CFO': [
      '完成了月度财务报表', '审批了部门预算申请', '审核了采购订单',
      '更新了现金流预测', '分析了成本结构', '审核了报销单据',
      '制定了税务优化方案', '审核了合同付款条款', '更新了财务模型',
      '分析了投资回报率', '审核了薪资调整方案', '准备了董事会材料'
    ],
    '架构总监': [
      '评审了系统架构方案', '更新了架构文档', '优化了服务拆分策略',
      '审核了数据库设计方案', '评估了技术选型方案', '制定了架构规范',
      '审查了接口设计文档', '优化了缓存策略', '评估了性能瓶颈',
      '更新了技术栈版本', '评审了容灾方案', '制定了代码规范'
    ],
    '前端总监': [
      '审核了前端代码规范', '评审了组件库更新', '优化了页面加载性能',
      '组织了前端技术分享', '审核了UI交互方案', '更新了前端构建配置',
      '检查了跨浏览器兼容性', '优化了首屏加载时间', '审核了动效设计方案',
      '制定了前端测试策略', '评审了响应式布局方案', '优化了打包体积'
    ],
    '后端总监': [
      '审核了API接口设计', '优化了数据库查询性能', '评审了服务部署方案',
      '组织了后端代码审查', '更新了API文档', '检查了服务健康状态',
      '优化了消息队列配置', '审核了数据迁移方案', '制定了后端开发规范',
      '评审了缓存更新策略', '检查了接口限流配置', '优化了服务启动时间'
    ],
    '测试总监': [
      '制定了测试计划', '审核了测试用例', '组织了缺陷评审会',
      '更新了自动化测试框架', '分析了测试覆盖率', '优化了测试流程',
      '检查了回归测试结果', '评审了性能测试报告', '制定了质量标准',
      '审核了兼容性测试方案', '组织了探索性测试', '更新了测试报告模板'
    ],
    '安全总监': [
      '审核了安全审计报告', '更新了安全基线标准', '组织了红蓝对抗演练',
      '检查了权限最小化配置', '评审了安全合规方案', '更新了漏洞管理流程',
      '审核了代码安全扫描结果', '制定了数据分类策略', '检查了日志审计配置',
      '组织了安全应急演练', '评审了第三方SDK安全性', '更新了安全事件响应流程'
    ],
    'default': [
      '完成了代码提交', '更新了工作日志', '参与了技术讨论',
      '提交了代码审查意见', '修复了功能缺陷', '优化了代码性能',
      '编写了技术文档', '参加了每日站会', '完成了任务分配的工作',
      '进行了代码重构', '运行了单元测试', '更新了依赖包版本',
      '检查了代码风格', '解决了合并冲突', '整理了开发环境',
      '阅读了技术文章', '回复了工作消息', '更新了任务进度'
    ]
  };

  // 内存中的活动流
  let activityStream = [];
  let lastId = 0;

  function getRandomActivity(emp) {
    const templates = activityTemplates[emp.role] || activityTemplates['default'];
    const action = templates[Math.floor(Math.random() * templates.length)];
    // 随机工作状态
    const statuses = ['completed', 'in_progress', 'reviewing'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    return {
      id: ++lastId,
      agentId: emp.id,
      name: emp.name,
      role: emp.role,
      icon: emp.icon,
      action: action,
      status: status,
      time: new Date().toISOString()
    };
  }

  // 初始化生成一批活动
  function initActivities() {
    const count = 20 + Math.floor(Math.random() * 10);
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const emp = employees[Math.floor(Math.random() * employees.length)];
      const act = getRandomActivity(emp);
      // 按时间递减排列，最新的在前
      act.time = new Date(now - (count - i) * (30000 + Math.random() * 120000)).toISOString();
      act.id = ++lastId;
      activityStream.push(act);
    }
  }

  initActivities();

  // 定期生成新活动 (每5-15秒一条)
  setInterval(function() {
    const emp = employees[Math.floor(Math.random() * employees.length)];
    const act = getRandomActivity(emp);
    activityStream.push(act);
    // 保留最近200条
    if (activityStream.length > 200) {
      activityStream = activityStream.slice(-200);
    }
  }, 5000 + Math.floor(Math.random() * 10000));

  // GET /api/employee-activities - 获取员工工作动态流
  registerRoute('GET', '/api/employee-activities', async function(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const since = url.searchParams.get('since'); // ISO timestamp
    const limit = parseInt(url.searchParams.get('limit') || '50');

    let result = activityStream;
    if (since) {
      result = result.filter(function(a) { return a.time > since; });
    }
    // 返回最新的N条
    result = result.slice(-limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, activities: result, total: activityStream.length }));
  });

  // GET /api/employee-activities/stats - 获取员工工作统计
  registerRoute('GET', '/api/employee-activities/stats', async function(req, res) {
    // 统计每个员工最近的活动数量
    const stats = {};
    employees.forEach(function(emp) {
      const count = activityStream.filter(function(a) { return a.agentId === emp.id; }).length;
      stats[emp.id] = { name: emp.name, role: emp.role, icon: emp.icon, count: count };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, stats: stats }));
  });
}

module.exports = { registerEmployeeActivitiesAPI };
