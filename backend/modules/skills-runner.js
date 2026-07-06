/**
 * eCompany Skills Runner v1.0
 * 
 * 技能执行沙箱 — 将SKILL.md说明变为可执行代码
 * 
 * 支持格式:
 *   skills/[name]/SKILL.md    — 说明文档(必须)
 *   skills/[name]/handler.js  — Node.js处理函数(可选)
 *   skills/[name]/handler.py  — Python处理函数(可选)
 *   skills/[name]/commands.js  — 命令定义(可选)
 * 
 * 注册机制: 
 *   扫描 skills/ 目录 → 加载 handler → 注册为HTTP端点 + CEO_TOOLS
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const sandboxConfig = require('./sandbox-config.js');
const BASE = path.join(__dirname, '..');
const SKILLS_DIR = path.join(BASE, 'skills-runner');

// ========== 技能扫描器 ==========

class SkillScanner {
  constructor() {
    this.skills = new Map();
  }

  scanAll() {
    this.skills.clear();
    const dirs = [
      SKILLS_DIR,
      path.join(require('os').homedir(), '.openclaw', 'workspace', 'skills'),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills')
    ];

    dirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        this.scanDir(dir);
      }
    });

    return this.skills;
  }

  scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.forEach(entry => {
        if (entry.isDirectory()) {
          const skillDir = path.join(dir, entry.name);
          const skill = this.loadSkill(entry.name, skillDir);
          if (skill) {
            // Don't overwrite existing skill with handler by one without
            var existing = this.skills.get(entry.name);
            if (!existing || (!existing.handler && skill.handler) || (!existing.hasHandlerJs && skill.hasHandlerJs)) {
              this.skills.set(entry.name, skill);
            }
          }
        }
      });
    } catch(e) {
      console.log('[SkillsRunner] Scan error:', dir, e.message);
    }
  }

  loadSkill(name, dir) {
    const skMd = path.join(dir, 'SKILL.md');
    const handlerJs = path.join(dir, 'handler.js');
    const handlerPy = path.join(dir, 'handler.py');
    const cmdsJs = path.join(dir, 'commands.js');
    const pkgJson = path.join(dir, 'package.json');

    if (!fs.existsSync(skMd)) return null;

    const skill = {
      name,
      dir,
      dirname: dir,
      skMd: fs.readFileSync(skMd, 'utf-8'),
      hasHandlerJs: fs.existsSync(handlerJs),
      hasHandlerPy: fs.existsSync(handlerPy),
      hasCommands: fs.existsSync(cmdsJs),
      hasPackage: fs.existsSync(pkgJson),
      handler: null,
      description: this.extractDescription(skMd)
    };

    // Load Node.js handler
    if (skill.hasHandlerJs) {
      try {
        delete require.cache[require.resolve(handlerJs)]; skill.handler = require(handlerJs);
        console.log('[SkillsRunner] Loaded JS handler:', name);
      } catch(e) {
        console.log('[SkillsRunner] JS handler load error:', name, e.message);
      }
    }

    return skill;
  }

  extractDescription(skMdPath) {
    try {
      const content = fs.readFileSync(skMdPath, 'utf-8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const descMatch = match[1].match(/description:\s*"?([^"\n]+)"?/);
        if (descMatch) return descMatch[1].trim();
      }
      const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('---'));
      return firstLine ? firstLine.replace(/^#\s*/, '').trim() : name;
    } catch(e) {
      return name;
    }
  }
}

// ========== 技能执行器 ==========

class SkillExecutor {
  constructor(scanner) {
    this.scanner = scanner;
    this.processes = new Map();
  }

  async execute(name, args = {}) {
    const skill = this.scanner.skills.get(name);
    if (!skill) throw new Error('技能未找到: ' + name);

    // Priority 1: Native handler (always check disk, no restart needed)
    var _fsMod = require('fs');
    var _pathMod = require('path');
    if (_fsMod.existsSync(_pathMod.join(skill.dir, 'handler.js'))) {
      try {
        delete require.cache[require.resolve(path.join(skill.dir, 'handler.js'))];
        var freshHandler = require(path.join(skill.dir, 'handler.js'));
        if (typeof freshHandler === 'function') {
          return await freshHandler(args);
        }
        if (freshHandler.handler && typeof freshHandler.handler === 'function') {
          return await freshHandler.handler(args);
        }
      } catch(e) {
        return { type: 'error', message: 'Handler error: ' + e.message };
      }
    }

    // Priority 2: Commands
    if (skill.hasCommands) {
      return await this.runCommands(name, args);
    }

    // Priority 3: Python handler
    if (skill.hasHandlerPy) {
      return await this.runPython(name, args);
    }

    // Fallback: try skill-proxy bridge (execute via OpenClaw skill system)
    try {
      var _proxy = require('./skill-proxy');
      var _proxyResult = await _proxy.executeSkill(name, args);
      if (_proxyResult && (_proxyResult.content || _proxyResult.error)) {
        return {
          type: 'skill_proxy',
          skill: name,
          content: _proxyResult.content || _proxyResult.error,
          source: 'openclaw',
          note: '已通过OpenClaw技能代理执行'
        };
      }
    } catch(_pe) { /* proxy unavailable */ }

    // Final fallback: Return SKILL.md content as instructions
    return {
      type: 'instructions',
      content: skill.skMd,
      note: '此技能无可执行处理函数，已返回说明文档供AI参考'
    };
  }

