/**
 * skill-proxy.js — OpenClaw 技能 → eCompany 工具 代理桥接
 * 
 * 让 eCompany 的 AI Agent 能调用 OpenClaw 生态的 93+ 个技能
 * 
 * 工作方式：
 *   1. 扫描 OpenClaw 技能目录（bundled + workspace + skills-runner）
 *   2. 解析 SKILL.md 提取元数据
 *   3. 为每个技能注册为 DeepSeek function calling 工具
 *   4. 工具执行时：读取 SKILL.md 内容注入上下文，让 AI 用现有工具执行
 */

const fs = require('fs');
const path = require('path');

// ========== 1. 技能发现 ==========

const SKILL_PATHS = [
  // OpenClaw 内置技能（随 npm 安装）
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'skills'),
  // OpenClaw 工作区技能
  path.join(process.env.HOME || 'C:/Users/Administrator', '.openclaw', 'workspace', 'skills'),
  // eCompany 本地技能
  path.join(__dirname, '..', 'skills'),
  // eCompany Skills Runner（正式版技能存放地）
  path.join(__dirname, '..', 'skills-runner')
];

// 解析 SKILL.md 的 YAML frontmatter
function parseFrontmatter(content) {
  try {
    var match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    var yaml = match[1];
    var result = {};
    var lines = yaml.split('\n');
    var currentKey = null;
    var currentObj = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var kv = line.match(/^(\w+):\s*(.*)/);
      if (kv) {
        currentKey = kv[1];
        var val = kv[2].trim();
        // Handle quoted strings
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        // Handle inline JSON
        if (val.startsWith('{') || val.startsWith('[')) {
          try { val = JSON.parse(val); } catch(e) {}
        }
        result[currentKey] = val;
        currentObj = null;
      } else if (currentKey && line.match(/^\s{2,}/)) {
        // Multi-line value (continuation)
        if (typeof result[currentKey] === 'string') {
          result[currentKey] += '\n' + line.trim();
        }
      }
    }
    return result;
  } catch(e) { return {}; }
}

// 扫描一个技能目录，返回技能列表
function scanSkillsDir(dir) {
  var results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    var entries = fs.readdirSync(dir);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var skillDir = path.join(dir, entry);
      if (!fs.statSync(skillDir).isDirectory()) continue;
      var skMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skMdPath)) continue;
      try {
        var content = fs.readFileSync(skMdPath, 'utf-8');
        var meta = parseFrontmatter(content);
        // Extract summary/description from content after frontmatter
        var bodyMatch = content.match(/^---[\s\S]*?---\n\n([\s\S]*)/);
        var summary = '';
        if (bodyMatch) {
          // First paragraph as summary
          var body = bodyMatch[1].trim();
          var firstPara = body.match(/^(.*?)(?:\n\n|$)/);
          if (firstPara) summary = firstPara[1].replace(/^#+\s*/, '').trim();
        }
        results.push({
          id: entry,
          name: meta.name || entry,
          description: meta.description || summary || (meta.name || entry) + ' skill',
          emoji: (meta.metadata && meta.metadata.openclaw && meta.metadata.openclaw.emoji) || '🔧',
          requires: (meta.metadata && meta.metadata.openclaw && meta.metadata.openclaw.requires) || {},
          install: (meta.metadata && meta.metadata.openclaw && meta.metadata.openclaw.install) || [],
          source: path.basename(path.dirname(dir)),
          dir: skillDir,
          rawContent: content.substring(0, 500), // Store first 500 chars for context
          homepage: meta.homepage || ''
        });
      } catch(e) {}
    }
  } catch(e) {}
  return results;
}

// 读取技能状态（启用/禁用）
function loadSkillStates() {
  try {
    var spPath = path.join(__dirname, '..', 'data', 'skill-states.json');
    if (fs.existsSync(spPath)) {
      return JSON.parse(fs.readFileSync(spPath, 'utf-8'));
    }
  } catch(e) {}
  return {};
}

// 获取所有技能
function getAllSkills() {
  var all = [];
  for (var i = 0; i < SKILL_PATHS.length; i++) {
    var skills = scanSkillsDir(SKILL_PATHS[i]);
    for (var j = 0; j < skills.length; j++) {
      var s = skills[j];
      // Avoid duplicates (workspace overrides bundled, skills-runner overrides all)
      var existing = all.findIndex(function(x) { return x.id === s.id; });
      if (existing >= 0) {
        all[existing] = s; // Replace with higher-priority source
      } else {
        all.push(s);
      }
    }
  }
  // 应用技能状态（启用/禁用）
  var states = loadSkillStates();
  for (var k = 0; k < all.length; k++) {
    if (states[all[k].id] === false) {
      all[k].enabled = false;
    } else if (states[all[k].id] === true) {
      all[k].enabled = true;
    } else {
      all[k].enabled = true;
    }
  }
  return all;
}

