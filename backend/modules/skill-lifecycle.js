const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SKILLS_DIR = path.join(BASE, 'skills-runner');

/**
 * Skill Lifecycle Manager
 * 安装/卸载/更新/启用禁用的全生命周期管理
 */

const GITHUB_RAW = 'https://raw.githubusercontent.com/openclaw';
const SKILLS_REPO = 'skills';
const SKILLS_BRANCH = 'main';

class SkillLifecycle {
  constructor(scanner) {
    this.scanner = scanner;
  }

  /**
   * 安装技能 (支持多种来源)
   */
  async install(name, source) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (fs.existsSync(path.join(targetDir, 'handler.js'))) {
      return { ok: false, error: '技能已安装: ' + name + ' (若需重新安装,先卸载)' };
    }

    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }

    // Source 1: OpenClaw bundled
    const ocDir = path.join(
      process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills', name
    );
    if (fs.existsSync(path.join(ocDir, 'SKILL.md'))) {
      return this.installFromLocal(name, ocDir, 'openclaw_bundled');
    }

    // Source 2: Workspace skills
    const wsDir = path.join(
      require('os').homedir(), '.openclaw', 'workspace', 'skills', name
    );
    if (fs.existsSync(path.join(wsDir, 'SKILL.md'))) {
      return this.installFromLocal(name, wsDir, 'workspace');
    }

    // Source 3: GitHub
    if (source === 'github' || !source) {
      return await this.installFromGitHub(name);
    }

    // Source 4: Create stub
    return this.createStub(name);
  }

  /**
   * 从本地安装
   */
  installFromLocal(name, srcDir, source) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Copy SKILL.md
    if (fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
      fs.copyFileSync(path.join(srcDir, 'SKILL.md'), path.join(targetDir, 'SKILL.md'));
    }

    // Generate handler from SKILL.md
    try {
      const importer = new (require('./skill-importer'))(this.scanner);
      const result = importer.importFromSkMd(name);
      return {
        ok: true,
        name,
        source,
        handlerSize: result.handlerSize || 0,
        message: '已从本地安装: ' + name
      };
    } catch(e) {
      return { ok: false, error: '生成 handler 失败: ' + e.message };
    }
  }

  /**
   * 从 GitHub 安装
   */
  async installFromGitHub(name) {
    // Try to fetch SKILL.md from OpenClaw skills repo
    const urls = [
      `${GITHUB_RAW}/${SKILLS_REPO}/${SKILLS_BRANCH}/skills/${name}/SKILL.md`,
      `${GITHUB_RAW}/skill-${name}/${SKILLS_BRANCH}/SKILL.md`,
    ];

    let content = null;
    let sourceUrl = '';

    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          content = await resp.text();
          sourceUrl = url;
          break;
        }
      } catch(e) { /* try next */ }
    }

    if (!content) {
      return this.createStub(name);
    }

    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf-8');

    // Generate handler
    try {
      const importer = new (require('./skill-importer'))(this.scanner);
      return {
        ok: true,
        name,
        source: 'github',
        handlerSize: importer.importFromSkMd(name).handlerSize || 0,
        message: '已从 GitHub 安装: ' + name,
        url: sourceUrl
      };
    } catch(e) {
      return { ok: false, error: '生成 handler 失败: ' + e.message };
    }
  }

  /**
   * 创建空壳
   */
  createStub(name) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const skMd = `---
name: ${name}
description: ${name} — 自动创建的技能骨架
---

# ${name}

暂无详细文档。可通过 \`skill install ${name} --from github\` 从 GitHub 拉取。

## 使用方式

通过 CEO 对话自然语言触发。
`;
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skMd, 'utf-8');

    const handlerCode = `/**
 * ${name} — 自动创建的技能骨架
 */
module.exports = async function handler(args) {
  return {
    type: 'stub',
    name: '${name}',
    note: '此技能暂无具体实现,请从 GitHub 安装完整版本'
  };
};
`;
    fs.writeFileSync(path.join(targetDir, 'handler.js'), handlerCode, 'utf-8');

    return {
      ok: true,
      name,
      source: 'stub',
      message: '已创建技能骨架: ' + name + ' (运行 skill install ' + name + ' --from github 安装完整版)'
    };
  }

  /**
   * 卸载技能
   */
  uninstall(name) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(targetDir)) {
      return { ok: false, error: '技能未安装: ' + name };
    }
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      // Clear require cache
      try { delete require.cache[require.resolve(path.join(targetDir, 'handler.js'))]; } catch(e) {}
      return { ok: true, message: '已卸载: ' + name };
    } catch(e) {
      return { ok: false, error: '卸载失败: ' + e.message };
    }
  }

  /**
   * 更新技能 (重新生成 handler)
   */
  update(name) {
    const targetDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(path.join(targetDir, 'SKILL.md'))) {
      return { ok: false, error: '技能 SKILL.md 未找到: ' + name };
    }

    try {
      // Re-generate handler from SKILL.md
      delete require.cache[require.resolve(path.join(targetDir, 'handler.js'))];
      const importer = new (require('./skill-importer'))(this.scanner);
      const result = importer.importFromSkMd(name);
      return {
        ok: true,
        name,
        handlerSize: result.handlerSize || 0,
        message: '已更新: ' + name
      };
    } catch(e) {
      return { ok: false, error: '更新失败: ' + e.message };
    }
  }

  /**
   * 检查 GitHub 新版本
   */
  async checkUpdate(name) {
    try {
      const url = `${GITHUB_RAW}/${SKILLS_REPO}/${SKILLS_BRANCH}/skills/${name}/SKILL.md`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return { ok: false, hasUpdate: false, error: 'GitHub 上未找到此技能' };

      const targetDir = path.join(SKILLS_DIR, name);
      const localMd = path.join(targetDir, 'SKILL.md');
      if (!fs.existsSync(localMd)) {
        return { ok: true, hasUpdate: true, message: '本地未安装,可通过 install 安装' };
      }

      const remoteContent = await resp.text();
      const localContent = fs.readFileSync(localMd, 'utf-8');

      return {
        ok: true,
        name,
        hasUpdate: remoteContent.length !== localContent.length,
        localSize: localContent.length,
        remoteSize: remoteContent.length,
        message: remoteContent.length !== localContent.length ? '有新版本可用' : '已是最新'
      };
    } catch(e) {
      return { ok: false, error: '检查更新失败: ' + e.message };
    }
  }

  /**
   * 批量检查更新
   */
  async checkAllUpdates() {
    const skills = this.scanner.list();
    const results = [];

    for (const skill of skills) {
      const r = await this.checkUpdate(skill.name);
      results.push(r);
    }

    return {
      total: results.length,
      withUpdates: results.filter(r => r.hasUpdate).length,
      upToDate: results.filter(r => !r.hasUpdate).length,
      results
    };
  }

  /**
   * 获取技能详情
   */
  info(name) {
    const targetDir = path.join(SKILLS_DIR, name);
    const skMd = path.join(targetDir, 'SKILL.md');
    const handler = path.join(targetDir, 'handler.js');

    if (!fs.existsSync(skMd)) {
      return { ok: false, error: '技能未找到: ' + name };
    }

    return {
      ok: true,
      name,
      dir: targetDir,
      hasHandler: fs.existsSync(handler),
      skMdSize: fs.statSync(skMd).size,
      handlerSize: fs.existsSync(handler) ? fs.statSync(handler).size : 0,
      installedAt: fs.statSync(targetDir).mtime.toISOString(),
      source: this.detectSource(name)
    };
  }

  detectSource(name) {
    if (!fs.existsSync(path.join(SKILLS_DIR, name))) return 'not_installed';
    const skMd = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf-8');
    if (skMd.includes('openclaw') && !skMd.includes('自动创建')) return 'openclaw';
    if (skMd.includes('自动创建')) return 'stub';
    if (skMd.includes('generated')) return 'generated';
    return 'custom';
  }
}

module.exports = SkillLifecycle;
