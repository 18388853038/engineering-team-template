/**
 * eCompany 安全沙箱模块
 * 
 * 能力注入：安全代码执行隔离，支持 Docker 沙箱和进程沙箱
 * 让 eCompany 拥有 OpenClaw 的沙箱安全执行能力
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SANDBOX_DIR = path.join(__dirname, '..', 'sandbox');

// ========== 1. 进程沙箱 ==========
// 在独立进程中执行代码，带超时和资源限制

class ProcessSandbox {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.maxMemory = options.maxMemory || 256; // MB
    this.workDir = path.join(SANDBOX_DIR, 'runs');
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  /**
   * 在沙箱中执行代码
   * @param {string} code - 要执行的代码
   * @param {string} language - js | python | shell
   * @param {object} options - { args, env, timeout }
   * @returns {object} { stdout, stderr, exitCode, duration }
   */
  async execute(code, language = 'js', options = {}) {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const runDir = path.join(this.workDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const timeout = options.timeout || this.timeout;
    const startTime = Date.now();

    try {
      let command, args, filePath;

      switch (language) {
        case 'js':
        case 'javascript':
          filePath = path.join(runDir, 'script.js');
          fs.writeFileSync(filePath, code, 'utf-8');
          command = process.execPath; // node
          args = [filePath];
          break;

        case 'python':
          filePath = path.join(runDir, 'script.py');
          fs.writeFileSync(filePath, code, 'utf-8');
          command = 'python3';
          args = [filePath];
          break;

        case 'shell':
        case 'bash':
          filePath = path.join(runDir, 'script.sh');
          fs.writeFileSync(filePath, code, 'utf-8');
          command = 'bash';
          args = [filePath];
          break;

        default:
          throw new Error(`不支持的语言: ${language}`);
      }

      // 添加额外参数
      if (options.args) args = args.concat(options.args);

      // 在沙箱进程中执行（使用安全环境变量，确保 PATH 可用）
      const result = await this._spawnWithTimeout(command, args, {
        cwd: runDir,
        env: this._getSafeEnv(options.env),
        timeout,
        maxBuffer: 1024 * 1024 // 1MB 输出限制
      });

      return {
        ...result,
        duration: Date.now() - startTime,
        sandboxId: runId
      };

    } catch (err) {
      return {
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        duration: Date.now() - startTime,
        sandboxId: runId,
        error: err.message
      };
    } finally {
      // 清理临时文件
      // 注意：_spawnWithTimeout 已保证进程结束/超时后才 resolve
      try { if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true, force: true }); } catch(e) {}
    }
  }

  /**
   * 创建安全的环境变量副本，仅保留必要变量，过滤敏感信息
   * 防止 API Keys、Tokens、Secrets 等敏感信息泄露到子进程
   */
  _getSafeEnv(extraEnv = {}) {
    // 允许传递给子进程的安全环境变量白名单
    const SAFE_VARS = ['PATH', 'HOME', 'TEMP', 'TMP', 'TMPDIR', 'USER', 'USERNAME', 'LANG', 'LC_ALL', 'SHELL', 'TERM', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT'];
    // 需要过滤的敏感变量名关键词（忽略大小写）
    const SENSITIVE_PATTERNS = ['API_KEY', 'APIKEY', 'TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'CREDENTIAL', 'PRIVATE_KEY', 'ACCESS_KEY', 'AUTH'];

    const safeEnv = {};
    // 只保留白名单中的变量
    for (const key of SAFE_VARS) {
      if (process.env[key] !== undefined) {
        safeEnv[key] = process.env[key];
      }
    }
    // 合并调用方传入的额外环境变量
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value !== undefined && value !== null) {
        safeEnv[key] = String(value);
      }
    }
    return safeEnv;
  }

  _spawnWithTimeout(command, args, options) {
    return new Promise((resolve) => {
      var safeEnv = options.env ? this._getSafeEnv(options.env) : this._getSafeEnv({});
      const child = spawn(command, args, {
        cwd: options.cwd,
        // 使用安全环境变量副本，不泄露 API Keys、Tokens、Secrets 等敏感信息
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '', stderr = '', resolved = false;

      // 关闭 stdin，防止进程挂起等待输入
      child.stdin.end();

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { child.kill(); } catch(e) {}
          // Windows fallback: use taskkill to force kill
          try { require('child_process').execSync('taskkill /F /PID ' + child.pid + ' 2>nul', { windowsHide: true }); } catch(e) {}
          resolve({ stdout, stderr, exitCode: -2, error: '执行超时' });
        }
      }, options.timeout || 30000);

      child.stdout.on('data', data => { stdout += data.toString('utf8'); });
      child.stderr.on('data', data => { stderr += data.toString('utf8'); });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code });
        }
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: -1, error: err.message });
        }
      });
    });
  }
}

