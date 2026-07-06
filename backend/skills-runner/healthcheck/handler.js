/**
 * healthcheck — 系统健康检查
 * 基于 eCompany API 实时检查
 */
module.exports = async function handler(args) {
  const results = [];
  try {
    const resp = await fetch('http://127.0.0.1:8002/api/health', { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      results.push({ check: 'server', status: 'ok', uptime: data.uptime + 's', memory: data.memory });
    } else {
      results.push({ check: 'server', status: 'error', code: resp.status });
    }
  } catch(e) { results.push({ check: 'server', status: 'error', error: e.message }); }
  try {
    const resp = await fetch('http://127.0.0.1:8002/api/bi/overview', { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      results.push({ check: 'health_score', score: (data.health||{}).score || 'N/A', calls: data.todayCalls });
    }
  } catch(e) {}
  return { type: 'healthcheck', server: 'eCompany', checks: results, summary: results.filter(function(r){return r.status==='ok'}).length + '/' + results.length + ' 正常' };
};
