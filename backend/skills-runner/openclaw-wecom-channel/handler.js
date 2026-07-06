/**
 * openclaw-wecom-channel — 由 Skill Importer 从 SKILL.md 自动生成
 * 企业微信 (WeCom) Channel 插件 — 让 OpenClaw AI Agent 通过企业微信收发消息。支持消息加解密、Token 自动管理、访问控制策略。
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'openclaw-wecom-channel 技能说明文档已就绪',
      description: `企业微信 (WeCom) Channel 插件 — 让 OpenClaw AI Agent 通过企业微信收发消息。支持消息加解密、Token 自动管理、访问控制策略。`,
      commands: [{"lang":"bash","code":"# 克隆到 OpenClaw extensions 目录\ngit clone https://github.com/darrryZ/openclaw-wecom-channel.git ~/.openclaw/extensions/wecom"},{"lang":"bash","code":"cloudflared tunnel create wecom-tunnel\ncloudflared tunnel route dns wecom-tunnel wecom.yourdomain.com\ncloudflared tunnel run --edge-ip-version 4 --url http://localhost:18800 wecom-tunnel"},{"lang":"bash","code":"openclaw gateway restart"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'openclaw-wecom-channel',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
