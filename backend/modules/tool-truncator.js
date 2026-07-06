// 工具返回结果自动截断器
// 对大结果截断后返回精简版，完整内容写入核心记忆库供后续检索

var TRUNCATE_LIMIT = 800000;  // 最大字符数（约 200 tokens）
var MAX_OBJECT_KEYS = 100;  // 对象最大属性数

function truncateToolResult(result) {
  if (!result) return result;

  var truncated = false;
  var originalContent = '';

  // 处理 message 字段 (字符串)
  if (typeof result.message === 'string' && result.message.length > TRUNCATE_LIMIT) {
    originalContent = result.message;
    result.message = result.message.substring(0, TRUNCATE_LIMIT) +
      '\n... [结果已截断，完整内容已存入记忆库，可搜索查看]';
    truncated = true;
  }

  // 处理 data 字段 (对象)
  if (result.data && typeof result.data === 'object') {
    var dataStr = JSON.stringify(result.data);
    if (dataStr.length > TRUNCATE_LIMIT) {
      if (!originalContent) originalContent = dataStr;
      result.data = { _truncated: true, _note: '完整数据已存入记忆库' };
      truncated = true;
    }
  }

  return { result: result, truncated: truncated, originalContent: originalContent };
}

module.exports = { truncateToolResult, TRUNCATE_LIMIT };
