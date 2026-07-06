/**
 * sandbox-config.js — 沙箱安全配置规则
 *
 * 强制所有外部代码走沙箱，防止不受信任的脚本直接执行。
 *
 * 规则体系：
 *   1. 代码执行 → 必须走沙箱（ProcessSandbox / DockerSandbox）
 *   2. 脚本运行 → 自动加 sandbox-run 前缀标记
 *   3. 命令执行 → 白名单 + 超时保护
 *   4. 文件操作 → 路径越界检查
 *
 * 沙箱安全等级：
 *   high   — Docker 隔离（无网络、只读文件系统、内存限制）
 *   medium — 进程隔离（子进程、超时、输出限制）
 *   low    — 仅语法检查（只适合读已有代码）
 */

const path = require('path');
const fs = require('fs');

// ============================================================
// 1. 沙箱运行标记
// ============================================================

// 所有沙箱运行的唯一前缀标识
// 在执行任何外部代码时，日志中自动附带此前缀，方便审计
const SANDBOX_RUN_PREFIX = '[sandbox-run]';

function mark(msg) {
  return SANDBOX_RUN_PREFIX + ' ' + msg;
}

// ============================================================
// 2. 执行模式定义
// ============================================================

const EXECUTION_MODES = {
  // 最高安全：Docker 容器隔离
  DOCKER: {
    level: 'high',
    label: 'Docker 沙箱',
    description: '在 Docker 容器中隔离执行，无网络访问，只读文件系统',
    constraints: {
      network: 'none',
      readOnly: true,
      memory: '256m',
      cpus: '0.5',
      pidsLimit: 50,
      dropCapabilities: 'ALL',
      noNewPrivileges: true
    }
  },
  // 中等安全：独立子进程 + 超时
  PROCESS: {
    level: 'medium',
    label: '进程沙箱',
    description: '在独立 Node.js 子进程中执行，带超时和输出限制',
    constraints: {
      timeout: 30000,
      maxMemory: 256,
      maxOutputBytes: 1048576,  // 1MB
      safeEnvOnly: true
    }
  },
  // 最低安全：仅语法检查，不执行
  SYNTAX_CHECK: {
    level: 'low',
    label: '语法检查',
    description: '仅对代码做语法检查（node --check），不实际执行',
    constraints: {
      noExecution: true
    }
  }
};

// ============================================================
// 3. 代码类型 → 沙箱模式映射
// ============================================================

const CODE_TYPE_MAP = {
  // 用户提交的任意代码 → Docker 沙箱
  user_code: {
    mode: 'DOCKER',
    description: '用户提交的任意代码，最高安全隔离'
  },
  // SKILL.md handler → 进程沙箱（信任但隔离）
  skill_handler: {
    mode: 'PROCESS',
    description: '技能处理器执行，进程级隔离'
  },
  // commands.js 命令 → 进程沙箱
  skill_command: {
    mode: 'PROCESS',
    description: '技能命令执行，进程级隔离'
  },
  // Python handler → 进程沙箱
  python_handler: {
    mode: 'PROCESS',
    description: 'Python 技能执行，进程级隔离'
  },
  // 健康检查语法验证 → 最低安全
  syntax_check: {
    mode: 'SYNTAX_CHECK',
    description: '语法检查，不执行代码'
  },
  // Git 操作 → 白名单直连（非外部代码）
  git_operation: {
    mode: null,
    description: 'Git 版本控制操作，白名单直连'
  },
  // 系统检测 → 白名单直连
  system_check: {
    mode: null,
    description: '系统环境检测命令，白名单直连'
  }
};

// ============================================================
// 4. 命令白名单（直接执行，不经沙箱）
// ============================================================

// 允许直接执行的命令清单（沙箱外）
const COMMAND_WHITELIST = [
  // Git 操作
  /^git\s+-C\s+/,
  /^git\s+--version/,
  // Docker 操作（沙箱管理需要）
  /^docker\s+(pull|run|rm|version)/,
  // 系统检查
  /^python\s+--version/,
  /^python3\s+--version/,
  /^node\s+--version/,
  /^where\s+/,
  /^which\s+/,
  // 语法检查（只读，不执行）
  /^node\s+--check\s+/,
  // 网络检查
  /^netstat\s+/,
  /^taskkill\s+/,
];

/**
 * 检查命令是否在白名单中
 * @param {string} cmd - 要检查的命令
 * @returns {boolean} 是否命中白名单
 */