// ========== 2. 文件沙箱 ==========
// 在隔离目录中操作文件

class FileSandbox {
  constructor() {
    this.baseDir = path.join(SANDBOX_DIR, 'files');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /** 在沙箱中安全读取文件 */
  readFile(filename) {
    const safePath = this._resolveSafe(filename);
    if (!safePath) throw new Error('文件路径越界');
    return fs.readFileSync(safePath, 'utf-8');
  }

  /** 在沙箱中安全写入文件 */
  writeFile(filename, content) {
    const safePath = this._resolveSafe(filename);
    if (!safePath) throw new Error('文件路径越界');
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(safePath, content, 'utf-8');
  }

  /** 在沙箱中列出文件 */
  listFiles(subdir = '') {
    const safePath = this._resolveSafe(subdir);
    if (!safePath) throw new Error('路径越界');
    if (!fs.existsSync(safePath)) return [];
    return fs.readdirSync(safePath);
  }

  /** 确保路径不越界 */
  _resolveSafe(filename) {
    const resolved = path.resolve(this.baseDir, filename);
    if (!resolved.startsWith(this.baseDir)) return null;
    return resolved;
  }

  /** 清理沙箱文件 */
  cleanup() {
    try { fs.rmSync(this.baseDir, { recursive: true, force: true }); fs.mkdirSync(this.baseDir); } catch(e) {}
  }
}

// ========== 3. Docker 沙箱 ==========
// 基于 Docker 容器的安全代码执行沙箱
// 使用 --read-only --network none 严格控制

const DOCKER_SANDBOX_DIR = path.join(SANDBOX_DIR, 'docker');

class DockerSandbox {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.maxMemory = options.maxMemory || '256m';
    this.maxCpus = options.maxCpus || '0.5';
    this.available = this._checkDocker();
    // 沙箱工作目录
    if (!fs.existsSync(DOCKER_SANDBOX_DIR)) {
      fs.mkdirSync(DOCKER_SANDBOX_DIR, { recursive: true });
    }
  }

  _checkDocker() {
    try {
      execSync('docker --version', { stdio: 'pipe', windowsHide: true, timeout: 5000 });
      return true;
    } catch(e) {
      return false;
    }
  }

