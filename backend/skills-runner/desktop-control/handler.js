/**
 * desktop-control — 正式版 handler
 * 使用项目内嵌的 Python 虚拟环境（位置: F:\eCompany-Dev\）
 */
const path = require('path');
const { execSync } = require('child_process');

// handler.js 位于: F:\eCompany-Dev\backend\skills-runner\desktop-control\
// 项目根目录: F:\eCompany-Dev\
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PYTHON = path.join(PROJECT_ROOT, 'desktop-control-env', 'Scripts', 'python.exe');
const SCRIPT = path.join(PROJECT_ROOT, 'desktop-control.py');

module.exports = async function handler(args) {
  const category = args.cmd || args.category || args.action || 'help';
  const action = args.action || args.subcmd || '';
  const params = args.args || args.params || args._ || [];

  // Build command-line args
  const cmdArgs = [category, action, ...params].map(a => JSON.stringify(String(a)));
  const cmd = `"${PYTHON}" "${SCRIPT}" ${cmdArgs.join(' ')}`;

  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    let parsed;
    try { parsed = JSON.parse(out.trim()); } catch { parsed = out.trim(); }
    return {
      type: 'desktop-control',
      skill: 'desktop-control',
      results: [{ output: parsed }],
      note: '正式版 — 内嵌 Python 环境，可打包转移'
    };
  } catch (e) {
    return {
      type: 'desktop-control',
      skill: 'desktop-control',
      results: [{ error: e.message, stderr: e.stderr?.trim() }],
      note: '调用失败'
    };
  }
};
