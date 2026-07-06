/**
 * QQ机器人连接器插件
 * OpenClaw Plugin: @tencent-connect/openclaw-qqbot
 * 注意：该插件因安全扫描限制，OpenClaw网关层安装被阻止
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'qq_send_group_message',
      description: '通过QQ机器人向群组发送消息',
      params: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: '群号' },
          message: { type: 'string', description: '消息内容' }
        },
        required: ['group_id', 'message']
      },
      handler: async function(args) {
        return { ok: false, error: 'QQ机器人插件安装受限（child_process安全检测），需手动安装' };
      }
    },
    {
      name: 'qq_send_private_message',
      description: '通过QQ机器人发送私聊消息',
      params: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: '用户QQ号' },
          message: { type: 'string', description: '消息内容' }
        },
        required: ['user_id', 'message']
      },
      handler: async function(args) {
        return { ok: false, error: 'QQ机器人插件安装受限（child_process安全检测），需手动安装' };
      }
    }
  ];
};
