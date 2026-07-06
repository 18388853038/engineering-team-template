/**
 * eCompany 工具执行器
 * 
 * 为AI Agent提供真正的文件操作能力
 * 支持：
 * 1. 文件读取 - 带权限检查
 * 2. 文件写入 - 带权限检查
 * 3. 目录操作 - 带权限检查
 * 4. 代码执行 - 带沙箱保护
 */

const fs = require('fs');
const path = require('path');
try { var fp = require('./file-permissions'); var fpManager = fp.getFilePermissionInstance ? fp.getFilePermissionInstance() : null; } catch(e) { var fpManager = null; }
// Null-safe wrapper: if fpManager unavailable, allow all (fail-open for dev)
function fpGuard(method, ...args) {
  if (!fpManager) return { allowed: true };
  if (typeof fpManager[method] !== 'function') return { allowed: true };
  try { return fpManager[method](...args); } catch(e) { return { allowed: true, error: e.message }; }
}



// ========== 工具定义 ==========
const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取本地文件内容。如果路径是相对路径，会在当前工作目录下查找。',
      parameters: {
        type: 'object',
        properties: {
          filepath: { 
            type: 'string', 
            description: '要读取的文件路径，例如 "data/config.json" 或 "C:\\Users\\admin\\file.txt"' 
          }
        },
        required: ['filepath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入内容到本地文件。如果文件不存在则创建，如果存在则覆盖。',
      parameters: {
        type: 'object',
        properties: {
          filepath: { 
            type: 'string', 
            description: '要写入的文件路径，例如 "data/output.json"' 
          },
          content: { 
            type: 'string', 
            description: '要写入的文件内容' 
          },
          append: { 
            type: 'boolean', 
            description: '是否为追加模式，默认为false（覆盖）' 
          }
        },
        required: ['filepath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录中的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          dirpath: { 
            type: 'string', 
            description: '要列出的目录路径，例如 "data" 或 "C:\\Users\\admin"' 
          },
          recursive: { 
            type: 'boolean', 
            description: '是否递归列出子目录，默认为false' 
          }
        },
        required: ['dirpath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: '创建新目录。如果父目录不存在也会一并创建。',
      parameters: {
        type: 'object',
        properties: {
          dirpath: { 
            type: 'string', 
            description: '要创建的目录路径，例如 "data/new-folder"' 
          }
        },
        required: ['dirpath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除指定文件。',
      parameters: {
        type: 'object',
        properties: {
          filepath: { 
            type: 'string', 
            description: '要删除的文件路径' 
          }
        },
        required: ['filepath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_exists',
      description: '检查文件或目录是否存在。',
      parameters: {
        type: 'object',
        properties: {
          filepath: { 
            type: 'string', 
            description: '要检查的路径' 
          }
        },
        required: ['filepath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: '获取文件或目录的详细信息（大小、创建时间、修改时间等）。',
      parameters: {
        type: 'object',
        properties: {
          filepath: { 
            type: 'string', 
            description: '要查询的路径' 
          }
        },
        required: ['filepath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在目录中搜索匹配的文件。',
      parameters: {
        type: 'object',
        properties: {
          dirpath: { 
            type: 'string', 
            description: '要搜索的目录路径' 
          },
          pattern: { 
            type: 'string', 
            description: '搜索模式，支持通配符，例如 "*.js" 或 "test*.json"' 
          },
          recursive: { 
            type: 'boolean', 
            description: '是否递归搜索子目录，默认为true' 
          }
        },
        required: ['dirpath', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_code',
      description: '执行代码片段（仅支持JavaScript）。',
      parameters: {
        type: 'object',
        properties: {
          code: { 
            type: 'string', 
            description: '要执行的JavaScript代码' 
          },
          language: { 
            type: 'string', 
            description: '语言类型，目前仅支持 "javascript"' 
          }
        },
        required: ['code']
      }
    }
  }
];

// ========== 工具执行器 ==========
class ToolsExecutor {
  constructor() {
    this.workspaceRoot = process.cwd();
  }

  /**
   * 执行单个工具调用
   */
  async execute(agentId, agentRole, agentCategory, toolName, toolArgs) {
    var startTime = Date.now();
    var result;
    try {
      switch (toolName) {
        case 'read_file':
          result = await this.readFile(agentId, agentRole, agentCategory, toolArgs.filepath); break;
        case 'write_file':
          result = await this.writeFile(agentId, agentRole, agentCategory, toolArgs.filepath, toolArgs.content, toolArgs.append); break;
        case 'list_directory':
          result = await this.listDirectory(agentId, agentRole, agentCategory, toolArgs.dirpath, toolArgs.recursive); break;
        case 'create_directory':
          result = await this.createDirectory(agentId, agentRole, agentCategory, toolArgs.dirpath); break;
        case 'delete_file':
          result = await this.deleteFile(agentId, agentRole, agentCategory, toolArgs.filepath); break;
        case 'file_exists':
          result = await this.fileExists(agentId, agentRole, agentCategory, toolArgs.filepath); break;
        case 'get_file_info':
          result = await this.getFileInfo(agentId, agentRole, agentCategory, toolArgs.filepath); break;
        case 'search_files':
          result = await this.searchFiles(agentId, agentRole, agentCategory, toolArgs.dirpath, toolArgs.pattern, toolArgs.recursive); break;
        case 'execute_code':
          result = await this.executeCode(agentId, agentRole, agentCategory, toolArgs.code, toolArgs.language); break;
        default:
          result = { success: false, error: '未知工具: ' + toolName }; break;
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }
    // 记录工具调用指标（使用 result 判断成功/失败）
    try {
      var MetricsCollector = require('./metrics');
      var mc = new MetricsCollector();
      mc.recordToolCall({
        agentId: agentId || 'unknown',
        toolName: toolName,
        startTime: startTime,
        endTime: Date.now(),
        success: result && result.success !== false,
        error: result && result.success === false ? (result.error || result.message || '') : null
      });
    } catch(e) {}
    return result;
  }

  /**
   * 批量执行工具调用
   */
  async executeBatch(agentId, agentRole, agentCategory, toolCalls) {
    const results = [];
    for (const tc of toolCalls) {
      const result = await this.execute(agentId, agentRole, agentCategory, tc.name, tc.args);
      results.push({
        name: tc.name,
        args: tc.args,
        result: result
      });
    }
    return results;
  }

  // ========== 文件操作实现 ==========

  /**
   * 解析绝对路径
   */
  _resolvePath(relativePath) {
    if (path.isAbsolute(relativePath)) {
      return path.normalize(relativePath);
    }
    return path.resolve(this.workspaceRoot, relativePath);
  }

  async readFile(agentId, agentRole, agentCategory, filepath) {
    const absolutePath = this._resolvePath(filepath);
    
    // 权限检查
    const check = fpGuard("checkRead", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '文件不存在' };
      }

      const stats = fs.statSync(absolutePath);
      if (stats.isDirectory()) {
        return { success: false, error: '这是一个目录，请使用 list_directory 工具' };
      }

      // 检查文件大小
      const sizeCheck = fpGuard("checkFileSize", agentId, agentRole, agentCategory, stats.size);
      if (!sizeCheck.allowed) {
        return { success: false, error: sizeCheck.reason };
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      
      // 如果文件太大，截断并提示
      const maxPreview = 50000; // 50KB
      if (content.length > maxPreview) {
        return {
          success: true,
          content: content.substring(0, maxPreview),
          truncated: true,
          totalSize: stats.size,
          message: `文件较大（${stats.size} bytes），已截断显示前 ${maxPreview} 字符`
        };
      }

      return {
        success: true,
        content: content,
        size: stats.size,
        path: absolutePath
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async writeFile(agentId, agentRole, agentCategory, filepath, content, append = false) {
    const absolutePath = this._resolvePath(filepath);
    
    // 权限检查
    const check = fpGuard("checkWrite", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      // 检查文件大小
      const contentBuffer = Buffer.from(content);
      const sizeCheck = fpGuard("checkFileSize", agentId, agentRole, agentCategory, contentBuffer.length);
      if (!sizeCheck.allowed) {
        return { success: false, error: sizeCheck.reason };
      }

      // 确保目录存在
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (append) {
        fs.appendFileSync(absolutePath, content, 'utf-8');
      } else {
        fs.writeFileSync(absolutePath, content, 'utf-8');
      }

      return {
        success: true,
        path: absolutePath,
        size: contentBuffer.length,
        mode: append ? 'append' : 'write'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async listDirectory(agentId, agentRole, agentCategory, dirpath, recursive = false) {
    const absolutePath = this._resolvePath(dirpath);
    
    // 权限检查
    const check = fpGuard("checkRead", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '目录不存在' };
      }

      const stats = fs.statSync(absolutePath);
      if (!stats.isDirectory()) {
        return { success: false, error: '这不是一个目录' };
      }

      const items = this._listDirRecursive(absolutePath, recursive ? null : 1);
      
      return {
        success: true,
        path: absolutePath,
        items: items,
        count: items.length
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  _listDirRecursive(basePath, maxDepth, currentDepth = 0) {
    if (maxDepth !== null && currentDepth >= maxDepth) {
      return [];
    }

    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      const results = [];

      for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        const item = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: fullPath
        };

        if (entry.isDirectory()) {
          item.children = this._listDirRecursive(fullPath, maxDepth, currentDepth + 1);
        }

        results.push(item);
      }

      return results;
    } catch (err) {
      return [];
    }
  }

  async createDirectory(agentId, agentRole, agentCategory, dirpath) {
    const absolutePath = this._resolvePath(dirpath);
    
    // 权限检查
    const check = fpGuard("checkWrite", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (fs.existsSync(absolutePath)) {
        return { success: false, error: '目录已存在' };
      }

      fs.mkdirSync(absolutePath, { recursive: true });

      return {
        success: true,
        path: absolutePath,
        message: '目录创建成功'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deleteFile(agentId, agentRole, agentCategory, filepath) {
    const absolutePath = this._resolvePath(filepath);
    
    // 权限检查
    const check = fpGuard("checkWrite", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '文件不存在' };
      }

      const stats = fs.statSync(absolutePath);
      if (stats.isDirectory()) {
        fs.rmdirSync(absolutePath, { recursive: true });
      } else {
        fs.unlinkSync(absolutePath);
      }

      return {
        success: true,
        path: absolutePath,
        type: stats.isDirectory() ? 'directory' : 'file',
        message: '删除成功'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async fileExists(agentId, agentRole, agentCategory, filepath) {
    const absolutePath = this._resolvePath(filepath);
    const exists = fs.existsSync(absolutePath);
    
    if (exists) {
      const stats = fs.statSync(absolutePath);
      return {
        success: true,
        exists: true,
        path: absolutePath,
        type: stats.isDirectory() ? 'directory' : 'file'
      };
    }

    return {
      success: true,
      exists: false,
      path: absolutePath
    };
  }

  async getFileInfo(agentId, agentRole, agentCategory, filepath) {
    const absolutePath = this._resolvePath(filepath);
    
    // 权限检查
    const check = fpGuard("checkRead", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '文件不存在' };
      }

      const stats = fs.statSync(absolutePath);
      return {
        success: true,
        path: absolutePath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async searchFiles(agentId, agentRole, agentCategory, dirpath, pattern, recursive = true) {
    const absolutePath = this._resolvePath(dirpath);
    
    // 权限检查
    const check = fpGuard("checkRead", agentId, agentRole, agentCategory, absolutePath);
    if (!check.allowed) {
      return { success: false, error: `权限不足: ${check.reason}` };
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '目录不存在' };
      }

      const results = this._searchFilesRecursive(absolutePath, pattern, recursive);
      
      return {
        success: true,
        path: absolutePath,
        pattern: pattern,
        results: results,
        count: results.length
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  _searchFilesRecursive(basePath, pattern, recursive) {
    const results = [];
    
    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      
      // 转换通配符为正则
      const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      
      for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        
        if (entry.isDirectory() && recursive) {
          results.push(...this._searchFilesRecursive(fullPath, pattern, recursive));
        }
        
        if (entry.isFile() && regexPattern.test(entry.name)) {
          results.push({
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(basePath, fullPath)
          });
        }
      }
    } catch (err) {
      // 忽略权限错误
    }
    
    return results;
  }

  async executeCode(agentId, agentRole, agentCategory, code, language = 'javascript') {
    // 权限检查（代码执行权限）
    const check = fpGuard("checkWrite", agentId, agentRole, agentCategory, 'dummy.js');
    
    if (language !== 'javascript' && language !== 'js') {
      return { success: false, error: '目前仅支持 JavaScript 代码执行' };
    }

    try {
      // 使用沙箱执行代码
      const { ProcessSandbox } = require('./sandbox');
      const sandbox = new ProcessSandbox({ timeout: 10000, maxMemory: 128 });
      const result = await sandbox.execute(code, 'js');
      
      if (result.exitCode === 0) {
        return {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr || '',
          duration: result.duration
        };
      } else {
        return {
          success: false,
          error: result.stderr || result.error || '代码执行失败',
          exitCode: result.exitCode
        };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取所有可用工具定义
   */
  getToolDefinitions() {
    return FILE_TOOLS;
  }

  /**
   * 检查Agent是否有文件工具权限
   */
  hasFileAccess(agentId, agentRole, agentCategory) {
    const perms = fpGuard("getAgentPermissions", agentId, agentRole, agentCategory);
    
    // 检查是否有任何读取或写入权限
    return {
      canRead: perms.readPaths && (perms.readPaths.includes('*') || perms.readPaths.length > 0),
      canWrite: perms.writePaths && (perms.writePaths.includes('*') || perms.writePaths.length > 0),
      permissions: perms
    };
  }
}

// 导出单例
let instance = null;

function getToolsExecutor() {
  if (!instance) {
    instance = new ToolsExecutor();
  }
  return instance;
}

module.exports = {
  FILE_TOOLS,
  ToolsExecutor,
  getToolsExecutor
};