function isWhitelisted(cmd) {
  const trimmed = cmd.trim();
  for (const pattern of COMMAND_WHITELIST) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// ============================================================
// 5. 安全执行包装器
// ============================================================

/**
 * 安全执行函数 — 非白名单命令自动标记 sandbox-run 并走沙箱
 *
 * @param {string} codeOrCommand - 要执行的代码或命令
 * @param {string} codeType - 代码类型（参考 CODE_TYPE_MAP）
 * @param {object} options - 执行选项
 * @returns {Promise<object>} 执行结果
 */
async function safeExecute(codeOrCommand, codeType, options = {}) {
  const typeConfig = CODE_TYPE_MAP[codeType] || CODE_TYPE_MAP.user_code;
  const mode = typeConfig.mode;
  
  if (!mode) {
    // 白名单命令，直接执行
    console.log('[sandbox] ⚡ 直连执行:', codeOrCommand.substring(0, 80));
    return null; // 调用方自行执行
  }

  const modeConfig = EXECUTION_MODES[mode];
  console.log(mark('🏗️ [' + modeConfig.label + '] ' + codeType + ': ' + codeOrCommand.substring(0, 80)));

  switch (mode) {
    case 'DOCKER':
      return await executeInDocker(codeOrCommand, codeType, options);
    case 'PROCESS':
      return await executeInProcess(codeOrCommand, codeType, options);
    case 'SYNTAX_CHECK':
      return await executeSyntaxCheck(codeOrCommand, options);
    default:
      return { error: '未知沙箱模式: ' + mode };
  }
}

// ============================================================
// 6. 各安全模式实现
// ============================================================

async function executeInDocker(codeOrCommand, codeType, options) {
  const { ProcessSandbox, DockerSandbox } = require('./sandbox');
  const dockerSandbox = new DockerSandbox({
    timeout: options.timeout || 30000
  });

  const result = await dockerSandbox.execute(codeOrCommand, options.language || 'js', options);
  
  console.log(mark('✅ [Docker] exit=' + result.exitCode + ' duration=' + result.duration + 'ms'));
  console.log(mark('📄 [Docker] stdout=' + (result.stdout || '').substring(0, 200)));
  
  return result;
}

async function executeInProcess(codeOrCommand, codeType, options) {
  const { ProcessSandbox } = require('./sandbox');
  const processSandbox = new ProcessSandbox({
    timeout: options.timeout || 30000,
    maxMemory: options.maxMemory || 256
  });

  const language = options.language || 
    (codeType === 'python_handler' ? 'python' : 
     codeType === 'skill_command' ? 'shell' : 'js');

  const result = await processSandbox.execute(codeOrCommand, language, options);
  
  console.log(mark('✅ [Process] exit=' + result.exitCode + ' duration=' + result.duration + 'ms'));
  console.log(mark('📄 [Process] stdout=' + (result.stdout || '').substring(0, 200)));
  
  return result;
}

async function executeSyntaxCheck(codeOrCommand, options) {
  const { execSync } = require('child_process');
  try {
    execSync('node --check "' + codeOrCommand.replace(/"/g, '\\"') + '"', {
      timeout: 5000,
      stdio: 'pipe',
      windowsHide: true
    });
    return { exitCode: 0, stdout: '', stderr: '', syntax: 'ok' };
  } catch(e) {
    return { exitCode: 1, stdout: '', stderr: e.message, syntax: 'error' };
  }
}

// ============================================================
// 7. 审计日志
// ============================================================

/**
 * 记录沙箱执行审计日志
 */
function auditLog(action, details) {
  const logPath = path.join(__dirname, '..', 'data', 'sandbox-audit.log');
  const entry = {
    time: new Date().toISOString(),
    action: SANDBOX_RUN_PREFIX + ' ' + action,
    details: details
  };
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch(e) {
    // Silent fail — don't crash for audit
  }
}

// ============================================================
// 8. 导出
// ============================================================

module.exports = {
  SANDBOX_RUN_PREFIX,
  mark,
  EXECUTION_MODES,
  CODE_TYPE_MAP,
  COMMAND_WHITELIST,
  isWhitelisted,
  safeExecute,
  auditLog,
  
  // Convenience for checking before calling execSync/spawn directly
  ensureSandbox(codeOrCommand, codeType, options) {
    const typeConfig = CODE_TYPE_MAP[codeType] || CODE_TYPE_MAP.user_code;
    if (typeConfig.mode === null) {
      // Whitelisted or direct — allowed
      return { allowed: true, sandbox: false };
    }
    // Must go through sandbox
    return { allowed: false, sandbox: true, requiredMode: typeConfig.mode };
  }
};
