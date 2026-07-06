const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SKILLS_DIR = path.join(BASE, 'skills-runner');

/**
 * Skill Lifecycle HTTP Routes
 * 安装/卸载/更新/查询的全生命周期 API
 * 注册方式: 在 server-modern.js 中 require 后调用 registerLifecycleRoutes
 */

function registerLifecycleRoutes(registerRoute, parseBody, json) {
  const SkillScanner = require('./skills-runner').SkillScanner;
  const SkillLifecycle = require('./skill-lifecycle');
  const scanner = new SkillScanner();
  const lifecycle = new SkillLifecycle(scanner);

  // Enhanced install (multi-source)
  registerRoute(['POST'], /^\/api\/runner\/install$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const name = body.name;
      if (!name) { json(res, { error: '缺少name' }, 400); return; }
      const result = await lifecycle.install(name, body.source);
      scanner.scanAll();
      json(res, { ok: result.ok, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // Uninstall
  registerRoute(['DELETE'], /^\/api\/runner\/skills\/([^/]+)$/, (req, res, m) => {
    const result = lifecycle.uninstall(m[1]);
    scanner.scanAll();
    json(res, { ok: result.ok, ...result });
  });

  // Update (re-generate handler from SKILL.md)
  registerRoute(['POST'], /^\/api\/runner\/skills\/([^/]+)\/update$/, (req, res, m) => {
    const result = lifecycle.update(m[1]);
    scanner.scanAll();
    json(res, { ok: result.ok, ...result });
  });

  // Check GitHub for updates
  registerRoute(['GET'], /^\/api\/runner\/update\/check$/, async (req, res) => {
    try {
      const result = await lifecycle.checkAllUpdates();
      json(res, { ok: true, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // Check single skill update
  registerRoute(['GET'], /^\/api\/runner\/skills\/([^/]+)\/update$/, async (req, res, m) => {
    try {
      const result = await lifecycle.checkUpdate(m[1]);
      json(res, { ok: result.ok, ...result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });

  // Skill detail
  registerRoute(['GET'], /^\/api\/runner\/skills\/([^/]+)\/info$/, (req, res, m) => {
    const result = lifecycle.info(m[1]);
    json(res, { ok: result.ok, ...result });
  });

  // Batch install all OpenClaw skills
  registerRoute(['POST'], /^\/api\/runner\/install-all$/, async (req, res) => {
    try {
      const importer = new (require('./skill-importer'))(scanner);
      const results = importer.importAll();
      scanner.scanAll();
      json(res, {
        ok: true,
        total: results.length,
        success: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        results
      });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

module.exports = { registerLifecycleRoutes };
