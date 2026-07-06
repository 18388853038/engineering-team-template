/**
 * performance-opt — 由 Skill Importer 从 SKILL.md 自动生成
 * 前端/Node.js 性能优化指南，涵盖 Vue 3、Vite 构建、Node.js 后端优化
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    if (input) {
      const vm = require('vm');
      const script = new vm.Script(input);
      const ctx = { console: console, require: require, args: args, result: null };
      const sandbox = vm.createContext(ctx);
      script.runInContext(sandbox);
      results.push({ output: ctx.result || 'executed' });
    } else {
      results.push({ note: 'Node.js技能: 请提供要执行的JavaScript代码' });
    }
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'node',
    skill: 'performance-opt',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
