/**
 * coding-agent.js — 编码 Agent 工具模块
 * 
 * 为 eCompany 提供代码编写/执行/审查能力
 * 基于 sandbox.js 沙箱系统
 */

const fs = require('fs');
const path = require('path');
const { ProcessSandbox } = require('./sandbox');

const SANDBOX_DIR = path.join(__dirname, '..', 'sandbox');
const CODE_DIR = path.join(__dirname, '..', 'code-projects');

// Ensure directories exist
try { if (!fs.existsSync(CODE_DIR)) fs.mkdirSync(CODE_DIR, { recursive: true }); } catch(e) {}

// ========== 工具定义（DeepSeek function calling 格式）==========

const CODING_TOOLS = [
  {
    id: 'coding_execute',
    name: 'coding_execute',
    description: '在沙箱中执行代码。支持 Node.js(js)、Python(py)、Shell(sh)。返回执行结果和错误输出。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的代码' },
        language: { type: 'string', enum: ['js', 'py', 'sh'], description: '代码语言' },
        timeout: { type: 'number', description: '超时秒数（默认30）' }
      },
      required: ['code', 'language']
    },
    skills: ['编程', '开发', '技术'],
    permission: 'user',
    handler: async function(args) {
      try {
        var sandbox = new ProcessSandbox();
        var result = await sandbox.execute(args.code, args.language, {
          timeout: (args.timeout || 30) * 1000
        });
        return {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }
  },
  {
    id: 'coding_read_file',
    name: 'coding_read_file',
    description: '读取项目目录中的代码文件内容。路径相对于 code-projects 目录。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对于 code-projects/）' }
      },
      required: ['path']
    },
    skills: ['编程', '开发'],
    permission: 'user',
    handler: async function(args) {
      try {
        var fullPath = path.join(CODE_DIR, args.path);
        // Safety: ensure within CODE_DIR
        if (!fullPath.startsWith(CODE_DIR)) {
          return { error: 'Access denied: path outside code directory' };
        }
        if (!fs.existsSync(fullPath)) {
          return { error: 'File not found: ' + args.path };
        }
        var content = fs.readFileSync(fullPath, 'utf-8');
        return { success: true, content: content, size: content.length };
      } catch(e) {
        return { error: e.message };
      }
    }
  },
  {
    id: 'coding_write_file',
    name: 'coding_write_file',
    description: '写入代码到项目目录中的文件。可以创建新文件或覆盖已有文件。路径相对于 code-projects/。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对于 code-projects/）' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['path', 'content']
    },
    skills: ['编程', '开发'],
    permission: 'user',
    handler: async function(args) {
      try {
        var fullPath = path.join(CODE_DIR, args.path);
        if (!fullPath.startsWith(CODE_DIR)) {
          return { error: 'Access denied: path outside code directory' };
        }
        var dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, args.content, 'utf-8');
        return { success: true, path: args.path, bytes: Buffer.byteLength(args.content, 'utf-8') };
      } catch(e) {
        return { error: e.message };
      }
    }
  },
  {
    id: 'coding_list_files',
    name: 'coding_list_files',
    description: '列出项目目录中的文件和子目录。支持递归查看目录结构。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（相对于 code-projects/，默认根目录）' },
        deep: { type: 'boolean', description: '是否递归列出' }
      }
    },
    skills: ['编程', '开发'],
    permission: 'user',
    handler: async function(args) {
      try {
        var targetPath = path.join(CODE_DIR, args.path || '');
        if (!targetPath.startsWith(CODE_DIR)) {
          return { error: 'Access denied' };
        }
        if (!fs.existsSync(targetPath)) {
          return { error: 'Directory not found' };
        }
        
        function listDir(dir, relative, deep) {
          var items = [];
          var entries = fs.readdirSync(dir);
          entries.forEach(function(e) {
            var full = path.join(dir, e);
            var rel = relative ? relative + '/' + e : e;
            var stat = fs.statSync(full);
            items.push({
              name: e,
              path: rel,
              type: stat.isDirectory() ? 'dir' : 'file',
              size: stat.size,
              modified: stat.mtime.toISOString()
            });
            if (deep && stat.isDirectory()) {
              items = items.concat(listDir(full, rel, deep));
            }
          });
          return items;
        }
        
        var items = listDir(targetPath, args.path || '', args.deep);
        return { success: true, items: items, total: items.length };
      } catch(e) {
        return { error: e.message };
      }
    }
  }
];

