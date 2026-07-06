// ============================================================================
// ECompany AI助手 - 通用AI Agent核心引擎
// 高度智能、逻辑严密的通用AI智能体
// 含完整本地工具执行能力
// ============================================================================

'use strict';

const path = require('path');
const fs = require('fs');
const BASE = path.resolve(__dirname, '..');

let wsServer = null;
let orchestratorInstance = null;
let _execCEOTool = null;

let _sseSendForToolCalls = null;
function setSseSendForToolCalls(fn) {
  _sseSendForToolCalls = fn;
}

// ----- 通用AI Agent系统提示词（对外用户可见）-----
const SYSTEM_PROMPT = `你是ECompany AI助手，一个高度智能、逻辑严密的通用AI智能体（AI Agent）。

## 核心身份与目标
你的核心目标是精准理解用户意图，通过深度思考和逻辑推理，提供专业、准确、可执行且富有洞察力的解决方案。你不仅是信息的检索者，更是复杂问题的解决者和执行者。

## 核心工作原则
1. 意图优先：在回答前，先精准剖析用户的真实需求，区分表面问题与深层目标。如果用户指令模糊，必须主动提出澄清性问题，而不是盲目猜测。
2. 结构化思考：面对复杂任务，必须遵循"分析 -> 拆解 -> 推理 -> 执行 -> 总结"的思维链路。优先使用分步推理(Step-by-Step)来确保逻辑的严密性。
3. **工具调用意识**：当任务超出纯文本推理范畴（如需要实时数据、复杂计算、代码执行或文件处理）时，**主动识别并调用合适的工具**。在调用工具前，说明调用原因；调用后，对工具返回的结果进行校验和总结。
4. 客观与严谨：基于事实和逻辑作答。遇到不确定的信息，必须明确声明"不确定"或提供概率性描述，严禁捏造事实（幻觉）。
5. 安全与合规：拒绝执行任何违反法律法规、侵犯隐私或具有破坏性的指令。

## 交互与输出规范
1. 格式自适应：根据内容类型自动选择最优排版。长篇内容使用Markdown（标题、列表、加粗、引用）；技术内容使用规范的代码块并附带注释；数据对比优先使用表格。
2. 语言风格：保持专业、客观、简洁、富有同理心。避免冗长的客套话和AI感过重的废话，直奔主题。
3. 动态反馈：在执行长任务时，主动汇报进度或中间结果，保持与用户的交互透明度。

## 异常处理机制
1. 指令冲突：当用户的多个指令存在逻辑冲突时，指出冲突点，并给出你认为最合理的折中方案或优先级建议。
2. 工具失败：如果调用的工具返回错误或超时，不要重复无效调用。应向用户解释失败原因，并尝试提供替代方案或纯文本层面的降级解答。

## 可用工具
你可以调用以下类别的工具来完成任务。当需要执行操作时，主动选择并调用合适的工具：

### 文件操作
- read_file：读取文件内容（支持绝对路径和相对路径）
- write_file：写入内容到文件
- list_directory：列出目录中的文件和子目录
- delete_file：删除文件
- move_file：移动或重命名文件

### 系统命令
- exec_command：在服务器上执行系统命令（安全沙箱+白名单限制）

### 网络搜索
- search_web：搜索互联网获取最新信息

### 知识库
- kb_search：查询知识文档
- kb_create：保存知识到知识库

### 系统管理
- system_health：检查系统健康状态
- system_logs：查看系统日志
- system_processes：查看运行中的进程
- system_disk：查看磁盘使用情况
- get_weather：查询天气

### 记忆能力
- memory_save：保存重要信息到持久化记忆
- memory_search：搜索历史记忆

### 数据分析
- bi_query：查询系统统计和趋势

## 思考与执行流程
每次收到用户消息时，请遵循以下流程：
1. **先理解用户意图**：用户是在提问？还是在下达执行任务？还是在闲聊？
2. **如果是闲聊/提问**：直接以自然语言回答，不需要调工具。
3. **如果是需要调查/执行的任务**：先分析要查什么，再一次性发出所有需要的工具调用。
4. **工具结果回来后**：基于真实数据写出完整的分析回答，不要罗列工具明细。
5. **调用工具时请说明原因**：在调工具前告诉用户你要做什么。

## 可用工具详解（技术细节）
当你需要调用工具时，使用以下格式：
- 工具名: read_file，参数: filepath (文件路径)
- 工具名: write_file，参数: filepath (文件路径), content (内容)
- 工具名: search_web，参数: query (搜索关键词)
- 工具名: get_weather，参数: city (城市名)
- 工具名: system_health，参数: 无
- 工具名: kb_search，参数: query (关键词)
- 工具名: exec_command，参数: command (命令), timeout (超时毫秒)
- 工具名: system_logs，参数: level (日志级别), limit (条数)
- 工具名: system_processes，参数: 无
- 工具名: system_disk，参数: 无
- 工具名: memory_save，参数: content (内容), tags (标签)
- 工具名: memory_search，参数: query (关键词)
- 工具名: bi_query，参数: query (overview/trend/report/leaderboard)
- 工具名: list_directory，参数: dirpath (目录路径)
- 工具名: delete_file，参数: path (文件路径)
- 工具名: move_file，参数: source (源路径), target (目标路径)`;

