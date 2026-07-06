/**
 * eCompany Metrics — 真实指标采集与监控
 * 
 * Harness 核心模块：采集实时 token 用量、延迟、工具调用、错误率
 * 替代原来"总数×350"的估算方式
 */

const fs = require('fs');
const path = require('path');

const METRICS_PATH = path.join(__dirname, '..', 'metrics.json');
const MAX_SAMPLES = 10000;      // 最多保留的采样数
const WINDOW_MINUTES = 60;      // 滚动窗口（分钟）
const ALERT_THRESHOLDS = {
  errorRate: 0.15,              // 错误率 >15% 告警
  avgLatency: 30000,            // 平均延迟 >30s 告警
  tokensPerTask: 50000,         // 单任务 token >50k 告警
  circuitBreakerTrips: 3        // 熔断触发 >3次/小时 告警
};

class MetricsCollector {
  constructor() {
    this.samples = [];
    this.alerts = [];
    this.load();
  }

  // ========== 数据加载与持久化 ==========

  load() {
    try {
      const raw = fs.readFileSync(METRICS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      this.samples = data.samples || [];
      this.alerts = data.alerts || [];
    } catch (e) {
      this.samples = [];
      this.alerts = [];
    }
  }

  save() {
    try {
      // 只保留 window 内的样本
      const cutoff = Date.now() - WINDOW_MINUTES * 60 * 1000;
      this.samples = this.samples.filter(s => s.ts > cutoff);
      if (this.samples.length > MAX_SAMPLES) {
        this.samples = this.samples.slice(-MAX_SAMPLES);
      }
      if (this.alerts.length > 200) {
        this.alerts = this.alerts.slice(-200);
      }
      fs.writeFileSync(METRICS_PATH, JSON.stringify({
        samples: this.samples,
        alerts: this.alerts,
        lastUpdated: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch (e) { /* silently fail */ }
  }

  // ========== 采样记录 ==========

  /**
   * 记录一次工具调用
   */
  recordToolCall({ agentId, toolName, startTime, endTime, success, tokensUsed, error }) {
    const sample = {
      ts: startTime,
      type: 'tool_call',
      agentId: agentId || 'unknown',
      toolName: toolName || 'unknown',
      latency: endTime - startTime,
      success: !!success,
      tokensUsed: tokensUsed || 0,
      error: error || null
    };
    this.samples.push(sample);
    this.checkThresholds(sample);
    this.save();
  }

  /**
   * 记录一次任务完成
   */
  recordTask({ taskId, agentId, status, tokensUsed, latency, keepRate }) {
    const sample = {
      ts: Date.now(),
      type: 'task',
      taskId,
      agentId: agentId || 'unknown',
      status: status || 'unknown',
      tokensUsed: tokensUsed || 0,
      latency: latency || 0,
      keepRate: keepRate !== undefined ? keepRate : null
    };
    this.samples.push(sample);
    this.save();
  }

  /**
   * 记录一次 CEO 循环
   */
  recordCEOCycle({ rounds, tokensUsed, latency, success, error }) {
    const sample = {
      ts: Date.now(),
      type: 'ceo_cycle',
      rounds: rounds || 0,
      tokensUsed: tokensUsed || 0,
      latency: latency || 0,
      success: !!success,
      error: error || null
    };
    this.samples.push(sample);
    this.checkThresholds(sample);
    this.save();
  }

  /**
   * 记录模型调用
   */
  recordModelCall({ provider, model, latency, tokensUsed, success, error }) {
    const sample = {
      ts: Date.now(),
      type: 'model_call',
      provider: provider || 'unknown',
      model: model || 'unknown',
      latency: latency || 0,
      tokensUsed: tokensUsed || 0,
      success: !!success,
      error: error || null
    };
    this.samples.push(sample);
    this.save();
  }

  // ========== 告警检测 ==========

  checkThresholds(sample) {
    const window = this.getWindowSamples();
    const now = Date.now();

    // 错误率
    if (sample.type !== 'task' && !sample.success) {
      const recentErrors = window.filter(s => !s.success && s.type !== 'task').length;
      const recentTotal = window.filter(s => s.type !== 'task').length;
      if (recentTotal > 10 && (recentErrors / recentTotal) > ALERT_THRESHOLDS.errorRate) {
        this.raiseAlert('error_rate_high', {
          rate: (recentErrors / recentTotal).toFixed(3),
          samples: recentTotal,
          message: `错误率 ${(recentErrors / recentTotal * 100).toFixed(1)}%（阈值 ${ALERT_THRESHOLDS.errorRate * 100}%）`
        });
      }
    }

    // 延迟
    if (sample.latency > ALERT_THRESHOLDS.avgLatency) {
      this.raiseAlert('latency_high', {
        latency: sample.latency,
        type: sample.type,
        message: `${sample.type} 延迟 ${(sample.latency / 1000).toFixed(1)}s（阈值 ${ALERT_THRESHOLDS.avgLatency / 1000}s）`
      });
    }
  }

  raiseAlert(type, data) {
    const exists = this.alerts.some(a => a.type === type && (Date.now() - a.ts) < 300000);
    if (exists) return; // 5分钟内不重复告警
    this.alerts.push({
      ts: Date.now(),
      type,
      data,
      acknowledged: false
    });
  }

  // ========== 查询接口 ==========

  /**
   * 获取当前窗口内所有样本
   */
  getWindowSamples() {
    const cutoff = Date.now() - WINDOW_MINUTES * 60 * 1000;
    return this.samples.filter(s => s.ts > cutoff);
  }

  /**
   * 获取聚合统计
   */
  getStats() {
    const window = this.getWindowSamples();

    // 按类型分组
    const toolCalls = window.filter(s => s.type === 'tool_call');
    const tasks = window.filter(s => s.type === 'task');
    const modelCalls = window.filter(s => s.type === 'model_call');

    // 计算指标
    const totalTokens = window.reduce((sum, s) => sum + (s.tokensUsed || 0), 0);
    const totalErrors = window.filter(s => !s.success).length;
    const totalSamples = window.length;
    const errorRate = totalSamples > 0 ? (totalErrors / totalSamples) : 0;

    const avgLatency = toolCalls.length > 0
      ? toolCalls.reduce((sum, s) => sum + s.latency, 0) / toolCalls.length
      : 0;

    const avgTokensPerTask = tasks.length > 0
      ? tasks.reduce((sum, s) => sum + (s.tokensUsed || 0), 0) / tasks.length
      : 0;

    // 按工具统计
    const toolStats = {};
    toolCalls.forEach(s => {
      if (!toolStats[s.toolName]) toolStats[s.toolName] = { calls: 0, errors: 0, totalLatency: 0 };
      toolStats[s.toolName].calls++;
      if (!s.success) toolStats[s.toolName].errors++;
      toolStats[s.toolName].totalLatency += s.latency;
    });

    // 按模型统计
    const modelStats = {};
    modelCalls.forEach(s => {
      if (!modelStats[s.model]) modelStats[s.model] = { calls: 0, errors: 0, totalTokens: 0, totalLatency: 0 };
      modelStats[s.model].calls++;
      if (!s.success) modelStats[s.model].errors++;
      modelStats[s.model].totalTokens += s.tokensUsed || 0;
      modelStats[s.model].totalLatency += s.latency;
    });

    // 未确认告警
    const activeAlerts = this.alerts.filter(a => !a.acknowledged);

    return {
      windowMinutes: WINDOW_MINUTES,
      totalSamples,
      totalTokens,
      errorRate,
      avgLatency,
      avgTokensPerTask,
      toolStats: Object.entries(toolStats).map(([name, stats]) => ({
        name,
        calls: stats.calls,
        errors: stats.errors,
        errorRate: stats.calls > 0 ? (stats.errors / stats.calls) : 0,
        avgLatency: stats.calls > 0 ? (stats.totalLatency / stats.calls) : 0
      })),
      modelStats: Object.entries(modelStats).map(([model, stats]) => ({
        model,
        calls: stats.calls,
        errors: stats.errors,
        totalTokens: stats.totalTokens,
        avgLatency: stats.calls > 0 ? (stats.totalLatency / stats.calls) : 0
      })),
      activeAlerts: activeAlerts.map(a => ({
        type: a.type,
        ts: a.ts,
        data: a.data
      })),
      cost: this.estimateCost(totalTokens, modelCalls)
    };
  }

  /**
   * 估算成本（基于 DeepSeek V4 Flash 价格）
   */
  estimateCost(totalTokens, modelCalls) {
    // 默认价格：input $0.14/M tokens, output $0.28/M tokens
    const inputPrice = 0.14;
    const outputPrice = 0.28;
    // 粗略假设 input:output = 3:1
    const inputTokens = Math.round(totalTokens * 0.75);
    const outputTokens = totalTokens - inputTokens;
    const cost = (inputTokens / 1000000 * inputPrice) + (outputTokens / 1000000 * outputPrice);
    return {
      inputTokens,
      outputTokens,
      estimatedCost: parseFloat(cost.toFixed(4)),
      detail: modelCalls.map(s => ({
        model: s.model,
        tokens: s.tokensUsed || 0,
        success: s.success
      }))
    };
  }

  /**
   * 获取最近告警
   */
  getAlerts(limit = 20) {
    return this.alerts.slice(-limit).reverse();
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(index) {
    if (this.alerts[index]) {
      this.alerts[index].acknowledged = true;
      this.save();
      return true;
    }
    return false;
  }
}

// 单例
const metrics = new MetricsCollector();
module.exports = metrics;
module.exports.MetricsCollector = MetricsCollector;
module.exports.ALERT_THRESHOLDS = ALERT_THRESHOLDS;
