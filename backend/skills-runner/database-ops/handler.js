/**
 * database-ops — 由 Skill Importer 从 SKILL.md 自动生成
 * 数据库操作指南，涵盖 SQLite、MySQL、PostgreSQL 的常见操作、查询优化、迁移管理
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
    skill: 'database-ops',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