let running = false;
let taskQueue = [];
let activeSessions = {};
let sessionCounter = 0;

var _memoryEngine = null;
function getMemEngine() {
  if (!_memoryEngine) {
    try { _memoryEngine = require('./memory-engine'); } catch(e) { return null; }
  }
  return _memoryEngine;
}

var sessionMemory = [];

function loadMemory() {
  try {
    var mem = getMemEngine();
    if (mem) { var ctx = mem.getRecentContext(10, null, null); sessionMemory = ctx; }
  } catch(e) {}
}

function addSessionMemory(role, content) {
  sessionMemory.push({ role: role, content: String(content).substring(0, 3000), timestamp: new Date().toISOString() });
  while (sessionMemory.length > 50) sessionMemory.shift();
  var mem = getMemEngine();
  if (mem) { try { mem.addSessionMessage(role, content); } catch(e) {} }
}

function log(level, tag, msg) {
  const ts = new Date().toISOString().substring(11,19);
  console.log('[' + ts + '][' + level + '][' + tag + '] ' + msg);
}

function broadcast(msg, extra) {
  if (wsServer && typeof wsServer.broadcast === 'function') {
    try {
      wsServer.broadcast('channel', { channel: 'channel', type: 'channel_message', content: msg, source: 'ECompany AI助手', from: 'ECompany AI助手', time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) });
    } catch(e) { log('ERROR', '广播', e.message); }
  }
}

function setWSServer(ws) { wsServer = ws; }
function setExecCEOTool(fn) { _execCEOTool = fn; }

function start() {
  if (running) return { ok: true, message: 'ECompany AI助手已在运行' };
  running = true;
  loadMemory();
  broadcast('ECompany AI助手已就绪');
  return { ok: true, message: 'ECompany AI助手启动成功' };
}

function stop() {
  if (!running) return { ok: true, message: 'ECompany AI助手未运行' };
  running = false;
  return { ok: true, message: 'ECompany AI助手已停止' };
}

function getStatus() {
  return {
    running: running,
    taskQueueLength: taskQueue.length,
    activeSessions: Object.keys(activeSessions).length
  };
}

