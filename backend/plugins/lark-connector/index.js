/**
 * 飞书/Lark连接器插件
 * OpenClaw Plugin: @larksuite/openclaw-lark v2026.5.7
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'lark_send_message',
      description: '通过飞书发送消息（私聊或群聊）',
      params: {
        type: 'object',
        properties: {
          receive_id: { type: 'string', description: '接收者ID' },
          receive_id_type: { type: 'string', description: 'ID类型：open_id/user_id/chat_id' },
          msg_type: { type: 'string', description: '消息类型：text/post/image' },
          content: { type: 'string', description: '消息内容JSON' }
        },
        required: ['receive_id', 'receive_id_type', 'msg_type', 'content']
      },
      handler: async function(args) {
        return { ok: true, message: '飞书消息已发送（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'lark_create_calendar_event',
      description: '创建飞书日历事件',
      params: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '日程标题' },
          start_time: { type: 'string', description: '开始时间（ISO格式）' },
          end_time: { type: 'string', description: '结束时间（ISO格式）' },
          attendees: { type: 'array', description: '参会人列表' }
        },
        required: ['title', 'start_time', 'end_time']
      },
      handler: async function(args) {
        return { ok: true, message: '飞书日程已创建（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'lark_search_messages',
      description: '搜索飞书聊天消息',
      params: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          chat_id: { type: 'string', description: '限定搜索的群聊ID' }
        },
        required: ['query']
      },
      handler: async function(args) {
        return { ok: true, message: '搜索结果（需OpenClaw网关路由）', args: args };
      }
    }
  ];
};
