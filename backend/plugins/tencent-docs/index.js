/**
 * 腾讯文档插件
 * OpenClaw Skill: tencent-docs
 */
module.exports = function(pluginSystem) {
  return [
    {
      name: 'tencent_docs_create',
      description: '创建腾讯在线文档（Word/Excel/幻灯片/智能表格等）',
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', description: '文档类型：doc/xls/slide/mindmap/flowchart/smartTable' },
          title: { type: 'string', description: '文档标题' },
          space_id: { type: 'string', description: '目标空间ID' }
        },
        required: ['type', 'title']
      },
      handler: async function(args) {
        return { ok: true, message: '腾讯文档已创建（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_docs_read',
      description: '读取腾讯文档内容',
      params: {
        type: 'object',
        properties: {
          doc_id: { type: 'string', description: '文档ID' },
          range: { type: 'string', description: '读取范围' }
        },
        required: ['doc_id']
      },
      handler: async function(args) {
        return { ok: true, message: '文档内容已读取（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_docs_search',
      description: '搜索腾讯文档',
      params: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          space_id: { type: 'string', description: '限定搜索空间' }
        },
        required: ['query']
      },
      handler: async function(args) {
        return { ok: true, message: '搜索结果（需OpenClaw Skill路由）', args: args };
      }
    },
    {
      name: 'tencent_docs_upload',
      description: '上传本地文件到腾讯文档',
      params: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '本地文件路径' },
          space_id: { type: 'string', description: '目标空间ID' },
          parent_id: { type: 'string', description: '目标文件夹ID' }
        },
        required: ['file_path']
      },
      handler: async function(args) {
        return { ok: true, message: '文件已上传（需OpenClaw Skill路由）', args: args };
      }
    }
  ];
};
