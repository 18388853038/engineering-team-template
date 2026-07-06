/**
 * eCompany Agent 角色技能匹配系统
 * 
 * 为每个Agent角色匹配合适的OpenClaw技能工具
 * 支持按角色自动加载所需技能
 */

// ========== OpenClaw 可用技能库 ==========
const AVAILABLE_SKILLS = {
  // 文件操作类
  'file-skill': {
    name: '文件整理',
    desc: '智能文件/桌面整理技能',
    category: 'file',
    icon: '📁'
  },
  'qclaw-text-file': {
    name: '文本文件',
    desc: '跨平台纯文本文件写入',
    category: 'file',
    icon: '📄'
  },
  
  // 搜索/信息类
  'online-search': {
    name: '联网搜索',
    desc: '实时互联网信息搜索',
    category: 'search',
    icon: '🔍'
  },
  'multi-search-engine': {
    name: '多搜索引擎',
    desc: '集成17个搜索引擎',
    category: 'search',
    icon: '🌐'
  },
  'news-summary': {
    name: '新闻摘要',
    desc: '多源RSS新闻聚合',
    category: 'news',
    icon: '📰'
  },
  'tech-news-digest': {
    name: '科技新闻',
    desc: '科技新闻多源聚合',
    category: 'news',
    icon: '🚀'
  },
  
  // 文档/办公类
  'docx': {
    name: 'Word文档',
    desc: 'Word文档创建编辑',
    category: 'document',
    icon: '📝'
  },
  'pptx': {
    name: 'PPT幻灯片',
    desc: 'PPT演示文稿制作',
    category: 'document',
    icon: '📊'
  },
  'xlsx': {
    name: 'Excel表格',
    desc: 'Excel电子表格处理',
    category: 'document',
    icon: '📈'
  },
  'pdf': {
    name: 'PDF处理',
    desc: 'PDF读取/编辑/转换',
    category: 'document',
    icon: '📑'
  },
  'canvas-design': {
    name: '画布设计',
    desc: '海报/插画/设计创作',
    category: 'design',
    icon: '🎨'
  },
  
  // 沟通协作类
  'email-skill': {
    name: '邮件收发',
    desc: '统一邮件入口',
    category: 'communication',
    icon: '📧'
  },
  'tencent-docs': {
    name: '腾讯文档',
    desc: '在线云文档平台',
    category: 'communication',
    icon: '☁️'
  },
  'tencent-meeting-mcp': {
    name: '腾讯会议',
    desc: '视频会议管理',
    category: 'communication',
    icon: '🎥'
  },
  
  // 开发类
  'frontend-design': {
    name: '前端设计',
    desc: 'Web界面开发',
    category: 'development',
    icon: '💻'
  },
  'github-skill': {
    name: 'GitHub集成',
    desc: '代码仓库管理',
    category: 'development',
    icon: '🐙'
  },
  'webapp-testing': {
    name: 'Web测试',
    desc: 'Web应用测试',
    category: 'development',
    icon: '🧪'
  },
  
  // 系统管理类
  'qclaw-openclaw': {
    name: 'OpenClaw管理',
    desc: '定时任务/提醒管理',
    category: 'system',
    icon: '⚙️'
  },
  'qclaw-env': {
    name: '环境配置',
    desc: 'CLI工具安装配置',
    category: 'system',
    icon: '🔧'
  },
  'find-skills': {
    name: '技能发现',
    desc: '安装管理Agent技能',
    category: 'system',
    icon: '🧰'
  },
  
  // 天气/出行类
  'weather-advisor': {
    name: '天气顾问',
    desc: '天气预报穿衣建议',
    category: 'life',
    icon: '🌤️'
  },
  'travel-planner': {
    name: '旅行规划',
    desc: 'AI旅行规划助手',
    category: 'life',
    icon: '✈️'
  },
  
  // 内容创作类
  'content-factory': {
    name: '内容工厂',
    desc: '多代理内容生产线',
    category: 'content',
    icon: '🏭'
  },
  'content-repurposer': {
    name: '内容复用',
    desc: '内容多平台适配',
    category: 'content',
    icon: '♻️'
  },
  'video-script': {
    name: '视频脚本',
    desc: '短视频脚本创作',
    category: 'content',
    icon: '🎬'
  },
  
  // 商业分析类
  'analytics-dashboard': {
    name: '数据看板',
    desc: 'KPI监控看板',
    category: 'analytics',
    icon: '📊'
  },
  'market-researcher': {
    name: '市场调研',
    desc: '竞品分析工具',
    category: 'analytics',
    icon: '📈'
  },
  'macro-monitor': {
    name: '宏观监控',
    desc: '宏观经济指标追踪',
    category: 'analytics',
    icon: '🌍'
  },
  
  // AI/智能类
  'idea-validator': {
    name: '点子验证',
    desc: '创业点子验证',
    category: 'ai',
    icon: '💡'
  },
  'note-organizer': {
    name: '笔记整理',
    desc: '智能笔记整理',
    category: 'ai',
    icon: '🗒️'
  },
  'self-improving': {
    name: '自我提升',
    desc: 'Agent自我改进',
    category: 'ai',
    icon: '📈'
  }
};

