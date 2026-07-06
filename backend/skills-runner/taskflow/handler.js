/**
 * taskflow — 由 Skill Importer 从 SKILL.md 自动生成
 * Coordinate multi-step detached tasks as one durable TaskFlow job with owner context, state, waits, and child tasks.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'taskflow 技能说明文档已就绪',
      description: `Coordinate multi-step detached tasks as one durable TaskFlow job with owner context, state, waits, and child tasks.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'taskflow',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
