/**
 * discord — 由 Skill Importer 从 SKILL.md 自动生成
 * Discord ops via the message tool (channel=discord).
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'discord 技能说明文档已就绪',
      description: `Discord ops via the message tool (channel=discord).`,
      commands: [{"lang":"json","code":"{\n  \"action\": \"send\",\n  \"channel\": \"discord\",\n  \"to\": \"channel:123\",\n  \"message\": \"hello\",\n  \"silent\": true\n}"},{"lang":"json","code":"{\n  \"action\": \"send\",\n  \"channel\": \"discord\",\n  \"to\": \"channel:123\",\n  \"message\": \"see attachment\",\n  \"media\": \"file:///tmp/example.png\"\n}"},{"lang":"json","code":"{\n  \"action\": \"send\",\n  \"channel\": \"discord\",\n  \"to\": \"channel:123\",\n  \"message\": \"Status update\",\n  \"components\": \"[Carbon v2 components]\"\n}"},{"lang":"json","code":"{\n  \"action\": \"send\",\n  \"channel\": \"discord\",\n  \"to\": \"channel:123\",\n  \"message\": \"Status update\",\n  \"embeds\": [{ \"title\": \"Legacy\", \"description\": \"Embeds are legacy.\" }]\n}"},{"lang":"json","code":"{\n  \"action\": \"react\",\n  \"channel\": \"discord\",\n  \"channelId\": \"123\",\n  \"messageId\": \"456\",\n  \"emoji\": \"✅\"\n}"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'database',
    skill: 'discord',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