// ===== 构建有真实 handler 的完整工具列表 =====
function buildAgentTools() {
  var tools = [];

  // 1. 基础工具（有 handler 的 ROLE_TOOLS）
  try {
    var registry = require('./tools-registry');
    if (registry.ROLE_TOOLS && registry.ROLE_TOOLS.length > 0) {
      tools = tools.concat(registry.ROLE_TOOLS);
    }
  } catch(e) { log('WARN', '工具', 'ROLE_TOOLS加载失败: ' + e.message); }

  // 2. 文件系统工具（内置 handler）
  var FILE_SYSTEM_TOOLS = [
    {
      id: 'read_file',
      name: 'read_file',
      description: '读取项目内指定文件的内容（UTF-8 文本）。传入绝对路径或相对于项目根目录的路径。',
      parameters: { type: 'object', properties: { filepath: { type: 'string', description: '文件路径，绝对路径或相对于项目根目录' } }, required: ['filepath'] },
      handler: async (args) => {
        try {
          var p = args.filepath;
          if (!p) return { success: false, message: '缺少filepath' };
          // 如果是相对路径，转为绝对路径
          if (!path.isAbsolute(p)) p = path.resolve(BASE, p);
          if (!fs.existsSync(p)) return { success: false, message: '文件不存在: ' + p };
          var content = fs.readFileSync(p, 'utf8');
          var truncated = content.length > 10000;
          return { success: true, content: truncated ? content.substring(0, 10000) + '\n\n... [内容过长，截断至10000字符，实际长度: ' + content.length + ']' : content, path: args.filepath, bytes: content.length, truncated: truncated };
        } catch(e) { return { success: false, message: '读取失败: ' + e.message }; }
      }
    },
    {
      id: 'write_file',
      name: 'write_file',
      description: '将内容写入项目内的指定文件。目录不存在会自动创建。传入绝对路径或相对于项目根目录的路径。',
      parameters: { type: 'object', properties: { filepath: { type: 'string', description: '文件路径，绝对路径或相对于项目根目录' }, content: { type: 'string', description: '要写入的文件内容（UTF-8）' } }, required: ['filepath', 'content'] },
      handler: async (args) => {
        try {
          if (!args.filepath || args.content === undefined) return { success: false, message: '缺少参数' };
          var p = args.filepath;
          if (!path.isAbsolute(p)) p = path.resolve(BASE, p);
          var dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(p, args.content, 'utf8');
          return { success: true, message: '文件已写入: ' + args.filepath, bytes: Buffer.byteLength(args.content, 'utf8') };
        } catch(e) { return { success: false, message: '写入失败: ' + e.message }; }
      }
    },
    {
      id: 'list_directory',
      name: 'list_directory',
      description: '列出项目内指定目录中的文件和子目录列表。传入绝对路径或相对于项目根目录的路径。',
      parameters: { type: 'object', properties: { dirpath: { type: 'string', description: '目录路径，绝对路径或相对于项目根目录' } }, required: ['dirpath'] },
      handler: async (args) => {
        try {
          var dp = args.dirpath;
          if (!dp) return { success: false, message: '缺少dirpath' };
          if (!path.isAbsolute(dp)) dp = path.resolve(BASE, dp);
          if (!fs.existsSync(dp)) return { success: false, message: '目录不存在: ' + dp };
          var items = fs.readdirSync(dp);
          var details = items.map(function(item) {
            var full = path.join(dp, item);
            try { var stat = fs.statSync(full); return { name: item, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size }; }
            catch(e) { return { name: item, type: 'unknown' }; }
          });
          return { success: true, items: details, path: args.dirpath, total: items.length };
        } catch(e) { return { success: false, message: '列出目录失败: ' + e.message }; }
      }
    },
    {
      id: 'delete_file',
      name: 'delete_file',
      description: '删除项目内的文件（不可恢复，需谨慎使用）。传入绝对路径或相对于项目根目录的路径。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要删除的文件路径' } }, required: ['path'] },
      handler: async (args) => {
        try {
          var p = args.path;
          if (!p) return { success: false, message: '缺少path' };
          if (!path.isAbsolute(p)) p = path.resolve(BASE, p);
          if (!fs.existsSync(p)) return { success: false, message: '文件不存在: ' + p };
          // 备份
          var bak = p + '.bak.' + Date.now();
          fs.copyFileSync(p, bak);
          fs.unlinkSync(p);
          return { success: true, message: '文件已删除，备份保存至: ' + bak };
        } catch(e) { return { success: false, message: '删除失败: ' + e.message }; }
      }
    },
    {
      id: 'move_file',
      name: 'move_file',
      description: '移动或重命名文件。source和target都是绝对路径或相对于项目根目录的路径。',
      parameters: { type: 'object', properties: { source: { type: 'string', description: '源文件路径' }, target: { type: 'string', description: '目标文件路径' } }, required: ['source', 'target'] },
      handler: async (args) => {
        try {
          if (!args.source || !args.target) return { success: false, message: '缺少source或target' };
          var src = args.source, tgt = args.target;
          if (!path.isAbsolute(src)) src = path.resolve(BASE, src);
          if (!path.isAbsolute(tgt)) tgt = path.resolve(BASE, tgt);
          if (!fs.existsSync(src)) return { success: false, message: '源文件不存在: ' + args.source };
          var dir = path.dirname(tgt);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.renameSync(src, tgt);
          return { success: true, message: '文件已从 ' + args.source + ' 移动到 ' + args.target };
        } catch(e) { return { success: false, message: '移动失败: ' + e.message }; }
      }
    }
  ];
  tools = tools.concat(FILE_SYSTEM_TOOLS);

  // 3. 知识库搜索工具
  tools.push({
    id: 'kb_search',
    name: 'kb_search',
    description: '搜索知识库获取已知知识、技术资料、配置信息、历史文档。关键词越精确越好。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, limit: { type: 'number', description: '返回条数，默认5' } }, required: ['query'] },
    handler: async (args) => {
      try {
        var kb = require('./knowledge-engine');
        var query = args.query || '';
        var limit = args.limit || 5;
        var results = kb.searchKnowledge(query, { limit: limit });
        return { success: true, results: results, message: '找到 ' + results.length + ' 条结果' };
      } catch(e) { return { success: false, message: '搜索失败: ' + e.message }; }
    }
  });

  // 4. 系统工具
  tools.push({
    id: 'system_health',
    name: 'system_health',
    description: '检查系统健康状态：服务器运行时间、内存使用、AI提供商连通性、进程状态。',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try { var r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8002) + '/api/system/health-check', { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : { success: false, message: '健康检查失败' }; }
      catch(e) { return { success: false, message: '健康检查失败: ' + e.message }; }
    }
  });

  tools.push({
    id: 'system_logs',
    name: 'system_logs',
    description: '查看系统最近日志，排查错误，支持按级别筛选。',
    parameters: { type: 'object', properties: { level: { type: 'string', enum: ['error', 'warn', 'info'], description: '日志级别，默认error' }, limit: { type: 'number', description: '返回条数，默认20' } } },
    handler: async (args) => {
      try {
        var logPath = path.join(BASE, 'logs', 'app.log');
        if (!fs.existsSync(logPath)) return { success: false, message: '日志文件不存在' };
        var content = fs.readFileSync(logPath, 'utf-8');
        var lines = content.split('\n').filter(Boolean);
        var limit = args.limit || 20;
        var level = args.level || 'error';
        var filtered = lines.filter(function(l) { return l.toLowerCase().indexOf(level) >= 0; });
        var recent = filtered.slice(-limit);
        return { success: true, logs: recent, total: filtered.length, level: level };
      } catch(e) { return { success: false, message: '读取日志失败: ' + e.message }; }
    }
  });

  tools.push({
    id: 'system_processes',
    name: 'system_processes',
    description: '查看系统所有运行中的Node.js进程列表，确认各服务是否存活。',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        var cp = require('child_process');
        var out = cp.execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { timeout: 5000, encoding: 'utf-8', windowsHide: true });
        var lines = out.trim().split('\n').filter(Boolean);
        var processes = lines.map(function(l) {
          var parts = l.replace(/"/g, '').split(',');
          return { name: parts[0], pid: parts[1], session: parts[2], mem: parts[4] };
        });
        return { success: true, processes: processes, total: processes.length };
      } catch(e) {
        try {
          var out2 = require('child_process').execSync('ps aux | grep node', { timeout: 5000, encoding: 'utf-8' });
          var lines2 = out2.trim().split('\n').filter(Boolean);
          return { success: true, processes: lines2.map(function(l) { return { line: l.substring(0, 120) }; }), total: lines2.length };
        } catch(e2) { return { success: false, message: '获取进程列表失败: ' + e.message }; }
      }
    }
  });

  tools.push({
    id: 'system_disk',
    name: 'system_disk',
    description: '查看服务器磁盘使用情况，预警空间不足。',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        var cp = require('child_process');
        var out;
        if (process.platform === 'win32') {
          out = cp.execSync('wmic logicaldisk get size,freespace,caption', { timeout: 5000, encoding: 'utf-8', windowsHide: true });
        } else {
          out = cp.execSync('df -h', { timeout: 5000, encoding: 'utf-8' });
        }
        return { success: true, raw: out.trim().substring(0, 2000) };
      } catch(e) { return { success: false, message: '获取磁盘信息失败: ' + e.message }; }
    }
  });

  // 5. get_weather - 有 handler
  tools.push({
    id: 'get_weather',
    name: 'get_weather',
    description: '获取指定城市的天气信息。',
    parameters: { type: 'object', properties: { city: { type: 'string', description: '城市名称' } }, required: ['city'] },
    handler: async (args) => {
      try {
        var r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8002) + '/api/weather', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: args.city || '' }),
          signal: AbortSignal.timeout(10000)
        });
        return r.ok ? await r.json() : { success: false, message: '天气查询失败' };
      } catch(e) { return { success: false, message: '天气查询失败: ' + e.message }; }
    }
  });

  // 6. 记忆工具
  tools.push({
    id: 'memory_save',
    name: 'memory_save',
    description: '将重要信息写入持久化记忆文件。写入后下次对话也能回忆起这些内容。适合记录:用户偏好、关键决策、项目状态、任务进度等。',
    parameters: { type: 'object', properties: { content: { type: 'string', description: '要记忆的内容' }, tags: { type: 'string', description: '逗号分隔的标签，如 decision,preference,knowledge' } }, required: ['content'] },
    handler: async (args) => {
      try {
        var memFile = path.join(BASE, 'data', 'memory', 'persistent-memory.json');
        var dir = path.dirname(memFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        var mem = {};
        try { mem = JSON.parse(fs.readFileSync(memFile, 'utf-8')); } catch(e) {}
        if (!mem.entries) mem.entries = [];
        mem.entries.push({ content: args.content, tags: args.tags || '', timestamp: new Date().toISOString() });
        if (mem.entries.length > 500) mem.entries = mem.entries.slice(-500);
        fs.writeFileSync(memFile, JSON.stringify(mem, null, 2), 'utf-8');
        return { success: true, message: '记忆已保存', total: mem.entries.length };
      } catch(e) { return { success: false, message: '保存失败: ' + e.message }; }
    }
  });

  tools.push({
    id: 'memory_search',
    name: 'memory_search',
    description: '搜索持久化记忆文件，按关键词查找历史记忆内容。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, limit: { type: 'number', description: '最多返回条数，默认10' } }, required: ['query'] },
    handler: async (args) => {
      try {
        var memFile = path.join(BASE, 'data', 'memory', 'persistent-memory.json');
        if (!fs.existsSync(memFile)) return { success: true, results: [], message: '暂无记忆' };
        var mem = JSON.parse(fs.readFileSync(memFile, 'utf-8'));
        var entries = mem.entries || [];
        var query = (args.query || '').toLowerCase();
        var limit = args.limit || 10;
        var results = entries.filter(function(e) {
          return (e.content && e.content.toLowerCase().indexOf(query) >= 0) || (e.tags && e.tags.toLowerCase().indexOf(query) >= 0);
        }).slice(-limit);
        return { success: true, results: results, total: results.length };
      } catch(e) { return { success: false, message: '搜索失败: ' + e.message }; }
    }
  });

  // 7. bi_query
  tools.push({
    id: 'bi_query',
    name: 'bi_query',
    description: '数据分析与可视化：查询系统统计、趋势图表、日报报表或活跃排行。query参数: overview(总览)/trend(趋势)/report(日报)/leaderboard(排行)。',
    parameters: { type: 'object', properties: { query: { type: 'string', enum: ['overview', 'trend', 'report', 'leaderboard'], description: '查询类型' } }, required: ['query'] },
    handler: async (args) => {
      try {
        var r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8002) + '/api/bi/' + (args.query || 'overview'), { signal: AbortSignal.timeout(5000) });
        return r.ok ? await r.json() : { success: false, message: '查询失败' };
      } catch(e) { return { success: false, message: '查询失败: ' + e.message }; }
    }
  });

  // 8. exec_command - 通过 executor-tools
  tools.push({
    id: 'exec_command',
    name: 'exec_command',
    description: '在服务器上执行系统命令(安全沙箱+白名单限制:ls/dir/cat/type/git/ping/echo/ipconfig/powershell等)。不能删除文件或关机重启。',
    parameters: { type: 'object', properties: { command: { type: 'string', description: '要执行的系统命令' }, timeout: { type: 'number', description: '超时毫秒，默认30000' } }, required: ['command'] },
    handler: async (args) => {
      try {
        if (_execCEOTool) return await _execCEOTool('exec_command', args);
        var exeTools = require('./executor-tools');
        return await exeTools.execCEOTool('exec_command', args);
      } catch(e) { return { success: false, message: '执行失败: ' + e.message }; }
    }
  });

  // 9. search_web - 有 handler
  tools.push({
    id: 'search_web',
    name: 'search_web',
    description: '搜索互联网获取最新信息。当需要查询实时资讯、查找资料、搜索问题时使用此工具。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] },
    handler: async (args) => {
      try {
        var query = args.query || '';
        var searchUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&mkt=zh-CN';
        var r = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
        var html = await r.text();
        var results = [];
        var reAlgo = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
        var m;
        while ((m = reAlgo.exec(html)) !== null && results.length < 5) {
          var titleMatch = m[1].match(/<h2[^>]*>(.*?)<\/h2>/i);
          var linkMatch = m[1].match(/href="(https?:[^"]+)"/i);
          var descMatch = m[1].match(/<p[^>]*>(.*?)<\/p>/i);
          results.push({
            title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
            link: linkMatch ? linkMatch[1] : '',
            snippet: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : ''
          });
        }
        return { success: true, query: query, results: results, source: 'bing_direct' };
      } catch(e) { return { success: false, message: '搜索失败: ' + e.message }; }
    }
  });

  // 去重
  var seenNames = {};
  tools = tools.filter(function(t) {
    var key = t.name || t.id;
    if (seenNames[key]) return false;
    seenNames[key] = true;
    return true;
  });

  return tools;
}