// ========== 2. 转换为 DeepSeek Tool 格式 ==========

// 生成技能的工具定义
function generateToolForSkill(skill) {
  var paramProps = {};
  var paramRequired = [];
  // Extract param hints from description or generate generic params
  var desc = (skill.description || '') + '\n\n技能来源: ' + skill.source + '\n技能路径: ' + skill.dir;
  if (skill.homepage) desc += '\n参考: ' + skill.homepage;
  
  return {
    type: 'function',
    function: {
      name: 'skill_' + skill.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
      description: desc.substring(0, 500),
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: '需要该技能执行的具体任务描述'
          }
        },
        required: ['task']
      }
    },
    _skillMeta: skill  // Internal metadata, not sent to API
  };
}

// 获取所有技能的工具定义（用于注册到 tools-registry）
function getAllSkillTools() {
  var skills = getAllSkills();
  return skills.map(function(s) { return generateToolForSkill(s); });
}

// ========== 3. 技能执行 ==========

// 执行技能：读取 SKILL.md 内容，返回执行上下文
async function executeSkill(toolName, args) {
  var skillId = toolName.replace(/^skill_/, '');
  var skills = getAllSkills();
  var skill = skills.find(function(s) { return s.id === skillId; });
  if (!skill) return { error: 'Unknown skill: ' + skillId };
  
  try {
    var content = fs.readFileSync(path.join(skill.dir, 'SKILL.md'), 'utf-8');
    // Return the skill content + instructions for the AI
    return {
      skillId: skill.id,
      skillName: skill.name,
      content: content.substring(0, 8000), // Full SKILL.md as context
      task: (args && args.task) || '',
      homepage: skill.homepage,
      source: skill.source
    };
  } catch(e) {
    return { error: 'Failed to read skill: ' + e.message };
  }
}

// ========== 4. 缓存和导出 ==========

var cachedSkills = null;
var lastScan = 0;
var SCAN_INTERVAL = 60000; // 60s

function getSkills(forceRefresh) {
  var now = Date.now();
  if (forceRefresh || !cachedSkills || now - lastScan > SCAN_INTERVAL) {
    cachedSkills = getAllSkills();
    lastScan = now;
  }
  return cachedSkills;
}

// 统计信息
function getStats() {
  var skills = getSkills();
  var bySource = {};
  skills.forEach(function(s) {
    bySource[s.source] = (bySource[s.source] || 0) + 1;
  });
  return {
    total: skills.length,
    bySource: bySource,
    skillNames: skills.map(function(s) { return s.emoji + ' ' + s.id; }).sort(),
    lastScan: new Date(lastScan).toISOString()
  };
}

// ========== 5. 路由注册（在 server-modern.js 中调用） ==========

function registerSkillProxyRoutes(registerRoute, parseBody, json) {
  // 列出所有技能
  registerRoute(['GET'], /^\/api\/skills\/proxy\/list$/, function(req, res) {
    json(res, { ok: true, skills: getSkills(true), stats: getStats() });
  });
  
  // 获取单个技能详情
  registerRoute(['GET'], /^\/api\/skills\/proxy\/detail\/([^\/]+)$/, function(req, res, m) {
    var skills = getSkills();
    var skill = skills.find(function(s) { return s.id === m[1]; });
    if (!skill) return json(res, { ok: false, error: 'Skill not found: ' + m[1] }, 404);
    try {
      var content = fs.readFileSync(path.join(skill.dir, 'SKILL.md'), 'utf-8');
      json(res, { ok: true, skill: skill, content: content });
    } catch(e) {
      json(res, { ok: false, error: e.message });
    }
  });
  
  // 刷新技能缓存
  registerRoute(['POST'], /^\/api\/skills\/proxy\/refresh$/, function(req, res) {
    getSkills(true);
    json(res, { ok: true, stats: getStats() });
  });
  
  // 统计
  registerRoute(['GET'], /^\/api\/skills\/proxy\/stats$/, function(req, res) {
    json(res, { ok: true, stats: getStats() });
  });
}

module.exports = {
  getAllSkills: function() { return getSkills(); },
  getAllSkillTools: function() { return getAllSkillTools(); },
  executeSkill: executeSkill,
  getStats: getStats,
  registerSkillProxyRoutes: registerSkillProxyRoutes
};
