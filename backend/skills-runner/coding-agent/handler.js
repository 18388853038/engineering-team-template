/**
 * coding-agent — 由 Skill Importer 从 SKILL.md 自动生成
 * 'Delegate coding tasks to Codex, Claude Code, OpenCode, or Pi agents via immediate background processes. Use when: (1) building or creating features/apps, (2) reviewing PRs in a temp clone/worktree, (3) refactoring large codebases, (4) iterative coding that needs file exploration. NOT for: simple one-line fixes (just edit), reading code (use read tool), thread-bound ACP harness requests in chat (use sessions_spawn with runtime:
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
    skill: 'coding-agent',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
