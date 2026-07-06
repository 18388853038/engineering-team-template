/**
 * Skill Importer — 从 SKILL.md 生成可执行 handler.js
 * 
 * 读取 OpenClaw 社区技能的说明文档,
 * 提取命令示例, 自动生成可执行的 handler.js
 * 
 * 命令类型检测:
 * - curl / fetch → HTTP调用
 * - node / js → JavaScript执行
 * - python → Python执行
 * - docker / git / aws → Shell命令
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILLS_RUNNER = path.join(__dirname, '..', 'skills-runner');

class SkillImporter {
  constructor(scanner) {
    this.scanner = scanner;
  }

  /**
   * 从 SKILL.md 生成 handler.js
   */
  importFromSkMd(name) {
    const skill = this.findSkillSource(name);
    if (!skill) return { ok: false, error: '技能未找到: ' + name };

    const targetDir = path.join(SKILLS_RUNNER, name);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy SKILL.md
    fs.copyFileSync(path.join(skill.dir, 'SKILL.md'), path.join(targetDir, 'SKILL.md'));

    // Generate handler.js
    const handlerCode = this.generateHandler(name, skill.skMd);
    fs.writeFileSync(path.join(targetDir, 'handler.js'), handlerCode, 'utf-8');

    return {
      ok: true,
      name,
      type: this.detectType(skill.skMd),
      handlerSize: handlerCode.length,
      message: '已生成 handler.js'
    };
  }

  /**
   * 查找技能来源 (优先已安装的)
   */
  findSkillSource(name) {
    const dirs = [
      path.join(SKILLS_RUNNER, name),
      path.join(require('os').homedir(), '.openclaw', 'workspace', 'skills', name),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills', name)
    ];

    for (const dir of dirs) {
      const skMd = path.join(dir, 'SKILL.md');
      if (fs.existsSync(skMd)) {
        return { dir, skMd: fs.readFileSync(skMd, 'utf-8') };
      }
    }
    return null;
  }

  /**
   * 检测技能类型
   */
  detectType(skMd) {
    const lower = skMd.toLowerCase();
    if (lower.includes('curl') || lower.includes('fetch(') || lower.includes('api key') || lower.includes('endpoint'))
      return 'http';
    if (lower.includes('python') || lower.includes('pip '))
      return 'python';
    if (lower.includes('node ') || lower.includes('npm ') || lower.includes('javascript'))
      return 'node';
    if (lower.includes('docker ') || lower.includes('dockerfile'))
      return 'docker';
    if (lower.includes('git ') || lower.includes('github') || lower.includes('clone '))
      return 'git';
    if (lower.includes('browser') || lower.includes('chrome') || lower.includes('puppeteer'))
      return 'browser';
    if (lower.includes('sql') || lower.includes('database') || lower.includes('query'))
      return 'database';
    return 'generic';
  }

  /**
   * 根据 SKILL.md 生成 handler.js
   */
  generateHandler(name, skMd) {
    const type = this.detectType(skMd);
    const commands = this.extractCommands(skMd);
    const description = this.extractDescription(skMd);
    const triggers = this.extractTriggers(name);
    const endpoints = this.extractEndpoints(skMd);

    var desc = description;
    var code = `/**
 * ${name} — 由 Skill Importer 从 SKILL.md 自动生成
 * ${desc}
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  ${this.generateHandlerBody(type, name, commands, endpoints, desc)}

  return {
    type: '${type}',
    skill: '${name}',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
`;
    return code;
  }

  /**
   * 生成 handler 函数体
   */
  generateHandlerBody(type, name, commands, endpoints, description) {
    switch(type) {
      case 'http':
        if (endpoints.length > 0) {
          const ep = endpoints[0];
          return `
  try {
    const resp = await fetch('${ep.url}', {
      method: '${ep.method || 'GET'}',
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const text = await resp.text();
      results.push({ url: '${ep.url}', status: resp.status, output: text.substring(0, 1000) });
    } else {
      results.push({ url: '${ep.url}', error: 'HTTP ' + resp.status });
    }
  } catch(e) {
    results.push({ url: '${ep.url}', error: e.message });
  }`;
        }
        return `results.push({ note: 'HTTP技能: 请提供要请求的URL或查询参数' });`;

      case 'node':
        return `
  try {
    if (input) {
      const vm = require('vm');
      const script = new vm.Script(input);
      const ctx = { console: console, require: require, args: args, result: null };
      const sandbox = vm.createContext(ctx);
      script.runInContext(sandbox);
      results.push({ output: ctx.result || 'executed' });
    } else {
      results.push({ note: 'Node.js技能: 请提供要执行的JavaScript代码' });
    }
  } catch(e) {
    results.push({ error: e.message });
  }`;

      case 'python':
        return `
  try {
    const { execSync } = require('child_process');
    const pyCode = input || \`${this.extractPythonExample(commands)}\`;
    const out = execSync('python -c ' + JSON.stringify(pyCode), { encoding: 'utf-8', timeout: 10000 });
    results.push({ output: out.trim() });
  } catch(e) {
    results.push({ error: e.message });
  }`;

      case 'docker':
        return `
  try {
    const { execSync } = require('child_process');
    const cmd = input || 'docker --version';
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    results.push({ command: cmd.substring(0, 60), output: out.trim() });
  } catch(e) {
    results.push({ error: e.message });
  }`;

      default:
        return `
  try {
    results.push({
      note: '${name} 技能说明文档已就绪',
      description: \`${description.substring(0, 200)}\`,
      commands: ${JSON.stringify(commands.slice(0, 5))}
    });
  } catch(e) {
    results.push({ error: e.message });
  }`;
    }
  }

  /**
   * 提取命令示例
   */
  extractCommands(skMd) {
    const cmds = [];
    const blockRe = /```(\w*)\n([\s\S]*?)```/g;
    let m;
    while ((m = blockRe.exec(skMd)) !== null) {
      const lang = m[1].trim();
      const code = m[2].trim();
      if (code && code.length < 200) {
        cmds.push({ lang, code });
      }
    }
    return cmds;
  }

  /**
   * 提取 API 端点
   */
  extractEndpoints(skMd) {
    const endpoints = [];
    const urlRe = /(https?:\/\/[^\s"']+)/g;
    const methodRe = /\b(GET|POST|PUT|DELETE|PATCH)\b/g;
    const urls = [...new Set((skMd.match(urlRe) || []).map(u => u.replace(/[.。,，\]\)].*/, '')))];
    const methods = skMd.match(methodRe) || [];
    
    urls.forEach((url, i) => {
      if (url.length < 200 && !url.includes('${') && !url.includes('example.com')) {
        endpoints.push({
          url: url,
          method: methods[i] || 'GET'
        });
      }
    });
    return endpoints.slice(0, 3);
  }

  /**
   * 提取描述
   */
  extractDescription(skMd) {
    const match = skMd.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const desc = match[1].match(/description:\s*"?([^"\n]+)"?/);
      if (desc) return desc[1].trim();
    }
    return '';
  }

  /**
   * 提取触发词
   */
  extractTriggers(name) {
    const base = name.replace(/[_-]/g, ' ');
    return `[${base}][${name}]`;
  }

  /**
   * 提取 Python 代码示例
   */
  extractPythonExample(commands) {
    const pyCmd = commands.find(c => c.lang === 'python' || c.lang === 'py');
    return pyCmd ? pyCmd.code.replace(/"/g, '\\"') : 'print("hello")';
  }

  /**
   * 导入所有文档类技能
   */
  importAll() {
    const results = [];
    const dirs = [
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills'),
      path.join(require('os').homedir(), '.openclaw', 'workspace', 'skills')
    ];

    const imported = new Set();
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(entry => {
        const skillDir = path.join(dir, entry);
        const skMd = path.join(skillDir, 'SKILL.md');
        if (fs.statSync(skillDir).isDirectory() && fs.existsSync(skMd) && !imported.has(entry)) {
          imported.add(entry);
          const targetDir = path.join(SKILLS_RUNNER, entry);
          if (!fs.existsSync(path.join(targetDir, 'handler.js'))) {
            const r = this.importFromSkMd(entry);
            results.push(r);
          }
        }
      });
    });

    return results;
  }
}

module.exports = SkillImporter;
