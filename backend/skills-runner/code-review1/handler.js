/**
 * code-review — 代码审查
 * 分析代码质量、安全性和性能
 */
module.exports = async function handler(args) {
  const code = args.code || args.text || args.input || '';
  if (!code) return { type: 'code_review', error: '请提供要审查的代码(args.code)' };
  const issues = [];
  const lines = code.split('\n');
  if (code.includes('eval(')) issues.push({ severity: 'ERROR', msg: '使用eval()存在代码注入风险' });
  if (code.includes('innerHTML')) issues.push({ severity: 'WARN', msg: 'innerHTML可能导致XSS攻击' });
  if (code.includes('var ') && code.includes('const ')) issues.push({ severity: 'INFO', msg: '混用var/const,建议统一使用const' });
  if (lines.length > 300) issues.push({ severity: 'INFO', msg: '文件过长(' + lines.length + '行),建议拆分' });
  if (code.includes('password') && !code.includes('encrypt')) issues.push({ severity: 'WARN', msg: '密码未加密处理' });
  if (code.includes('SELECT') && code.includes('WHERE') && !code.includes('?')) issues.push({ severity: 'WARN', msg: 'SQL查询可能存在注入风险,建议使用参数化查询' });
  return {
    type: 'code_review',
    language: args.language || 'auto',
    lines: lines.length,
    issues: issues,
    summary: '发现 ' + issues.length + ' 个问题: ' + issues.map(function(i){return i.severity + ':' + i.msg}).join('; ')
  };
};
