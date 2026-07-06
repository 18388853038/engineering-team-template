/**
 * apple-reminders — 由 Skill Importer 从 SKILL.md 自动生成
 * List, add, edit, complete, or delete Apple Reminders and reminder lists via remindctl.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'apple-reminders 技能说明文档已就绪',
      description: `List, add, edit, complete, or delete Apple Reminders and reminder lists via remindctl.`,
      commands: [{"lang":"bash","code":"remindctl list               # List all lists\nremindctl list Work          # Show specific list\nremindctl list Projects --create    # Create list\nremindctl list Work --delete        # Delete list"},{"lang":"bash","code":"remindctl add \"Buy milk\"\nremindctl add --title \"Call mom\" --list Personal --due tomorrow\nremindctl add --title \"Meeting prep\" --due \"2026-02-15 09:00\""},{"lang":"bash","code":"remindctl complete 1 2 3     # Complete by ID\nremindctl delete 4A83 --force  # Delete by ID"},{"lang":"bash","code":"remindctl today --json       # JSON for scripting\nremindctl today --plain      # TSV format\nremindctl today --quiet      # Counts only"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'apple-reminders',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
