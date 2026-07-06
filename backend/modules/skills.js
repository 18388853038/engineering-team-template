/**
 * eCompany 技能系统模块
 * 
 * 能力注入：AgentSkills 兼容的 SKILL.md 加载与执行
 * 让 eCompany 拥有 OpenClaw 的技能系统能力
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const SKILLS_CONFIG_PATH = path.join(__dirname, '..', 'skills-config.json');

// ========== 加载/保存技能配置（enabled状态） ==========
function loadSkillsConfig() {
  try { return JSON.parse(fs.readFileSync(SKILLS_CONFIG_PATH, 'utf-8')); } catch(e) { return { enabled: {} }; }
}
function saveSkillsConfig(cfg) {
  fs.writeFileSync(SKILLS_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ========== 技能加载 ==========

class SkillSystem {
  constructor() {
    this.skills = new Map();
    this.config = loadSkillsConfig();
    this.loadAll();
  }

  /** 保存配置 */
  _persistConfig() {
    saveSkillsConfig(this.config);
  }

  /** 设置技能启用状态 */
  setEnabled(name, enabled) {
    if (!this.config.enabled) this.config.enabled = {};
    this.config.enabled[name] = enabled;
    this._persistConfig();
    console.log('[Skills] 技能 "' + name + '" 已' + (enabled ? '启用' : '禁用'));
    return true;
  }

  /** 检查技能是否启用（默认已启用） */
  isEnabled(name) {
    if (!this.config.enabled) return true;
    // 显式禁用的才返回 false
    return this.config.enabled[name] !== false;
  }

  /** 获取所有技能enabled状态映射 */
  getEnabledMap() {
    return (this.config && this.config.enabled) || {};
  }

  /** 扫描并加载所有技能 */
  loadAll() {
    this.skills.clear();

    // 从多个路径加载
    const paths = [
      SKILLS_DIR,                              // 项目技能
      path.join(SKILLS_DIR, '..', 'skills'),   // 备用路径
      path.join(SKILLS_DIR, '..', 'skills-runner'),  // OpenClaw 技能生态
    ];

    for (const dir of paths) {
      if (fs.existsSync(dir)) {
        this._loadFromDir(dir);
      }
    }

    console.log(`[Skills] 已加载 ${this.skills.size} 个技能`);
    return this.skills.size;
  }

  _loadFromDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(dir, entry.name);
          const skillFile = path.join(skillDir, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            this._loadSkill(entry.name, skillDir, skillFile);
          }
        }
      }
    } catch(e) {
      console.error(`[Skills] 加载错误 ${dir}:`, e.message);
    }
  }

  _loadSkill(name, dir, file) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed = this._parseSkillMd(content);
      if (parsed) {
        this.skills.set(name, {
          name,
          dir,
          ...parsed,
          raw: content,
          enabled: this.isEnabled(name)
        });
      }
    } catch(e) {
      console.error(`[Skills] 解析错误 ${name}:`, e.message);
    }
  }

  /**
   * 解析 SKILL.md 文件
   * 格式：
   * ---
   * name: skill-name
   * description: ...
   * metadata: {"openclaw": {"requires": {"bins": ["node"]}}}
   * ---
   * 指令内容...
   */
  _parseSkillMd(content) {
    // 提取 frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      // 无 frontmatter 的纯文本
      return { description: '无描述', instructions: content, metadata: {} };
    }

    const frontmatter = match[1];
    const instructions = match[2].trim();

    const parsed = {};
    let metadata = {};

    // 解析 key-value 行
    for (const line of frontmatter.split('\n')) {
      const kv = line.match(/^\s*(\w+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1].trim();
        let value = kv[2].trim();

        // 处理 metadata JSON
        if (key === 'metadata') {
          try { metadata = JSON.parse(value); } catch(e) { metadata = {}; }
        } else {
          parsed[key] = value;
        }
      }
    }

    return {
      name: parsed.name,
      description: parsed.description || '无描述',
      emoji: parsed.emoji,
      metadata,
      instructions,
      userInvocable: parsed['user-invocable'] !== 'false'
    };
  }

  /** 获取技能列表 */
  list() {
    const result = [];
    for (const [name, skill] of this.skills) {
      result.push({
        name,
        id: name,
        description: skill.description,
        emoji: skill.emoji,
        userInvocable: skill.userInvocable,
        metadata: skill.metadata,
        enabled: this.isEnabled(name)
      });
    }
    return result;
  }

  /** 获取技能详情 */
  get(name) {
    const skill = this.skills.get(name);
    if (skill) {
      return { ...skill, enabled: this.isEnabled(name) };
    }
    return null;
  }

  /** 获取技能指令（用于注入 AI 提示词） */
  getInstructions(name) {
    const skill = this.skills.get(name);
    return skill ? skill.instructions : null;
  }

  /** 创建新技能 */
  createSkill(name, description, instructions, metadata = {}) {
    const dir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const metaStr = Object.keys(metadata).length > 0
      ? `\nmetadata: ${JSON.stringify(metadata)}`
      : '';

    const content = `---
name: ${name}
description: ${description}${metaStr}
---

${instructions}
`;

    fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
    this._loadSkill(name, dir, content);
    return { name, path: path.join(dir, 'SKILL.md') };
  }

  /** 生成技能提示词（用于注入到 AI system prompt） */
  buildSkillsPrompt() {
    const parts = [];
    for (const [name, skill] of this.skills) {
      if (skill.userInvocable && skill.instructions && this.isEnabled(name)) {
        parts.push(`## 技能：${skill.emoji ? skill.emoji + ' ' : ''}${name}\n${skill.description}\n\n${skill.instructions}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  /** 生成指定技能列表的提示词（按技能ID过滤）*/
  buildSkillsPromptForSkills(skillIds) {
    const parts = [];
    for (const name of skillIds) {
      const skill = this.skills.get(name);
      if (skill && skill.instructions && this.isEnabled(name)) {
        parts.push(`## 技能：${skill.emoji ? skill.emoji + ' ' : ''}${skill.name || name}\n${skill.description}\n\n${skill.instructions}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }
}

// ========== 内置技能 ==========
// 开箱即用的默认技能

const BUILT_IN_SKILLS = {
  'code-review': {
    description: '代码审查技能 - 对代码进行系统性审查',
    instructions: `当被要求审查代码时：
1. 逐行阅读代码，关注逻辑错误、安全漏洞和性能问题
2. 检查代码是否符合项目规范和最佳实践
3. 提供具体的改进建议和代码示例
4. 按严重程度标注发现的问题：🔴 严重 / 🟡 中等 / 🔵 轻微`
  },
  'system-analyze': {
    description: '系统分析技能 - 分析系统运行状态',
    instructions: `当被要求分析系统时：
1. 检查系统健康状态
2. 分析团队工作负载
3. 识别潜在瓶颈
4. 给出优化建议`
  }
};

// ========== 初始化内置技能 ==========
function initBuiltInSkills(skillSystem) {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  for (const [name, def] of Object.entries(BUILT_IN_SKILLS)) {
    const skillDir = path.join(SKILLS_DIR, name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillFile, `---
name: ${name}
description: ${def.description}
---
${def.instructions}
`, 'utf-8');
    }
  }

  // 重新加载
  skillSystem.loadAll();
}

// ========== 导出 ==========

const skillSystem = new SkillSystem();
initBuiltInSkills(skillSystem);

module.exports = {
  SkillSystem,
  skillSystem
};
