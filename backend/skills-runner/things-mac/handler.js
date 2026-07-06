/**
 * things-mac — 由 Skill Importer 从 SKILL.md 自动生成
 * Add, update, list, search, or inspect Things 3 todos, inbox, today, projects, areas, and tags on macOS.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'things-mac 技能说明文档已就绪',
      description: `Add, update, list, search, or inspect Things 3 todos, inbox, today, projects, areas, and tags on macOS.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'things-mac',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
