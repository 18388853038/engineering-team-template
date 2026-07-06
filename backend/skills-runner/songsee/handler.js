/**
 * songsee — 由 Skill Importer 从 SKILL.md 自动生成
 * Generate spectrograms and feature-panel visualizations from audio with the songsee CLI.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'songsee 技能说明文档已就绪',
      description: `Generate spectrograms and feature-panel visualizations from audio with the songsee CLI.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'songsee',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
