/**
 * gifgrep — 由 Skill Importer 从 SKILL.md 自动生成
 * Search GIF providers with CLI/TUI, download results, and extract stills/sheets.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'gifgrep 技能说明文档已就绪',
      description: `Search GIF providers with CLI/TUI, download results, and extract stills/sheets.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'gifgrep',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