// ========== API 路由注册 ==========

function registerCodingRoutes(registerRoute, parseBody, json) {
  registerRoute(['GET'], /^\/api\/coding\/projects$/, function(req, res) {
    try {
      if (!fs.existsSync(CODE_DIR)) {
        json(res, { ok: true, projects: [] });
        return;
      }
      var items = fs.readdirSync(CODE_DIR);
      var projects = [];
      items.forEach(function(item) {
        var full = path.join(CODE_DIR, item);
        if (fs.statSync(full).isDirectory()) {
          var fileCount = 0;
          try {
            var allFiles = fs.readdirSync(full, { recursive: true }).filter(function(f) { return fs.statSync(path.join(full, f)).isFile(); });
            fileCount = allFiles.length;
          } catch(e) {}
          projects.push({
            name: item,
            path: item,
            files: fileCount,
            modified: fs.statSync(full).mtime.toISOString()
          });
        }
      });
      json(res, { ok: true, projects: projects });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  registerRoute(['GET'], /^\/api\/coding\/projects\/([^\/]+)$/, function(req, res, m) {
    try {
      var projectPath = path.join(CODE_DIR, m[1]);
      if (!projectPath.startsWith(CODE_DIR)) {
        return json(res, { ok: false, error: 'Access denied' }, 403);
      }
      if (!fs.existsSync(projectPath)) {
        return json(res, { ok: false, error: 'Project not found' }, 404);
      }
      
      function readDir(dir, relative) {
        var items = [];
        var entries = fs.readdirSync(dir);
        entries.forEach(function(e) {
          var full = path.join(dir, e);
          var rel = relative ? relative + '/' + e : e;
          var stat = fs.statSync(full);
          items.push({
            name: e,
            path: rel,
            type: stat.isDirectory() ? 'dir' : 'file',
            size: stat.size,
            modified: stat.mtime.toISOString()
          });
          if (stat.isDirectory()) {
            items = items.concat(readDir(full, rel));
          }
        });
        return items;
      }
      
      var files = readDir(projectPath, '');
      json(res, { ok: true, project: m[1], files: files, total: files.length });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // === Docker 沙箱路由 ===
  registerRoute(['GET'], /^\/api\/sandbox\/status$/, function(req, res) {
    try {
      var DockerSandbox = require('./sandbox').DockerSandbox;
      var sandbox = new DockerSandbox();
      json(res, { ok: true, status: sandbox.getStatus() });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  // 沙箱执行已移至 server-modern.js（新 ProcessSandbox 实现）
  // 此路由从 coding-agent.js 移除以避免重复注册冲突
  // 原实现保留在 git 历史中，如有需要可恢复
}

// Docker 沙箱工具
var DOCKER_TOOL = {
  id: 'coding_docker_exec',
  name: 'coding_docker_exec',
  description: '在 Docker 沙箱中安全执行代码。适用于不信任代码的隔离执行。支持 Node.js(js)、Python(py)、Shell(sh)。',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: '要执行的代码' },
      language: { type: 'string', enum: ['js', 'py', 'sh'], description: '代码语言' }
    },
    required: ['code', 'language']
  },
  skills: ['编程', '安全', '沙箱'],
  permission: 'admin',
  handler: async function(args) {
    try {
      var DockerSandbox = require('./sandbox').DockerSandbox;
      var sandbox = new DockerSandbox();
      var result = await sandbox.execute(args.code, args.language);
      return { success: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
};

// ========== 导出 ==========

module.exports = {
  CODING_TOOLS: CODING_TOOLS.concat([DOCKER_TOOL]),
  registerCodingRoutes: registerCodingRoutes
};
