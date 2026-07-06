/**
 * api-dev — 由 Skill Importer 从 SKILL.md 自动生成
 * Scaffold, test, document, and debug REST and GraphQL APIs. Use when the user needs to create API endpoints, write integration tests, generate OpenAPI specs, test with curl, mock APIs, or troubleshoot HTTP issues.
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
    skill: 'api-dev',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