// ========== 角色技能配置 ==========
const ROLE_SKILLS = {
  // CEO - 最高管理者，需要全面技能
  ceo: {
    skills: [
      'file-skill',           // 文件管理
      'qclaw-text-file',      // 文本处理
      'online-search',         // 网络搜索
      'multi-search-engine',  // 多搜索引擎
      'news-summary',         // 新闻资讯
      'tech-news-digest',     // 科技新闻
      'docx',                 // Word文档
      'pptx',                 // PPT
      'xlsx',                 // Excel
      'pdf',                  // PDF
      'canvas-design',        // 设计
      'email-skill',          // 邮件
      'tencent-docs',         // 腾讯文档
      'tencent-meeting-mcp',  // 腾讯会议
      'qclaw-openclaw',       // 系统管理
      'qclaw-env',           // 环境配置
      'find-skills',          // 技能管理
      'weather-advisor',      // 天气
      'travel-planner',       // 旅行
      'content-factory',      // 内容创作
      'analytics-dashboard',  // 数据看板
      'market-researcher',    // 市场调研
      'macro-monitor',        // 宏观经济
      'idea-validator',       // 点子验证
      'note-organizer',       // 笔记整理
      'self-improving'        // 自我提升
    ],
    description: '公司最高管理者，拥有全部技能权限',
    level: 5
  },

  // CTO - 技术架构师
  cto: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'tech-news-digest',
      'github-skill',
      'frontend-design',
      'webapp-testing',
      'pdf',
      'canvas-design',
      'qclaw-env',
      'find-skills',
      'note-organizer',
      'self-improving'
    ],
    description: '技术架构师，专注技术开发与创新',
    level: 4
  },

  // CFO - 首席财务官
  cfo: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'news-summary',
      'docx',
      'pptx',
      'xlsx',
      'pdf',
      'canvas-design',
      'email-skill',
      'tencent-docs',
      'analytics-dashboard',
      'market-researcher',
      'macro-monitor',
      'weather-advisor',
      'note-organizer'
    ],
    description: '首席财务官，专注财务与数据分析',
    level: 4
  },

  // CMO - 首席营销官
  cmo: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'news-summary',
      'tech-news-digest',
      'market-researcher',
      'docx',
      'pptx',
      'xlsx',
      'pdf',
      'canvas-design',
      'content-factory',
      'content-repurposer',
      'video-script',
      'email-skill',
      'tencent-docs',
      'tencent-meeting-mcp',
      'analytics-dashboard',
      'weather-advisor',
      'travel-planner',
      'note-organizer'
    ],
    description: '首席营销官，专注市场与内容营销',
    level: 4
  },

  // COO - 首席运营官
  coo: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'news-summary',
      'docx',
      'pptx',
      'xlsx',
      'pdf',
      'canvas-design',
      'email-skill',
      'tencent-docs',
      'tencent-meeting-mcp',
      'qclaw-openclaw',
      'qclaw-env',
      'find-skills',
      'analytics-dashboard',
      'weather-advisor',
      'travel-planner',
      'note-organizer',
      'self-improving'
    ],
    description: '首席运营官，专注运营与管理',
    level: 4
  },

  // 总监 - 部门负责人
  director: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'news-summary',
      'docx',
      'pptx',
      'xlsx',
      'pdf',
      'email-skill',
      'tencent-docs',
      'tencent-meeting-mcp',
      'qclaw-openclaw',
      'analytics-dashboard',
      'weather-advisor',
      'note-organizer'
    ],
    description: '部门总监，负责团队管理与项目推进',
    level: 3
  },

  // 资深工程师 - Senior
  senior: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'tech-news-digest',
      'github-skill',
      'frontend-design',
      'webapp-testing',
      'pdf',
      'canvas-design',
      'qclaw-env',
      'find-skills',
      'note-organizer',
      'self-improving'
    ],
    description: '资深工程师，负责核心技术任务',
    level: 2
  },

  // 工程师 - Staff
  staff: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'github-skill',
      'frontend-design',
      'pdf',
      'note-organizer'
    ],
    description: '工程师，负责执行开发任务',
    level: 1
  },

  // 全栈工程师 - Fullstack
  fullstack: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'tech-news-digest',
      'github-skill',
      'frontend-design',
      'webapp-testing',
      'pdf',
      'canvas-design',
      'qclaw-env',
      'find-skills',
      'docx',
      'pptx',
      'xlsx',
      'email-skill',
      'tencent-docs',
      'note-organizer',
      'self-improving'
    ],
    description: '全栈工程师，负责前后端开发',
    level: 2
  },

  // 初级助理 - Junior
  junior: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'online-search',
      'multi-search-engine',
      'note-organizer'
    ],
    description: '初级助理，执行基础任务',
    level: 0
  },

  // 实习生 - Intern
  intern: {
    skills: [
      'file-skill',
      'qclaw-text-file',
      'note-organizer'
    ],
    description: '实习生，学习与辅助',
    level: 0
  }
};

