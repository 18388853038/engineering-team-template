/**
 * video-frames — 由 Skill Importer 从 SKILL.md 自动生成
 * Extract frames or short clips from videos using ffmpeg.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'video-frames 技能说明文档已就绪',
      description: `Extract frames or short clips from videos using ffmpeg.`,
      commands: [{"lang":"bash","code":"{baseDir}/scripts/frame.sh /path/to/video.mp4 --out /tmp/frame.jpg"},{"lang":"bash","code":"{baseDir}/scripts/frame.sh /path/to/video.mp4 --time 00:00:10 --out /tmp/frame-10s.jpg"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'video-frames',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
