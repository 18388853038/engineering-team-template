#!/usr/bin/env node
/**
 * eCompany Skill 安装器
 * 集成 OpenClaw SkillHub 生态，支持从 skills.sh / GitHub / 本地 安装技能
 * 复用 npx skills CLI 生态
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const SKILLS_REGISTRY = path.join(__dirname, 'registry.json');

if (!fs.existsSync(SKILLS_DIR)) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

// OpenClaw 内置技能注册表（路径映射）
const OPENCLAW_SKILLS_PATH = path.join(__dirname, '..', '..', '..',
  process.platform === 'win32'
    ? 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills'
    : 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills'
);

const BUNDLED_SKILLS_PATH = 'D:/QClaw/v0.2.22.518/resources/openclaw/node_modules/openclaw/skills';

const KNOWN_SKILLS = {
  'tencent-docs': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/tencent-docs', emoji: '📄' },
  'weather': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/node_modules/openclaw/skills/weather', emoji: '🌤️' },
  'qclaw-env': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/qclaw-env', emoji: '⚙️' },
  'qclaw-rules': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/qclaw-rules', emoji: '📋' },
  'email-skill': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/email-skill', emoji: '📧' },
  'pdf': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/pdf', emoji: '📑' },
  'xlsx': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/xlsx', emoji: '📊' },
  'docx': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/docx', emoji: '📝' },
  'pptx': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/pptx', emoji: '📽️' },
  'tencent-meeting-mcp': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/tencent-meeting-mcp', emoji: '🎙️' },
  'online-search': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/online-search', emoji: '🔍' },
  'cloud-upload-backup': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/cloud-upload-backup', emoji: '☁️' },
  'healthcheck': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/node_modules/openclaw/skills/healthcheck', emoji: '🛡️' },
  'node-connect': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/node_modules/openclaw/skills/node-connect', emoji: '🔗' },
  'skill-creator': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/node_modules/openclaw/skills/skill-creator', emoji: '🛠️' },
  'find-skills': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/find-skills', emoji: '🔍' },
  'mcp-builder': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/mcp-builder', emoji: '🔌' },
  'mcporter': { source: 'bundled', path: 'D:/QClaw/v0.2.22.518/resources/openclaw/config/skills/mcporter', emoji: '📦' },
};

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(SKILLS_REGISTRY, 'utf-8'));
  } catch (e) {
    return { installed: {}, updates: {} };
  }
}

function saveRegistry(r) {
  fs.writeFileSync(SKILLS_REGISTRY, JSON.stringify(r, null, 2), 'utf-8');
}

function copySkillDir(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error('Source not found: ' + src);
  }
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copySkillDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function installKnown(name) {
  const info = KNOWN_SKILLS[name];
  if (!info) return { ok: false, error: 'Unknown skill: ' + name };

  const dst = path.join(SKILLS_DIR, name);
  if (fs.existsSync(dst)) {
    return { ok: false, error: 'Already installed: ' + name };
  }

  try {
    copySkillDir(info.path, dst);
    const r = loadRegistry();
    r.installed[name] = {
      source: info.source,
      installedAt: new Date().toISOString(),
      emoji: info.emoji
    };
    saveRegistry(r);
    return { ok: true, message: 'Installed ' + name, path: dst };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function installFromGit(gitSpec) {
  // gitSpec: owner/repo or owner/repo@tag
  const dst = path.join(SKILLS_DIR, gitSpec.split('/').pop().split('@')[0]);
  if (fs.existsSync(dst)) {
    return { ok: false, error: 'Already installed' };
  }
  try {
    console.log('[Skill Install] Cloning ' + gitSpec);
    execSync(`git clone https://github.com/${gitSpec} "${dst}" --depth=1`, { stdio: 'pipe' });
    return { ok: true, message: 'Installed from GitHub: ' + gitSpec };
  } catch (e) {
    return { ok: false, error: 'Git clone failed: ' + e.message };
  }
}

function installOnline(searchQuery) {
  try {
    const out = execSync(`npx skills find ${searchQuery}`, { encoding: 'utf-8', timeout: 30000 });
    return { ok: true, raw: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function listInstalled() {
  const r = loadRegistry();
  return { installed: r.installed, known: KNOWN_SKILLS };
}

function uninstall(name) {
  const dst = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(dst)) return { ok: false, error: 'Not installed: ' + name };
  fs.rmSync(dst, { recursive: true, force: true });
  const r = loadRegistry();
  delete r.installed[name];
  saveRegistry(r);
  return { ok: true, message: 'Uninstalled ' + name };
}

// Export for programmatic use
module.exports = { installKnown, installFromGit, installOnline, listInstalled, uninstall, KNOWN_SKILLS };

// CLI 接口
const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd) {
  switch (cmd) {
    case 'install-known':
    console.log(JSON.stringify(installKnown(args[0])));
    break;
  case 'install-git':
    console.log(JSON.stringify(installFromGit(args[0])));
    break;
  case 'search':
    console.log(JSON.stringify(installOnline(args.join(' '))));
    break;
  case 'list':
    console.log(JSON.stringify(listInstalled()));
    break;
  case 'uninstall':
    console.log(JSON.stringify(uninstall(args[0])));
    break;
  case 'known':
    console.log(JSON.stringify(Object.keys(KNOWN_SKILLS)));
    break;
    default:
      console.log(JSON.stringify({ error: 'Unknown cmd: ' + cmd }));
  }
}