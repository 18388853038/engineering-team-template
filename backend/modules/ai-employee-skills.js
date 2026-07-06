/**
 * AI 员工技能持久化模块
 * 独立的配置文件 ai-employee-config.json
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'ai-employee-config.json');

const DEFAULT_SKILLS = [
  { icon: '🔧', name: '代码执行', desc: '在本地沙箱中执行代码', key: 'code_exec', enabled: true },
  { icon: '🌐', name: '网络搜索', desc: '从互联网检索最新信息', key: 'web_search', enabled: true },
  { icon: '📄', name: '文件操作', desc: '读取和写入项目文件', key: 'file_ops', enabled: true },
  { icon: '🗄️', name: '数据库查询', desc: '从数据库中查询和分析数据', key: 'db_query', enabled: true },
  { icon: '🎨', name: '图像生成', desc: '使用 AI 生成图像', key: 'image_gen', enabled: false },
  { icon: '📊', name: '数据分析', desc: '分析数据和生成报表', key: 'data_analyze', enabled: true },
  { icon: '🔍', name: '代码审查', desc: '自动审查代码质量', key: 'code_review', enabled: true },
  { icon: '📝', name: '文档生成', desc: '自动生成项目文档', key: 'doc_gen', enabled: true },
  { icon: '📧', name: '邮件处理', desc: '发送和接收电子邮件', key: 'email', enabled: false },
  { icon: '🔄', name: '工作流自动化', desc: '自动执行重复性工作流', key: 'workflow', enabled: true },
  { icon: '🐛', name: '调试助手', desc: '帮助分析和修复代码错误', key: 'debug', enabled: true },
  { icon: '🧪', name: '测试套件', desc: '编写和执行自动化测试', key: 'test', enabled: true },
];

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } 
  catch(e) { return { skills: DEFAULT_SKILLS.map(s => ({ ...s })) }; }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

function getSkills() {
  return loadConfig().skills;
}

function toggleSkill(key, enabled) {
  const cfg = loadConfig();
  const skill = cfg.skills.find(s => s.key === key);
  if (!skill) return { ok: false, error: '技能不存在: ' + key };
  skill.enabled = enabled;
  saveConfig(cfg);
  return { ok: true, key, enabled, message: 'AI 员工技能 "' + skill.name + '" 已' + (enabled ? '启用' : '禁用') };
}

module.exports = { getSkills, toggleSkill, DEFAULT_SKILLS };
