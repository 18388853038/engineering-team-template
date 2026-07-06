/**
 * session-logs — 由 Skill Importer 从 SKILL.md 自动生成
 * Search and analyze your own session logs (older/parent conversations) using jq.
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'session-logs 技能说明文档已就绪',
      description: `Search and analyze your own session logs (older/parent conversations) using jq.`,
      commands: [{"lang":"bash","code":"jq -r 'select(.message.role == \"user\") | .message.content[]? | select(.type == \"text\") | .text' <session>.jsonl"},{"lang":"bash","code":"jq -r 'select(.message.role == \"assistant\") | .message.content[]? | select(.type == \"text\") | .text' <session>.jsonl | rg -i \"keyword\""},{"lang":"bash","code":"jq -s '[.[] | .message.usage.cost.total // 0] | add' <session>.jsonl"},{"lang":"bash","code":"jq -r '.message.content[]? | select(.type == \"toolCall\") | .name' <session>.jsonl | sort | uniq -c | sort -rn"},{"lang":"bash","code":"AGENT_ID=\"<agentId>\"\nSESSION_DIR=\"${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/agents/$AGENT_ID/sessions\"\nrg -l \"phrase\" \"$SESSION_DIR\"/*.jsonl"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'session-logs',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
