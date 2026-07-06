/**
 * nano-pdf — 由 Skill Importer 从 SKILL.md 自动生成
 * Edit PDFs with natural-language instructions using the nano-pdf CLI.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'nano-pdf 技能说明文档已就绪',
      description: `Edit PDFs with natural-language instructions using the nano-pdf CLI.`,
      commands: [{"lang":"bash","code":"nano-pdf edit deck.pdf 1 \"Change the title to 'Q3 Results' and fix the typo in the subtitle\""}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'nano-pdf',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
