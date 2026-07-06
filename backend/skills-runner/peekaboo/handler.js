/**
 * peekaboo — 由 Skill Importer 从 SKILL.md 自动生成
 * Capture and automate macOS UI with the Peekaboo CLI.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'peekaboo 技能说明文档已就绪',
      description: `Capture and automate macOS UI with the Peekaboo CLI.`,
      commands: [{"lang":"bash","code":"peekaboo permissions\npeekaboo list apps --json\npeekaboo see --annotate --path /tmp/peekaboo-see.png\npeekaboo click --on B1\npeekaboo type \"Hello\" --return"},{"lang":"bash","code":"peekaboo list windows --app \"Visual Studio Code\" --json\npeekaboo click --window-id 12345 --coords 120,160\npeekaboo type \"Hello from Peekaboo\" --window-id 12345"},{"lang":"bash","code":"peekaboo capture live --mode region --region 100,100,800,600 --duration 30 \\\n  --active-fps 8 --idle-fps 2 --highlight-changes --path /tmp/capture"},{"lang":"bash","code":"peekaboo move 500,300 --smooth\npeekaboo drag --from B1 --to T2\npeekaboo swipe --from-coords 100,500 --to-coords 100,200 --duration 800\npeekaboo scroll --direction down --amount 6 --smooth"},{"lang":"bash","code":"peekaboo hotkey --keys \"cmd,shift,t\"\npeekaboo press escape\npeekaboo type \"Line 1\\nLine 2\" --delay 10"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'database',
    skill: 'peekaboo',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
