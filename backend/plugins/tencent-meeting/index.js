/**
 * 腾讯会议插件
 * OpenClaw Skill: tencent-meeting-mcp
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'tencent_meeting_create',
      description: '创建腾讯会议',
      params: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '会议主题' },
          start_time: { type: 'string', description: '开始时间（ISO格式）' },
          duration: { type: 'number', description: '会议时长（分钟）' },
          attendees: { type: 'array', description: '参会人邮箱列表' },
          meeting_type: { type: 'number', description: '会议类型：1即时/2预约/3周期' }
        },
        required: ['subject', 'start_time']
      },
      handler: async function(args) {
        return { ok: true, message: '腾讯会议已创建（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_meeting_cancel',
      description: '取消腾讯会议',
      params: {
        type: 'object',
        properties: {
          meeting_number: { type: 'string', description: '会议号' },
          reason: { type: 'string', description: '取消原因' }
        },
        required: ['meeting_number']
      },
      handler: async function(args) {
        return { ok: true, message: '会议已取消（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_meeting_list',
      description: '查询用户已预约的会议列表',
      params: {
        type: 'object',
        properties: {
          start_time: { type: 'string', description: '查询起始时间' },
          end_time: { type: 'string', description: '查询结束时间' }
        }
      },
      handler: async function(args) {
        return { ok: true, message: '会议列表（需OpenClaw Skill路由）', args: args };
      }
    }
  ];
};
