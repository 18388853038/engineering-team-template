/**
 * dingtalk — 由 Skill Importer 从 SKILL.md 自动生成
 * DingTalk channel plugin for OpenClaw - send and receive messages via DingTalk (钉钉)
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'dingtalk 技能说明文档已就绪',
      description: `DingTalk channel plugin for OpenClaw - send and receive messages via DingTalk (钉钉)`,
      commands: [{"lang":"bash","code":"export DINGTALK_CLIENT_ID=\"your-app-key\"\nexport DINGTALK_CLIENT_SECRET=\"your-app-secret\""},{"lang":"bash","code":"openclaw config --section channels\n# Select DingTalk and follow prompts"},{"lang":"yaml","code":"channels:\n  dingtalk:\n    enabled: true\n    webhookUrl: \"https://oapi.dingtalk.com/robot/send?access_token=xxxxx\"\n    webhookSecret: \"SECxxxxx\"  # optional, for signature verification"},{"lang":"typescript","code":"await message({\n  channel: \"dingtalk\",\n  target: \"user-id\",\n  text: \"Hello from OpenClaw!\"\n});"},{"lang":"","code":"https://your-gateway/webhook/dingtalk"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'dingtalk',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
