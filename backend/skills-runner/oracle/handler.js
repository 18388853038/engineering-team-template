/**
 * oracle — 由 Skill Importer 从 SKILL.md 自动生成
 * Use oracle CLI to bundle prompts and files for second-model debugging, refactor, design, or review checks.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'oracle 技能说明文档已就绪',
      description: `Use oracle CLI to bundle prompts and files for second-model debugging, refactor, design, or review checks.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'oracle',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
