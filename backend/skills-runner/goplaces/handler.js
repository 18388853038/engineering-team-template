/**
 * goplaces — 由 Skill Importer 从 SKILL.md 自动生成
 * Query Google Places for text search, place details, resolve, reviews, or scriptable JSON via goplaces.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'goplaces 技能说明文档已就绪',
      description: `Query Google Places for text search, place details, resolve, reviews, or scriptable JSON via goplaces.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'goplaces',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
