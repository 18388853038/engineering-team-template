/**
 * blogwatcher — 由 Skill Importer 从 SKILL.md 自动生成
 * Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'blogwatcher 技能说明文档已就绪',
      description: `Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.`,
      commands: [{"lang":"","code":"$ blogwatcher blogs\nTracked blogs (1):\n\n  xkcd\n    URL: https://xkcd.com"},{"lang":"","code":"$ blogwatcher scan\nScanning 1 blog(s)...\n\n  xkcd\n    Source: RSS | Found: 4 | New: 4\n\nFound 4 new article(s) total!"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'blogwatcher',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
