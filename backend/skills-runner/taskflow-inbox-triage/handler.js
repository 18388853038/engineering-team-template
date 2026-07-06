/**
 * taskflow-inbox-triage — 由 Skill Importer 从 SKILL.md 自动生成
 * Example TaskFlow pattern for inbox triage, intent routing, waiting on replies, and later summaries.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'taskflow-inbox-triage 技能说明文档已就绪',
      description: `Example TaskFlow pattern for inbox triage, intent routing, waiting on replies, and later summaries.`,
      commands: [{"lang":"json","code":"{\n  \"businessThreads\": [],\n  \"personalItems\": [],\n  \"eodSummary\": []\n}"},{"lang":"json","code":"{\n  \"kind\": \"reply\",\n  \"channel\": \"slack\",\n  \"threadKey\": \"slack:thread-1\"\n}"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'taskflow-inbox-triage',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
