/**
 * tmux — 由 Skill Importer 从 SKILL.md 自动生成
 * Remote-control tmux sessions for interactive CLIs by sending keystrokes and scraping pane output.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'tmux 技能说明文档已就绪',
      description: `Remote-control tmux sessions for interactive CLIs by sending keystrokes and scraping pane output.`,
      commands: [{"lang":"bash","code":"tmux list-sessions\ntmux ls"},{"lang":"bash","code":"# Last 20 lines of pane\ntmux capture-pane -t shared -p | tail -20\n\n# Entire scrollback\ntmux capture-pane -t shared -p -S -\n\n# Specific pane in window\ntmux capture-pane -t shared:0.0 -p"},{"lang":"bash","code":"# Select window\ntmux select-window -t shared:0\n\n# Select pane\ntmux select-pane -t shared:0.1\n\n# List windows\ntmux list-windows -t shared"},{"lang":"bash","code":"# Create new session\ntmux new-session -d -s newsession\n\n# Kill session\ntmux kill-session -t sessionname\n\n# Rename session\ntmux rename-session -t old new"},{"lang":"bash","code":"tmux send-keys -t shared -l -- \"Please apply the patch in src/foo.ts\"\nsleep 0.1\ntmux send-keys -t shared Enter"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'tmux',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
