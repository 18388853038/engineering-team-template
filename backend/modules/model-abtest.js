/**
 * 模型 A/B 测试路由
 * 支持按比例分流、按任务类型分配、实验结果追踪
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'abtest-config.json');

class ModelABTest {
  constructor() {
    this.config = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch(e) {}
    return { experiments: [], activeExperiment: null };
  }

  _save() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch(e) {}
  }

  /**
   * 创建实验
   */
  createExperiment(name, variants) {
    var exp = {
      id: 'exp_' + Date.now(),
      name: name,
      variants: variants || [],
      trafficSplit: 50,  // % to variant B
      status: 'draft',
      createdAt: new Date().toISOString(),
      results: { total: 0, byVariant: {} }
    };
    
    for (var v of exp.variants) {
      exp.results.byVariant[v.id || v.name] = { calls: 0, success: 0, failed: 0, avgLatency: 0, totalLatency: 0 };
    }
    
    this.config.experiments.push(exp);
    this._save();
    return exp;
  }

  /**
   * 选择模型（考虑 A/B 分流）
   */
  selectModel(taskDescription, defaultProvider, defaultModel) {
    var active = null;
    for (var e of this.config.experiments) {
      if (e.status === 'active') { active = e; break; }
    }
    
    if (!active || active.variants.length < 2) {
      return { provider: defaultProvider, model: defaultModel, experiment: null, variant: 'default' };
    }
    
    // Hash-based split for consistent routing
    var hash = 0;
    var str = taskDescription || '';
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    var useB = Math.abs(hash) % 100 < active.trafficSplit;
    
    var variant = useB ? active.variants[1] : active.variants[0];
    return {
      provider: variant.provider || defaultProvider,
      model: variant.model || defaultModel,
      experiment: active.id,
      variant: variant.name || (useB ? 'B' : 'A'),
      variantId: useB ? 1 : 0
    };
  }

  /**
   * 记录实验结果
   */
  recordResult(experimentId, variantId, success, latency) {
    var exp = this.config.experiments.find(function(e) { return e.id === experimentId; });
    if (!exp) return;
    
    var variants = Object.keys(exp.results.byVariant);
    var variantKey = variants[variantId];
    if (!variantKey) return;
    
    var stats = exp.results.byVariant[variantKey];
    stats.calls++;
    if (success) stats.success++; else stats.failed++;
    stats.totalLatency += latency || 0;
    stats.avgLatency = stats.totalLatency / stats.calls;
    exp.results.total++;
    
    this._save();
  }

  /**
   * 激活实验
   */
  activateExperiment(id) {
    var exp = this.config.experiments.find(function(e) { return e.id === id; });
    if (!exp) return null;
    // Deactivate all others
    for (var e of this.config.experiments) {
      if (e.id !== id) e.status = 'inactive';
    }
    exp.status = 'active';
    exp.activatedAt = new Date().toISOString();
    this._save();
    return exp;
  }

  /**
   * 停止实验（选胜出方）
   */
  concludeExperiment(id, winnerVariant) {
    var exp = this.config.experiments.find(function(e) { return e.id === id; });
    if (!exp) return null;
    exp.status = 'concluded';
    exp.concludedAt = new Date().toISOString();
    exp.winner = winnerVariant || null;
    this._save();
    return exp;
  }

  getExperiments() {
    return this.config.experiments;
  }

  getActiveExperiment() {
    return this.config.experiments.find(function(e) { return e.status === 'active'; }) || null;
  }
}

var instance = null;
function getInstance() {
  if (!instance) instance = new ModelABTest();
  return instance;
}

module.exports = { ModelABTest, getInstance };