// ===== 核心：智能体处理指令 =====
async function processInstruction(instruction, context) {
  log('INFO', '指令', instruction.substring(0,80));
  if (!running) {
    log('WARN', '指令', '自动启动');
    start();
    await new Promise(function(r){setTimeout(r,100);});
  }
  addSessionMemory('user', instruction);
  broadcast('ECompany AI助手正在处理: "' + instruction.substring(0, 60) + '..."');

  try {
    var exec = require('./agent-executor');
    
    // ★ 关键修复：构建有真实 handler 的工具列表
    var tools = buildAgentTools();

    // 构建消息列表
    var messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction }
    ];

    // 第一轮 AI 调用
    var result = await exec.callAIWithTools(messages, tools, {
      temperature: 0.7,
      maxTokens: 32768,
      timeout: 120000
    });

    var reply = '';
    if (result && result.content) {
      reply = result.content;
    }

    // 工具调用循环（最多 5 轮）
    var toolCalls = result && result.tool_calls;
    var allToolCalls = [];
    var maxRounds = 5;
    var currentRound = 0;

    while (toolCalls && toolCalls.length > 0 && currentRound < maxRounds) {
      currentRound++;
      
      // 添加 AI 回复到消息
      var asstMsg = { role: 'assistant', content: reply || '', tool_calls: toolCalls };
      if (result && result.reasoning_content) asstMsg.reasoning_content = result.reasoning_content;
      messages.push(asstMsg);

      // 执行每个工具
      for (var ti = 0; ti < toolCalls.length; ti++) {
        var tc = toolCalls[ti];
        if (tc.type !== 'function') continue;
        var funcName = tc.function.name;
        var funcArgs = {};
        try { funcArgs = JSON.parse(tc.function.arguments); } catch(e) {}

        // 在工具列表中找 handler
        var toolResult = { success: false, message: '未找到工具: ' + funcName };
        for (var ti2 = 0; ti2 < tools.length; ti2++) {
          if ((tools[ti2].name || tools[ti2].id) === funcName && typeof tools[ti2].handler === 'function') {
            try {
              toolResult = await tools[ti2].handler(funcArgs);
            } catch(handlerErr) {
              toolResult = { success: false, message: '执行失败: ' + handlerErr.message };
            }
            break;
          }
        }

        // 如果工具列表没找到，尝试 execCEOTool
        if (toolResult.success === false && toolResult.message.indexOf('未找到工具') >= 0) {
          if (typeof _execCEOTool === 'function') {
            try { toolResult = await _execCEOTool(funcName, funcArgs); }
            catch(_e2) { toolResult = { success: false, message: '执行失败: ' + _e2.message }; }
          } else {
            try {
              var exeTools = require('./executor-tools');
              toolResult = await exeTools.execCEOTool(funcName, funcArgs);
            } catch(_e3) {
              toolResult = { success: false, message: '执行失败: ' + _e3.message };
            }
          }
        }

        allToolCalls.push({ name: funcName, args: funcArgs, result: toolResult });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult)
        });
      }

      // 让 AI 基于工具结果继续推理
      result = await exec.callAIWithTools(messages, tools, {
        temperature: 0.7,
        maxTokens: 32768,
        timeout: 60000
      });

      if (result && result.content) {
        reply = result.content;
      }
      toolCalls = result && result.tool_calls;
    }

    if (!reply || reply.trim().length === 0) {
      reply = '已完成处理。共调用了 ' + allToolCalls.length + ' 个工具。';
    }
    addSessionMemory('assistant', reply);
    broadcast('💬 ' + reply.substring(0, 200));
    return { ok: true, action: 'ai_reply', reply: reply, toolCalls: allToolCalls.length };
  } catch(e) {
    log('ERROR', 'AI', e.message);
    // 降级：纯文本 AI 调用
    try {
      var exec = require('./agent-executor');
      var fallbackReply = await exec.callAI([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: instruction }
      ], { temperature: 0.7, maxTokens: 2000 });
      return { ok: true, action: 'ai_reply', reply: fallbackReply, fallback: true };
    } catch(e2) {
      return { ok: false, error: e.message };
    }
  }
}

