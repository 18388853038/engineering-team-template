'use strict';
var cp = require('child_process');
var log = { debug: function(){}, info: console.log, warn: console.warn, error: console.error };
var _EXECUTOR_TOOLS = {};

function _registerExecutorTool(name, fn) {
  _EXECUTOR_TOOLS[name] = fn;
}

async function execCEOTool(name, args) {
  if (!name) return { error: 'tool name required' };
  if (_EXECUTOR_TOOLS[name]) {
    try {
      var r = await _EXECUTOR_TOOLS[name](args || {});
      return { ok: true, data: r };
    } catch(e) {
      return { error: e.message };
    }
  }
  try {
    var _tr = require('./tools-registry');
    var r = await _tr.executeTool(name, args || {});
    return { ok: true, data: r };
  } catch(e) {
    return { error: e.message };
  }
}

// === exec_command 安全沙箱实现 ===
var ALLOWED_COMMANDS = [
  'dir', 'type', 'echo', 'git', 'powershell', 'node', 'npm', 'npx',
  'ipconfig', 'systeminfo', 'netstat', 'ping', 'cd', 'set',
  'tasklist', 'taskkill', 'findstr', 'find', 'cls', 'help',
  'timeout', 'copy', 'move', 'del', 'xcopy', 'robocopy',
  'mkdir', 'md', 'rmdir', 'rd', 'ren', 'rename', 'attrib',
  'fc', 'comp', 'cscript', 'wmic', 'where', 'which',
  'path', 'ver', 'vol', 'chcp', 'color', 'date',
  'more', 'sort', 'tree', 'whoami', 'hostname'
];

// Commands that are NEVER allowed
var BLOCKED_PATTERNS = [
  /rm\s+-rf/i,
  /format\s+/i,
  /shutdown/i,
  /restart/i,
  /rd\s+\/s/i,
  /del\s+\/f.*\/s/i,
];

// Additional dangerous operations via powershell
var BLOCKED_PS_PATTERNS = [
  /Remove-Item/i,
  /Remove-ItemProperty/i,
  /Stop-Computer/i,
  /Restart-Computer/i,
  /Clear-EventLog/i,
  /Format-Volume/i,
  /Remove-VM/i,
];

function _getCommandName(cmd) {
  cmd = (cmd || '').trim();
  // Handle quoted commands
  if (cmd.startsWith('"')) {
    var endQuote = cmd.indexOf('"', 1);
    if (endQuote > 0) return cmd.substring(1, endQuote).toLowerCase();
  }
  // Get first word (command name)
  var spaceIdx = cmd.indexOf(' ');
  var firstToken = spaceIdx > 0 ? cmd.substring(0, spaceIdx) : cmd;
  // Clean up potential path prefixes
  var lastSlash = Math.max(firstToken.lastIndexOf('/'), firstToken.lastIndexOf('\\'));
  return (lastSlash >= 0 ? firstToken.substring(lastSlash + 1) : firstToken).toLowerCase();
}

function _isAllowed(cmd) {
  var cmdName = _getCommandName(cmd);
  if (!cmdName) return false;

  // Check blocked patterns first
  for (var pi = 0; pi < BLOCKED_PATTERNS.length; pi++) {
    if (BLOCKED_PATTERNS[pi].test(cmd)) return false;
  }
  if (cmdName === 'powershell' || cmdName === 'pwsh') {
    for (var ppi = 0; ppi < BLOCKED_PS_PATTERNS.length; ppi++) {
      if (BLOCKED_PS_PATTERNS[ppi].test(cmd)) return false;
    }
  }

  // Check if command is in allowed list
  for (var ai = 0; ai < ALLOWED_COMMANDS.length; ai++) {
    if (cmdName === ALLOWED_COMMANDS[ai]) return true;
  }

  // If not in list, ask for approval (will be caught by caller)
  var err = new Error('APPROVAL_REQUIRED');
  err.approval = true;
  err.originalCommand = cmd;
  throw err;
}

// Register exec_command
_registerExecutorTool('exec_command', async function(args) {
  var command = (args.command || args.cmd || '').trim();
  var timeout = args.timeout || 60000;

  if (!command) {
    return { success: false, message: '命令不能为空' };
  }

  // Check against block list
  var cmdName = _getCommandName(command);

  // Allow safe commands directly
  _isAllowed(command);

  log.info('[exec_command] 执行:', command.substring(0, 120));

  // Execute
  return new Promise(function(resolve) {
    var result = { success: true, command: command, stdout: '', stderr: '', exitCode: -1 };
    var child;
    try {
      child = cp.exec(command, {
        cwd: 'F:\\eCompany-Dev',
        timeout: timeout,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      }, function(err, stdout, stderr) {
        result.stdout = (stdout || '').substring(0, 50000);
        result.stderr = (stderr || '').substring(0, 10000);
        result.exitCode = err ? (err.code || err.status || -1) : 0;
        if (err && result.exitCode !== 0 && !result.stderr) {
          result.stderr = err.message;
        }
        resolve(result);
      });
    } catch(e) {
      result.success = false;
      result.message = '执行异常: ' + e.message;
      result.exitCode = -1;
      resolve(result);
    }
  });
});

// Register other executor tools (no-ops that route via system-orchestrator)
var OTHER_TOOLS = ['sessions_spawn', 'sessions_list', 'sessions_kill', 'delete_file',
  'move_file', 'rename_file', 'create_task', 'memory_save', 'memory_search',
  'desktop_control', 'tool_install', 'tool_uninstall', 'execute_openclaw_skill'];

OTHER_TOOLS.forEach(function(toolName) {
  _registerExecutorTool(toolName, async function(args) {
    // Route to system-orchestrator for these
    try {
      var orchestrator = require('./system-orchestrator');
      if (orchestrator && orchestrator.executeTool) {
        return await orchestrator.executeTool(toolName, args);
      }
    } catch(e) {}
    return { success: false, message: toolName + ' 工具未实现（通过 system-orchestrator）' };
  });
});

module.exports = { _EXECUTOR_TOOLS: _EXECUTOR_TOOLS, execCEOTool: execCEOTool, _registerExecutorTool: _registerExecutorTool };
