/**
 * openclaw-api-tester — 由 Skill Importer 从 SKILL.md 自动生成
 * Test API endpoints and document responses. Define tests in plain English, run them, get formatted results. Agent-driven Postman alternative.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const resp = await fetch('https://api', {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const text = await resp.text();
      results.push({ url: 'https://api', status: resp.status, output: text.substring(0, 1000) });
    } else {
      results.push({ url: 'https://api', error: 'HTTP ' + resp.status });
    }
  } catch(e) {
    results.push({ url: 'https://api', error: e.message });
  }

  return {
    type: 'http',
    skill: 'openclaw-api-tester',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
