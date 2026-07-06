/**
 * himalaya — 由 Skill Importer 从 SKILL.md 自动生成
 * Use himalaya to list, read, search, compose, reply, forward, and organize IMAP/SMTP email.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'himalaya 技能说明文档已就绪',
      description: `Use himalaya to list, read, search, compose, reply, forward, and organize IMAP/SMTP email.`,
      commands: [{"lang":"bash","code":"himalaya account configure"},{"lang":"bash","code":"himalaya folder list"},{"lang":"bash","code":"himalaya envelope list"},{"lang":"bash","code":"himalaya envelope list --folder \"Sent\""},{"lang":"bash","code":"himalaya envelope list --page 1 --page-size 20"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'himalaya',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
