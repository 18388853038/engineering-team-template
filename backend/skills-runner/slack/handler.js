/**
 * slack — Slack 消息格式化与集成指南
 */
module.exports = async function handler(args) {
  const results = [];
  const text = args.text || args.message || args.input || '';
  const channel = args.channel || 'general';
  
  // Generate formatted Slack message blocks
  if (text) {
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: text } }
    ];
    results.push({ format: 'Slack Block Kit', blocks: blocks, json: JSON.stringify({ channel: '#' + channel, blocks: blocks }).substring(0, 300) });
  }
  
  // Provide useful Slack info
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    results.push({
      documentation: 'Slack API 集成方式',
      methods: [
        { name: 'Webhook', desc: '最简单方式,发送POST到webhook URL', setup: '在Slack App页面创建Incoming Webhook' },
        { name: 'Slack API', desc: '完整功能,支持所有消息类型', setup: '创建Slack App,获取Bot Token', docs: 'https://api.slack.com/methods/chat.postMessage' },
        { name: 'Block Kit', desc: '富文本消息格式', docs: 'https://api.slack.com/block-kit' }
      ],
      webhookConfigured: !!webhookUrl,
      samples: [
        { type: 'text', example: '发送简单文本消息' },
        { type: 'blocks', example: '使用Block Kit构建富文本卡片、按钮、选择器等' },
        { type: 'thread', example: '在Thread中回复: POST chat.postMessage with thread_ts' }
      ]
    });
  } catch(e) { results.push({ error: e.message }); }
  return { type: 'slack_guide', results: results };
};
