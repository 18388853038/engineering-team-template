/**
 * xurl — URL分析与抓取
 * 检查URL可访问性并获取内容
 */
module.exports = async function handler(args) {
  const url = args.url || args.input || args.text || '';
  if (!url) return { type: 'xurl', error: '请提供URL(args.url)' };
  const results = [];
  try {
    const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await resp.text();
    results.push({ url: url, status: resp.status, ok: resp.ok, size: text.length, contentType: resp.headers.get('content-type') || 'unknown' });
    if (resp.ok && text.length > 0) {
      const title = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (title) results.push({ title: title[1] });
      results.push({ preview: text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200) });
    }
  } catch(e) { results.push({ url: url, error: e.message }); }
  return { type: 'xurl', results: results };
};
