/**
 * dingtalk-channel-install — 由 Skill Importer 从 SKILL.md 自动生成
 * 安装和配置 OpenClaw 钉钉通道。使用当用户需要：(1) 安装 @soimy/dingtalk 插件，(2) 配置钉钉通道（Client ID/Secret 等），(3) 设置钉钉机器人连接。提供一键安装脚本和完整配置流程。
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
    skill: 'dingtalk-channel-install',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
