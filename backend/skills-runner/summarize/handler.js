/**
 * summarize — 文本摘要
 * 通过系统推理能力进行文本摘要
 */
module.exports = async function handler(args) {
  const text = args.text || args.input || args.content || '';
  if (!text) return { type: 'summarize', error: '请提供要摘要的文本(args.text)', text: '' };
  const maxLen = args.maxLength || 200;
  const lines = text.split('\n').filter(function(l){return l.trim()});
  const sentences = text.split(/[。.!！\n]+/).filter(function(s){return s.trim().length > 10});
  const summary = sentences.slice(0, 3).join('、') + '...';
  return {
    type: 'summarize',
    original: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    summary: summary.substring(0, maxLen),
    stats: { chars: text.length, lines: lines.length, sentences: sentences.length }
  };
};
