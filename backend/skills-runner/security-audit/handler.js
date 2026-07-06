/**
 * security-audit — 由 Skill Importer 从 SKILL.md 自动生成
 * 安全审计检查清单与常见漏洞防护指南，涵盖 Web 应用、API、数据库安全
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  results.push({ note: 'HTTP技能: 请提供要请求的URL或查询参数' });

  return {
    type: 'http',
    skill: 'security-audit',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
