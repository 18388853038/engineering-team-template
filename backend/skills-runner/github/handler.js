/**
 * github — 由 Skill Importer 从 SKILL.md 自动生成
 * Use gh for GitHub issues, PR status, CI/logs, comments, reviews, releases, and API queries.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'github 技能说明文档已就绪',
      description: `Use gh for GitHub issues, PR status, CI/logs, comments, reviews, releases, and API queries.`,
      commands: [{"lang":"bash","code":"# Authenticate (one-time)\ngh auth login\n\n# Verify\ngh auth status"},{"lang":"bash","code":"# Gateway service env file (example: ~/.openclaw/gateway.systemd.env)\nGH_CONFIG_DIR=/path/to/operator/.config/gh"},{"lang":"bash","code":"# List issues\ngh issue list --repo owner/repo --state open\n\n# Create issue\ngh issue create --title \"Bug: something broken\" --body \"Details...\"\n\n# Close issue\ngh issue close 42 --repo owner/repo"},{"lang":"bash","code":"gh issue list --repo owner/repo --json number,title --jq '.[] | \"\\(.number): \\(.title)\"'\ngh pr list --json number,title,state,mergeable --jq '.[] | select(.mergeable == \"MERGEABLE\")'"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'github',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
