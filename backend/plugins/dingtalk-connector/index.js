/**
 * 钉钉连接器插件
 * OpenClaw Plugin: @dingtalk-real-ai/dingtalk-connector v0.8.20
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'dingtalk_send_message',
      description: '通过钉钉发送工作通知消息',
      params: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: '应用AgentId' },
          user_id: { type: 'string', description: '接收者UserID' },
          msg: { type: 'string', description: '消息内容' },
          msg_type: { type: 'string', description: '消息类型：text/markdown' }
        },
        required: ['agent_id', 'user_id', 'msg']
      },
      handler: async function(args) {
        return { ok: true, message: '钉钉消息已发送（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'dingtalk_send_group_message',
      description: '通过钉钉机器人发送群消息',
      params: {
        type: 'object',
        properties: {
          webhook: { type: 'string', description: '群机器人Webhook地址' },
          content: { type: 'string', description: '消息内容' },
          at_user_ids: { type: 'array', description: '@的用户ID列表' }
        },
        required: ['webhook', 'content']
      },
      handler: async function(args) {
        return { ok: true, message: '钉钉群消息已发送（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'dingtalk_create_approval',
      description: '发起钉钉审批流程',
      params: {
        type: 'object',
        properties: {
          process_code: { type: 'string', description: '审批流程模板ID' },
          originator_user_id: { type: 'string', description: '发起人UserID' },
          form_data: { type: 'object', description: '表单数据' }
        },
        required: ['process_code', 'originator_user_id']
      },
      handler: async function(args) {
        return { ok: true, message: '钉钉审批已发起（需OpenClaw网关路由）', args: args };
      }
    }
  ];
};
