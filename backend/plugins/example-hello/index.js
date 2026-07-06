/**
 * Example Plugin: Hello World
 * 演示如何通过插件系统注册自定义工具
 */

module.exports = function registerTools(pluginSystem) {
  return [
    {
      name: 'hello_world',
      description: '一个简单的问候工具',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '问候对象的名字' }
        },
        required: []
      },
      handler: function(args) {
        var name = (args && args.name) || '世界';
        return '你好，' + name + '！这是由插件注册的自定义工具。';
      }
    },
    {
      name: 'system_info',
      description: '查看系统运行信息',
      parameters: {
        type: 'object',
        properties: {}
      },
      handler: function() {
        var mem = process.memoryUsage();
        return {
          uptime: Math.floor(process.uptime()) + 's',
          memory: Math.round(mem.rss / 1024 / 1024) + 'MB',
          node: process.version,
          platform: process.platform
        };
      }
    }
  ];
};
