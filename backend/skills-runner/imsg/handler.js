/**
 * imsg — 由 Skill Importer 从 SKILL.md 自动生成
 * iMessage/SMS CLI for listing chats, history, and sending messages via Messages.app.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'imsg 技能说明文档已就绪',
      description: `iMessage/SMS CLI for listing chats, history, and sending messages via Messages.app.`,
      commands: [{"lang":"bash","code":"imsg chats --limit 10 --json"},{"lang":"bash","code":"# By chat ID\nimsg history --chat-id 1 --limit 20 --json\n\n# With attachments info\nimsg history --chat-id 1 --limit 20 --attachments --json"},{"lang":"bash","code":"imsg watch --chat-id 1 --attachments"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'imsg',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
