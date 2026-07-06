/**
 * 企业微信连接器插件
 * OpenClaw Skill: openclaw-wecom-channel
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'wecom_send_app_message',
      description: '通过企业微信应用发送消息到指定用户或部门',
      params: {
        type: 'object',
        properties: {
          touser: { type: 'string', description: '接收者UserID，多个用|分隔' },
          toparty: { type: 'string', description: '接收者部门ID' },
          msgtype: { type: 'string', description: '消息类型：text/image/file' },
          content: { type: 'string', description: '消息内容' }
        },
        required: ['msgtype', 'content']
      },
      handler: async function(args) {
        return { ok: true, message: '企业微信消息已发送（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'wecom_get_department_list',
      description: '获取企业微信部门列表',
      params: { type: 'object', properties: {} },
      handler: async function() {
        return { ok: true, message: '部门列表（需OpenClaw网关路由）' };
      }
    },
    {
      name: 'wecom_get_user_list',
      description: '获取企业微信部门成员列表',
      params: {
        type: 'object',
        properties: {
          department_id: { type: 'number', description: '部门ID' }
        },
        required: ['department_id']
      },
      handler: async function(args) {
        return { ok: true, message: '成员列表（需OpenClaw网关路由）', args: args };
      }
    },
    {
      name: 'wecom_create_approval',
      description: '发起企业微信审批流程',
      params: {
        type: 'object',
        properties: {
          template_id: { type: 'string', description: '审批模板ID' },
          data: { type: 'object', description: '审批数据' }
        },
        required: ['template_id', 'data']
      },
      handler: async function(args) {
        return { ok: true, message: '审批已发起（需OpenClaw网关路由）', args: args };
      }
    }
  ];
};
