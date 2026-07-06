/**
 * spotify-player — 由 Skill Importer 从 SKILL.md 自动生成
 * Terminal Spotify playback/search via spogo (preferred) or spotify_player.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'spotify-player 技能说明文档已就绪',
      description: `Terminal Spotify playback/search via spogo (preferred) or spotify_player.`,
      commands: []
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'browser',
    skill: 'spotify-player',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