  async runCommands(name, args) {
    const skill = this.scanner.skills.get(name);
    const cmds = require(path.join(skill.dir, 'commands.js'));
    const results = [];

    if (Array.isArray(cmds)) {
      for (const cmd of cmds) {
        // 沙箱规则：检查是否白名单，否则走沙箱
        if (sandboxConfig.isWhitelisted(cmd)) {
          // 白名单命令直连执行
          try {
            const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000, windowsHide: true });
            console.log(sandboxConfig.mark('⚡ whitelist cmd: ' + cmd.substring(0, 60)));
            results.push({ command: cmd.substring(0, 60), output: out.substring(0, 500) });
          } catch(e) {
            results.push({ command: cmd.substring(0, 60), error: e.message });
          }
        } else {
          // 非白名单命令：进进程沙箱
          console.log(sandboxConfig.mark('🏗️ [Process] skill_command: ' + cmd.substring(0, 60)));
          try {
            const { ProcessSandbox } = require('./sandbox/index.js');
            const ps = new ProcessSandbox({ timeout: 10000 });
            const sandboxResult = await ps.execute(cmd, 'shell', { timeout: 10000 });
            console.log(sandboxConfig.mark('✅ [Process] cmd exit=' + sandboxResult.exitCode));
            sandboxConfig.auditLog('skill_command', { name, cmd: cmd.substring(0, 100), exit: sandboxResult.exitCode });
            results.push({
              command: cmd.substring(0, 60),
              output: (sandboxResult.stdout || '').substring(0, 500),
              sandboxed: true
            });
          } catch(e) {
            results.push({ command: cmd.substring(0, 60), error: e.message, sandboxed: true });
          }
        }
      }
    } else if (cmds.run && typeof cmds.run === 'function') {
      const result = await cmds.run(args);
      results.push(result);
    }

    return { type: 'commands', results, sandboxed: true };
  }

  async runPython(name, args) {
    const skill = this.scanner.skills.get(name);
    const pyPath = path.join(skill.dir, 'handler.py');
    const code = fs.readFileSync(pyPath, 'utf-8');
    
    // Python handler 进进程沙箱
    console.log(sandboxConfig.mark('🏗️ [Process] python_handler: ' + name));
    try {
      const { ProcessSandbox } = require('./sandbox/index.js');
      const ps = new ProcessSandbox({ timeout: 15000 });
      sandboxConfig.auditLog('python_handler', { name });
      const result = await ps.execute(code, 'python', { timeout: 15000, args: [JSON.stringify(args)] });
      console.log(sandboxConfig.mark('✅ [Process] python exit=' + result.exitCode + ' duration=' + result.duration + 'ms'));
      if (result.exitCode === 0) {
        try { return JSON.parse(result.stdout); } catch(e) { return { output: result.stdout }; }
      } else {
        return { error: result.stderr, code: result.exitCode, sandboxed: true };
      }
    } catch(e) {
      return { error: e.message, sandboxed: true };
    }
  }

  list() {
    const result = [];
    this.scanner.skills.forEach((skill, name) => {
      result.push({
        name,
        description: skill.description,
        hasHandler: !!(skill.handler),
        hasPython: skill.hasHandlerPy,
        hasCommands: skill.hasCommands,
        type: skill.handler ? 'executable' : skill.hasHandlerPy ? 'python' : 'documentation'
      });
    });
    return result;
  }

  getDetail(name) {
    const skill = this.scanner.skills.get(name);
    if (!skill) return null;
    return {
      name: skill.name,
      description: skill.description,
      dir: skill.dir,
      hasHandler: !!skill.handler,
      hasPython: skill.hasHandlerPy,
      type: skill.handler ? 'executable' : 'documentation',
      skMd: skill.skMd.substring(0, 500)
    };
  }
}

// ========== 技能安装器 ==========

class SkillInstaller {
  constructor(scanner) {
    this.scanner = scanner;
  }

  /**
   * 从OpenClaw社区技能目录拉取真实技能包
   * 兼容 skills.sh / GitHub 生态
   */
  async install(name) {
    const targetDir = path.join(SKILLS_DIR, name);

    if (fs.existsSync(targetDir)) {
      return { ok: false, error: '技能已存在: ' + name };
    }

    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }

