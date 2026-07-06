/**
 * openai-whisper — 由 Skill Importer 从 SKILL.md 自动生成
 * Local speech-to-text with the Whisper CLI (no API key).
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const resp = await fetch('https://openai', {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const text = await resp.text();
      results.push({ url: 'https://openai', status: resp.status, output: text.substring(0, 1000) });
    } else {
      results.push({ url: 'https://openai', error: 'HTTP ' + resp.status });
    }
  } catch(e) {
    results.push({ url: 'https://openai', error: e.message });
  }

  return {
    type: 'http',
    skill: 'openai-whisper',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
