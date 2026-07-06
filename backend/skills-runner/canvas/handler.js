/**
 * canvas — 由 Skill Importer 从 SKILL.md 自动生成
 * 
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const resp = await fetch('http://<tailscale-hostname>:18793/__openclaw__/canvas/<file>', {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const text = await resp.text();
      results.push({ url: 'http://<tailscale-hostname>:18793/__openclaw__/canvas/<file>', status: resp.status, output: text.substring(0, 1000) });
    } else {
      results.push({ url: 'http://<tailscale-hostname>:18793/__openclaw__/canvas/<file>', error: 'HTTP ' + resp.status });
    }
  } catch(e) {
    results.push({ url: 'http://<tailscale-hostname>:18793/__openclaw__/canvas/<file>', error: e.message });
  }

  return {
    type: 'http',
    skill: 'canvas',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
