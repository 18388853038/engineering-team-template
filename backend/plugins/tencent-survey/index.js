/**
 * 腾讯问卷插件
 * OpenClaw Skill: tencent-survey
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'tencent_survey_create',
      description: '创建腾讯问卷',
      params: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '问卷标题' },
          description: { type: 'string', description: '问卷描述' },
          questions: { type: 'array', description: '题目列表' }
        },
        required: ['title', 'questions']
      },
      handler: async function(args) {
        return { ok: true, message: '问卷已创建（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_survey_collect',
      description: '获取问卷回收数据',
      params: {
        type: 'object',
        properties: {
          survey_id: { type: 'string', description: '问卷ID' },
          page: { type: 'number', description: '页码' },
          page_size: { type: 'number', description: '每页数量' }
        },
        required: ['survey_id']
      },
      handler: async function(args) {
        return { ok: true, message: '回收数据（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_survey_statistics',
      description: '获取问卷统计分析结果',
      params: {
        type: 'object',
        properties: {
          survey_id: { type: 'string', description: '问卷ID' }
        },
        required: ['survey_id']
      },
      handler: async function(args) {
        return { ok: true, message: '统计结果（需OpenClaw Skill路由）', args: args };
      }
    }
  ];
};