  /**
   * 在 Docker 容器中安全执行代码
   * @param {string} code - 要执行的代码
   * @param {string} language - js | py | sh
   * @param {object} options - { timeout, memory, cpus }
   * @returns {object} { stdout, stderr, exitCode, duration, containerId }
   */
  async execute(code, language = 'js', options = {}) {
    if (!this.available) {
      console.log('[DockerSandbox] Docker 不可用，回退到进程沙箱');
      const sandbox = new ProcessSandbox(options);
      return await sandbox.execute(code, language, options);
    }

    const runId = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const runDir = path.join(DOCKER_SANDBOX_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const timeout = (options.timeout || this.timeout);
    const memory = options.memory || this.maxMemory;
    const cpus = options.cpus || this.maxCpus;
    const startTime = Date.now();

    try {
      // 1. 选择镜像和写入代码文件
      let image, entrypoint, fileName, cmdPrefix;
      switch (language) {
        case 'js':
        case 'javascript':
          image = 'node:20-alpine';
          fileName = 'script.js';
          cmdPrefix = ['node', '/code/script.js'];
          break;
        case 'py':
        case 'python':
          image = 'python:3.12-alpine';
          fileName = 'script.py';
          cmdPrefix = ['python', '/code/script.py'];
          break;
        case 'sh':
        case 'shell':
        case 'bash':
          image = 'alpine:latest';
          fileName = 'script.sh';
          cmdPrefix = ['sh', '/code/script.sh'];
          break;
        default:
          throw new Error('不支持的语言: ' + language);
      }

      // 2. 写入代码文件
      fs.writeFileSync(path.join(runDir, fileName), code, 'utf-8');

      // 3. 确保镜像存在（拉取超时 60s）
      try {
        execSync('docker pull ' + image + ' --quiet', { stdio: 'pipe', timeout: 60000, windowsHide: true });
      } catch(e) {
        throw new Error('拉取镜像失败: ' + image + ' - ' + e.message);
      }

      // 4. 创建并运行容器
      const containerName = runId;
      const dockerArgs = [
        'run',
        '--rm',
        '--name', containerName,
        '--read-only',                    // 只读文件系统
        '--network', 'none',              // 无网络
        '--memory', memory,               // 内存上限
        '--cpus', cpus,                   // CPU 上限
        '--pids-limit', '50',             // 进程数上限
        '--security-opt', 'no-new-privileges:true',
        '--cap-drop', 'ALL',              // 移除所有 Capability
        '-v', runDir + ':/code:ro',       // 挂载代码（只读）
        '-w', '/code',
        image
      ].concat(cmdPrefix);

      const result = await this._runDocker(dockerArgs, { timeout, cwd: runDir });

      // 5. 如果容器被杀（超时），提示
      if (result.exitCode === 137) {
        result.stderr += '\n[Sandbox] 容器执行超时 (timeout: ' + timeout + 'ms)';
      }

      // 6. 清理容器（保险）
      try {
        execSync('docker rm -f ' + containerName + ' 2>nul', { stdio: 'pipe', windowsHide: true });
      } catch(e) {}

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
        sandboxId: runId,
        container: containerName,
        memory: memory,
        cpus: cpus,
        network: 'none'
      };

    } catch (err) {
      return {
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        duration: Date.now() - startTime,
        sandboxId: runId,
        error: err.message
      };
    } finally {
      // 清理临时目录
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch(e) {}
    }
  }

  /**
   * 在 Docker 容器中执行 shell 命令
   * @param {string} command - 要在已有镜像中执行的命令
   * @param {string} image - Docker 镜像名（默认 alpine:latest）
   * @returns {object} { stdout, stderr, exitCode }
   */
  async execCommand(command, image = 'alpine:latest', options = {}) {
    const timeout = options.timeout || 15000;
    const containerName = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      const result = await this._runDocker([
        'run', '--rm', '--name', containerName,
        '--read-only', '--network', 'none',
        '--memory', '128m', '--cpus', '0.25',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true',
        image, 'sh', '-c', command
      ], { timeout });

      try { execSync('docker rm -f ' + containerName + ' 2>nul', { stdio: 'pipe', windowsHide: true }); } catch(e) {}
      return result;
    } catch(e) {
      return { stdout: '', stderr: e.message, exitCode: -1 };
    }
  }

  /** 获取 Docker 沙箱状态 */
  getStatus() {
    if (!this.available) {
      return { available: false, reason: 'Docker 未安装或未运行' };
    }
    try {
      var info = { available: true };
      var dv = execSync('docker version --format "{{.Server.Version}}"', { stdio: 'pipe', windowsHide: true }).toString().trim();
      info.version = dv;
      return info;
    } catch(e) {
      return { available: false, reason: 'Docker 引擎未响应' };
    }
  }

  _runDocker(args, options) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: options.cwd,
        timeout: options.timeout || 30000,
        windowsHide: true
      });

      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ stdout, stderr, exitCode: -2, duration: Date.now() - startTime, error: '执行超时' });
      }, options.timeout || 30000);

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code, duration: Date.now() - startTime });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: -1, duration: Date.now() - startTime, error: err.message });
      });
    });
  }
}

// ========== 导出 ==========

module.exports = {
  ProcessSandbox,
  FileSandbox,
  DockerSandbox,
  sandboxDir: SANDBOX_DIR
};
