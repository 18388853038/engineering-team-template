/**
 * datafenxi — 由 Skill Importer 从 SKILL.md 自动生成
 * 
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const { execSync } = require('child_process');
    const pyCode = input || `print("hello")`;
    const out = execSync('python -c ' + JSON.stringify(pyCode), { encoding: 'utf-8', timeout: 10000 });
    results.push({ output: out.trim() });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'python',
    skill: 'datafenxi',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
