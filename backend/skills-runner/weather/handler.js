/**
 * weather — 天气查询处理函数
 * 从 SKILL.md 的 curl 命令转换而来
 */
module.exports = async function handler(args) {
  const city = args.city || 'London';
  try {
    const resp = await fetch('https://wttr.in/' + encodeURIComponent(city) + '?format=%C+%t+%w+%h&lang=zh', {
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const text = await resp.text();
      return { type: 'weather', city, weather: text.trim(), source: 'wttr.in' };
    }
    return { type: 'error', message: 'HTTP ' + resp.status };
  } catch(e) {
    return { type: 'error', message: e.message };
  }
};