async function processChatSSE(message, agentId, sseSend) {
  const startTime = Date.now();
  log('INFO', 'SSE', '收到聊天消息 agentId=' + agentId);

  var result;
  try {
    result = await processInstruction(message);
  } catch(e) {
    log('ERROR', 'SSE', 'processInstruction 失败: ' + e.message);
    if (typeof sseSend === 'function') sseSend({ type: 'error', content: '处理失败: ' + e.message });
    return { ok: false, error: e.message };
  }

  var reply = '';
  if (result && result.ok) {
    if (result.action === 'ai_reply' && result.reply) reply = result.reply;
    else if (result.reply) reply = result.reply;
    else if (result.data) reply = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  }
  if (!reply || reply.trim().length === 0) reply = '抱歉，处理时遇到了问题，请重试。';

  if (typeof sseSend === 'function') {
    try {
      sseSend({ type: 'tool_summary', count: result.toolCalls || 0 });
    } catch(_) {}
    for (var i = 0; i < reply.length; i += 5) {
      sseSend({ type: 'message', content: reply.substring(i, Math.min(i + 5, reply.length)) });
      await new Promise(function(r) { setTimeout(r, 15); });
    }
    sseSend({ type: 'done', reply: reply, toolCalls: result.toolCalls || 0 });
  }

  log('INFO', 'SSE', '回复完成 (' + (Date.now() - startTime) + 'ms)');
  return { ok: true, reply: reply, elapsed: Date.now() - startTime };
}

async function evolveSelf() {
  return { timestamp: new Date().toISOString(), summary: 'ECompany AI助手自我进化完成', suggestions: [] };
}

orchestratorInstance = {
  setWSServer, start, stop, getStatus, processInstruction, processChatSSE
};

module.exports = orchestratorInstance;
module.exports.setSseSendForToolCalls = setSseSendForToolCalls;
module.exports.setExecCEOTool = setExecCEOTool;
