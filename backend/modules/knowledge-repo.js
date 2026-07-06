/**
 * knowledge-repo.js — knowledge-engine 的封装桥接模块
 * 提供向后兼容的 API 接口，实际委托给 knowledge-engine
 */
const path = require('path');
const fs = require('fs');
const knowledgeEngine = require('./knowledge-engine');

// 知识库数据目录
const DATA_DIR = path.join(__dirname, '..', 'data');
// 知识库附加文件目录
const KB_DIR = path.join(__dirname, '..', '..', 'knowledge');

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 初始化
ensureDir(DATA_DIR);
ensureDir(KB_DIR);

/**
 * 搜索知识库
 */
function searchKnowledge(query, options) {
  options = options || {};
  return knowledgeEngine.searchKnowledge(query, options);
}

/**
 * 获取知识库统计
 */
function getStats() {
  return knowledgeEngine.getStats();
}

/**
 * 获取所有条目
 */
function getAll() {
  var stats = knowledgeEngine.getStats();
  var results = knowledgeEngine.searchKnowledge('', { limit: stats.count || 100 });
  return results;
}

/**
 * 列出知识库内容
 */
function listAll() {
  var results = getAll();
  if (Array.isArray(results)) {
    return results.map(function(item) {
      return {
        id: item.id || item._id,
        title: item.title || item.question || '(无标题)',
        category: item.category || item.type || 'general',
        summary: (item.content || item.answer || '').substring(0, 100),
        updatedAt: item.updatedAt || item.createdAt
      };
    });
  }
  return [];
}

/**
 * 读取 knowledge/ 目录下的 Markdown 文件
 */
function readMarkdownFiles() {
  var results = [];
  if (!fs.existsSync(KB_DIR)) return results;
  var files = fs.readdirSync(KB_DIR).filter(function(f) {
    return f.endsWith('.md');
  });
  files.forEach(function(file) {
    try {
      var content = fs.readFileSync(path.join(KB_DIR, file), 'utf8');
      var lines = content.split('\n');
      results.push({
        id: file.replace(/\.md$/, ''),
        title: lines[0] ? lines[0].replace(/^#\s*/, '') : file,
        type: 'markdown',
        content: content,
        updatedAt: fs.statSync(path.join(KB_DIR, file)).mtime
      });
    } catch(e) {}
  });
  return results;
}

module.exports = {
  searchKnowledge: searchKnowledge,
  getStats: getStats,
  getAll: getAll,
  listAll: listAll,
  readMarkdownFiles: readMarkdownFiles
};
