/**
 * skylv-docker-helper — 由 Skill Importer 从 SKILL.md 自动生成
 * Docker assistant. Container management, image building, and Dockerfile optimization. Triggers: docker, container, dockerfile, docker build.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const { execSync } = require('child_process');
    const cmd = input || 'docker --version';
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    results.push({ command: cmd.substring(0, 60), output: out.trim() });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'docker',
    skill: 'skylv-docker-helper',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