    // Try to copy from OpenClaw bundled skills if available
    const ocDir = path.join(
      process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills', name
    );
    const wsDir = path.join(
      require('os').homedir(), '.openclaw', 'workspace', 'skills', name
    );

    let sourceDir = null;
    if (fs.existsSync(ocDir)) sourceDir = ocDir;
    else if (fs.existsSync(wsDir)) sourceDir = wsDir;

    if (sourceDir) {
      // Copy the skill to the runner directory and generate handler stub
      this.copyDir(sourceDir, targetDir);
      this.generateHandlerStub(name, targetDir);
      return { ok: true, source: 'local', message: '已从本地安装:' + name };
    }

    // Create stub with handler template
    fs.mkdirSync(targetDir, { recursive: true });
    this.generateHandlerStub(name, targetDir);
    this.generateSkMd(name, targetDir);

    return { ok: true, source: 'stub', message: '已创建技能骨架:' + name };
  }

  copyDir(src, dst) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    entries.forEach(entry => {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) this.copyDir(s, d);
      else fs.copyFileSync(s, d);
    });
  }

  generateHandlerStub(name, dir) {
    const handlerPath = path.join(dir, 'handler.js');
    if (fs.existsSync(handlerPath)) return;

    const stub = `/**
 * ${name} — 技能处理函数
 * 
 * 自动生成的handler骨架。替换此文件以实现真实逻辑。
 * 
 * @param {object} args - 调用参数
 * @returns {Promise<object>} 返回结果
 */
module.exports = async function handler(args) {
  // TODO(2026-06-19): 实现技能逻辑——当 CEO 调用技能时的实际执行入口，目前占位
  return {
    type: 'result',
    message: '${name} 技能已就绪（待实现）',
    args: args
  };
};
`;
    fs.writeFileSync(handlerPath, stub, 'utf-8');
    console.log('[SkillsRunner] Generated handler stub:', name);
  }

  generateSkMd(name, dir) {
    const skMdPath = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skMdPath)) return;

    const content = `---
name: ${name}
description: ${name} - 自动生成的技能骨架
---

# ${name}

此技能由Skills Runner自动创建。

## 使用方式

通过CEO对话自然语言触发。

## 实现

handler.js 包含处理函数，替换为真实逻辑后即可执行。
`;
    fs.writeFileSync(skMdPath, content, 'utf-8');
  }

  uninstall(name) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(targetDir)) {
      return { ok: false, error: '技能未找到: ' + name };
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    return { ok: true, message: '已卸载: ' + name };
  }

  list() {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    return fs.readdirSync(SKILLS_DIR).filter(f => {
      const fp = path.join(SKILLS_DIR, f);
      return fs.statSync(fp).isDirectory() && fs.existsSync(path.join(fp, 'SKILL.md'));
    });
  }
}

// ========== 注册路由 ==========

function registerRunnerRoutes(registerRoute, parseBody, json) {
  const scanner = new SkillScanner();
  const executor = new SkillExecutor(scanner);
  const installer = new SkillInstaller(scanner);

  // Initial scan
  scanner.scanAll();

  // List all skills
  registerRoute(['GET'], /^\/api\/runner\/skills$/, (req, res) => {
    scanner.scanAll();
    json(res, { ok: true, skills: executor.list() });
  });

  // Get skill detail
  registerRoute(['GET'], /^\/api\/runner\/skills\/([^/]+)$/, (req, res, m) => {
    const skill = executor.getDetail(m[1]);
    if (!skill) { json(res, { error: '未找到' }, 404); return; }
    json(res, { ok: true, skill });
  });

  // Execute skill
  registerRoute(['POST'], /^\/api\/runner\/skills\/([^/]+)\/run$/, async (req, res, m) => {
    try {
      const body = await parseBody(req);
      const result = await executor.execute(m[1], body.args || {});
      json(res, { ok: true, name: m[1], ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // Install skill
  registerRoute(['POST'], /^\/api\/runner\/install$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const result = await installer.install(body.name);
      scanner.scanAll();
      json(res, { ok: result.ok, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // Uninstall skill
  registerRoute(['DELETE'], /^\/api\/runner\/skills\/([^/]+)$/, (req, res, m) => {
    const result = installer.uninstall(m[1]);
    scanner.scanAll();
    json(res, { ok: result.ok, ...result });
  });

  // Skill runner status
  registerRoute(['GET'], /^\/api\/runner\/status$/, (req, res) => {
    json(res, {
      ok: true,
      runnerDir: SKILLS_DIR,
      total: scanner.skills.size,
      executable: Array.from(scanner.skills.values()).filter(s => s.handler).length
    });
  });
}

module.exports = {
  SkillScanner, SkillExecutor, SkillInstaller,
  registerRunnerRoutes
};
