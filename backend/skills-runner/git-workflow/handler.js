/**
 * git-workflow — 由 Skill Importer 从 SKILL.md 自动生成
 * Git 工作流最佳实践，涵盖分支策略、冲突解决、提交规范、代码合并
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  results.push({ note: 'HTTP技能: 请提供要请求的URL或查询参数' });

  return {
    type: 'http',
    skill: 'git-workflow',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
