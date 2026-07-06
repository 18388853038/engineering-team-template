/**
 * eCompany 插件系统
 * 功能：
 *   1. 插件注册/加载/启用/禁用
 *   2. 自定义工具注册（运行时热插拔）
 *   3. 插件生命周期钩子
 *   4. 插件市场对接
 */

const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const CONFIG_FILE = path.join(__dirname, '..', 'plugins-config.json');

class PluginSystem {
  constructor() {
    this.plugins = {};       // id → plugin descriptor
    this.customTools = {};   // toolName → tool definition
    this._config = {};
    this._loadConfig();
    this._ensureDir();
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        this._config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch(e) {}
    if (!this._config.plugins) this._config.plugins = {};
  }

  _saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this._config, null, 2), 'utf-8');
    } catch(e) {}
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    } catch(e) {}
  }

  // ========== 插件生命周期 ==========

  /**
   * 加载所有已启用的插件
   */
  loadAll() {
    var results = { loaded: 0, failed: 0, errors: [] };
    this._ensureDir();
    try {
      var dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
      for (var d of dirs) {
        if (!d.isDirectory()) continue;
        try {
          var manifestPath = path.join(PLUGINS_DIR, d.name, 'manifest.json');
          if (!fs.existsSync(manifestPath)) continue;
          var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          var pluginId = manifest.id || d.name;
          
          // Check if enabled
          var enabled = this._config.plugins[pluginId];
          if (enabled === false) continue; // explicitly disabled
          
          var mainFile = path.join(PLUGINS_DIR, d.name, manifest.main || 'index.js');
          if (!fs.existsSync(mainFile)) {
            results.errors.push(pluginId + ': main file not found');
            results.failed++;
            continue;
          }
          
          try {
            var pluginModule = require(mainFile);
            var tools = [];
            if (typeof pluginModule === 'function') {
              tools = pluginModule(this) || [];
            } else if (pluginModule.registerTools) {
              tools = pluginModule.registerTools(this) || [];
            }
            
            this.plugins[pluginId] = {
              id: pluginId,
              name: manifest.name || pluginId,
              version: manifest.version || '1.0.0',
              description: manifest.description || '',
              author: manifest.author || '',
              enabled: true,
              main: mainFile,
              tools: tools,
              manifest: manifest
            };
            
            // Register custom tools
            for (var t of tools) {
              this.registerTool(pluginId, t);
            }
            
            this._config.plugins[pluginId] = true;
            results.loaded++;
          } catch(e) {
            results.errors.push(pluginId + ': ' + e.message);
            results.failed++;
          }
        } catch(e) {
          results.errors.push(d.name + ': ' + e.message);
          results.failed++;
        }
      }
    } catch(e) {}
    this._saveConfig();
    return results;
  }

  /**
   * 注册自定义工具
   */
  registerTool(pluginId, toolDef) {
    if (!toolDef || !toolDef.name) return false;
    this.customTools[toolDef.name] = {
      ...toolDef,
      pluginId: pluginId
    };
    return true;
  }

  /**
   * 获取插件生成的自定义工具列表（供 agent-engine 使用）
   */
  getCustomTools() {
    var list = [];
    for (var name of Object.keys(this.customTools)) {
      var t = this.customTools[name];
      list.push({
        name: t.name,
        desc: t.description || t.desc || '',
        params: t.parameters || t.params || {},
        handler: t.handler || null,
        pluginId: t.pluginId
      });
    }
    return list;
  }

  /**
   * 安装插件
   */
  installPlugin(pluginId, source) {
    // source could be: URL to git repo, npm package name, or local path
    this._config.plugins[pluginId] = true;
    this._saveConfig();
    return { ok: true, pluginId: pluginId };
  }

  /**
   * 启用/禁用插件
   */
  setEnabled(pluginId, enabled) {
    this._config.plugins[pluginId] = enabled;
    this._saveConfig();
    
    if (this.plugins[pluginId]) {
      this.plugins[pluginId].enabled = enabled;
      // Remove tools if disabling
      if (!enabled) {
        var plugin = this.plugins[pluginId];
        for (var t of (plugin.tools || [])) {
          if (t.name) delete this.customTools[t.name];
        }
      }
    }
    return { ok: true };
  }

  /**
   * 获取插件列表
   */
  getPlugins() {
    var list = [];
    for (var id of Object.keys(this.plugins)) {
      var p = this.plugins[id];
      list.push({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        author: p.author,
        enabled: p.enabled || false,
        toolCount: (p.tools || []).length
      });
    }
    return list;
  }

  /**
   * 获取配置
   */
  getConfig() {
    return {
      plugins: this.getPlugins(),
      customTools: this.getCustomTools(),
      pluginDir: PLUGINS_DIR
    };
  }
}

var instance = null;
function getInstance() {
  if (!instance) instance = new PluginSystem();
  return instance;
}

module.exports = { PluginSystem, getInstance };