// ========== 职能类别映射 ==========
const CATEGORY_TO_SKILLS = {
  file: ['file-skill', 'qclaw-text-file'],
  search: ['online-search', 'multi-search-engine'],
  news: ['news-summary', 'tech-news-digest'],
  document: ['docx', 'pptx', 'xlsx', 'pdf'],
  design: ['canvas-design', 'frontend-design'],
  communication: ['email-skill', 'tencent-docs', 'tencent-meeting-mcp'],
  development: ['github-skill', 'webapp-testing', 'qclaw-env', 'find-skills'],
  system: ['qclaw-openclaw', 'qclaw-env', 'find-skills'],
  life: ['weather-advisor', 'travel-planner'],
  content: ['content-factory', 'content-repurposer', 'video-script'],
  analytics: ['analytics-dashboard', 'market-researcher', 'macro-monitor'],
  ai: ['idea-validator', 'note-organizer', 'self-improving']
};

// ========== 技能查询函数 ==========

/**
 * 获取角色的技能列表
 */
function getRoleSkills(role) {
  if (!role) return ROLE_SKILLS.staff;
  const roleLower = role.toLowerCase();
  
  // 精确匹配
  if (ROLE_SKILLS[roleLower]) {
    return ROLE_SKILLS[roleLower];
  }
  
  // 别名匹配
  const aliases = {
    'ceo': 'ceo',
    'cto': 'cto',
    'cfo': 'cfo',
    'cmo': 'cmo',
    'coo': 'coo',
    'c_suite': 'cto',
    'c-suite': 'cto',
    'director': 'director',
    'senior': 'senior',
    'staff': 'staff',
    'fullstack': 'fullstack',
    'full-stack': 'fullstack',
    'junior': 'junior',
    'intern': 'intern'
  };
  
  const normalized = aliases[roleLower];
  return normalized ? ROLE_SKILLS[normalized] : ROLE_SKILLS.staff;
}

/**
 * 获取角色的技能ID列表
 */
function getRoleSkillIds(role) {
  const roleSkills = getRoleSkills(role);
  return roleSkills ? roleSkills.skills : [];
}

/**
 * 获取角色的技能详情
 */
function getRoleSkillDetails(role) {
  const skillIds = getRoleSkillIds(role);
  return skillIds.map(id => ({
    id,
    ...AVAILABLE_SKILLS[id]
  })).filter(s => s.name); // 过滤掉未定义的技能
}

/**
 * 按类别获取角色的技能
 */
function getRoleSkillsByCategory(role, category) {
  const skills = getRoleSkillDetails(role);
  if (!category) return skills;
  return skills.filter(s => s.category === category);
}

/**
 * 获取所有可用的技能
 */
function getAllSkills() {
  return Object.entries(AVAILABLE_SKILLS).map(([id, data]) => ({
    id,
    ...data
  }));
}

/**
 * 获取所有可用的技能（按类别分组）
 */
function getAllSkillsByCategory() {
  const categories = {};
  for (const [id, skill] of Object.entries(AVAILABLE_SKILLS)) {
    const cat = skill.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ id, ...skill });
  }
  return categories;
}

/**
 * 获取所有角色定义
 */
function getAllRoles() {
  return Object.entries(ROLE_SKILLS).map(([id, data]) => ({
    id,
    ...data,
    skillCount: data.skills ? data.skills.length : 0
  }));
}

/**
 * 检查技能是否属于某角色
 */
function hasSkill(role, skillId) {
  const skills = getRoleSkillIds(role);
  return skills.includes(skillId);
}

/**
 * 获取角色的技能统计
 */
function getRoleStats(role) {
  const roleSkills = getRoleSkills(role);
  if (!roleSkills) return null;
  
  const categories = {};
  for (const skillId of roleSkills.skills) {
    const skill = AVAILABLE_SKILLS[skillId];
    if (skill) {
      const cat = skill.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(skill.name);
    }
  }
  
  return {
    role,
    level: roleSkills.level,
    totalSkills: roleSkills.skills.length,
    description: roleSkills.description,
    categories
  };
}

// ========== 导出 ==========
module.exports = {
  AVAILABLE_SKILLS,
  ROLE_SKILLS,
  CATEGORY_TO_SKILLS,
  getRoleSkills,
  getRoleSkillIds,
  getRoleSkillDetails,
  getRoleSkillsByCategory,
  getAllSkills,
  getAllSkillsByCategory,
  getAllRoles,
  hasSkill,
  getRoleStats
};
