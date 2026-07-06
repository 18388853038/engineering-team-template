/**
 * bear-notes — 由 Skill Importer 从 SKILL.md 自动生成
 * Create, search, and manage Bear notes via grizzly CLI.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'bear-notes 技能说明文档已就绪',
      description: `Create, search, and manage Bear notes via grizzly CLI.`,
      commands: [{"lang":"bash","code":"echo \"Note content here\" | grizzly create --title \"My Note\" --tag work\ngrizzly create --title \"Quick Note\" --tag inbox < /dev/null"},{"lang":"bash","code":"grizzly open-note --id \"NOTE_ID\" --enable-callback --json"},{"lang":"bash","code":"echo \"Additional content\" | grizzly add-text --id \"NOTE_ID\" --mode append --token-file ~/.config/grizzly/token"},{"lang":"bash","code":"grizzly tags --enable-callback --json --token-file ~/.config/grizzly/token"},{"lang":"bash","code":"grizzly open-tag --name \"work\" --enable-callback --json"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'bear-notes',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
