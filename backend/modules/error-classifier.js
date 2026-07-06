/**
 * eCompany Error Classifier — 错误分类与沉淀
 * 
 * Harness 核心模块：6 类错误分级、失败案例沉淀、晋升为已知错误的机制
 * 
 * 分类体系：
 *   E1 模型传错参数 — 模型侧推理错误
 *   E2 工具环境不对 — 执行环境/配置问题  
 *   E3 Provider 出问题 — API 调用失败/超时
 *   E4 超时 — 超过等待时间
 *   E5 用户主动中断 — 用户手动取消
 *   E9 未知错误 — 需要人工判定
 */

const fs = require('fs');
const path = require('path');

const ERROR_CASES_PATH = path.join(__dirname, '..', 'error-cases.json');
const MAX_CASES = 500;

class ErrorClassifier {
  constructor() {
    this.cases = [];       // 已知错误模式库
    this.pending = [];     // 待分类的未知错误
    this.load();
  }

  // ========== 持久化 ==========

  load() {
    try {
      const raw = fs.readFileSync(ERROR_CASES_PATH, 'utf-8');
      const data = JSON.parse(raw);
      this.cases = data.cases || [];
      this.pending = data.pending || [];
      this.stats = data.stats || { total: 0, byType: {}, byTool: {} };
    } catch (e) {
      this.cases = [];
      this.pending = [];
      this.stats = { total: 0, byType: {}, byTool: {} };
    }
  }

  save() {
    try {
      if (this.cases.length > MAX_CASES) {
        this.cases = this.cases.slice(-MAX_CASES);
      }
      if (this.pending.length > 200) {
        this.pending = this.pending.slice(-200);
      }
      fs.writeFileSync(ERROR_CASES_PATH, JSON.stringify({
        cases: this.cases,
        pending: this.pending,
        stats: this.stats,
        lastUpdated: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch (e) { /* silently fail */ }
  }

  // ========== 分类逻辑 ==========

  /**
   * 错误类型枚举
   */
  static get TYPES() {
    return {
      E1: { code: 'E1', name: '严重错误', severity: 4, description: '系统崩溃、数据丢失、OOM' },
      E2: { code: 'E2', name: '功能性错误', severity: 3, description: '核心功能不可用，工具调用失败' },
      E3: { code: 'E3', name: '业务逻辑错误', severity: 3, description: '逻辑错误、计算错误' },
      E4: { code: 'E4', name: 'API 错误', severity: 2, description: '外部 API 调用失败、Provider 问题' },
      E5: { code: 'E5', name: '权限错误', severity: 3, description: '权限不足、鉴权失败、API Key 无效' },
      E6: { code: 'E6', name: '参数错误', severity: 1, description: '输入参数格式错误' },
      E7: { code: 'E7', name: '超时错误', severity: 1, description: '操作超过等待时间' },
      E8: { code: 'E8', name: '限流错误', severity: 1, description: '超出频率限制' },
      E9: { code: 'E9', name: '未知错误', severity: 2, description: '无法自动分类的错误，需人工判定' }
    };
  }

  /**
   * 自动分类一条错误
   * @param {object} err - { message, toolName, provider, stack }
   * @returns {{ code, name, severity, confidence, matchedCase }}
   */
  classify(err) {
    const msg = (err.message || '').toLowerCase();
    const tool = (err.toolName || '').toLowerCase();

    // 1. 检查是否匹配已知错误模式
    const matched = this._matchKnownCase(err);
    if (matched) {
      return { ...matched, matchedCase: matched };
    }

    // 2. 启发式分类
    if (this._match(msg, ['timeout', 'timed out', 'abort', 'aborted'])) {
      return { code: 'E4', name: '超时', severity: 2, confidence: 0.8 };
    }
    if (this._match(msg, ['user', 'cancel', 'interrupt', '手动'])) {
      return { code: 'E5', name: '用户主动中断', severity: 0, confidence: 0.9 };
    }
    if (this._match(msg, ['api key', 'unauthorized', '401', '403', 'rate limit', '429', 'insufficient_quota'])) {
      return { code: 'E3', name: 'Provider 出问题', severity: 1, confidence: 0.85 };
    }
    if (this._match(msg, ['connect', 'econnrefused', 'econnreset', 'enotfound', 'dns', 'timeout'])) {
      return { code: 'E3', name: 'Provider 出问题', severity: 1, confidence: 0.75 };
    }
    if (this._match(msg, ['enoent', 'eacces', 'eisdir', 'not found', 'permission', 'access denied'])) {
      return { code: 'E2', name: '工具环境不对', severity: 3, confidence: 0.85 };
    }
    if (this._match(msg, ['parameter', 'argument', 'required', 'invalid', 'format']) || 
        this._match(tool, ['write_file', 'read_file', 'search_web'])) {
      return { code: 'E1', name: '模型传错参数', severity: 2, confidence: 0.6 };
    }

    // 3. 无法分类 → 未知错误，加入待分类队列
    this.pending.push({
      ts: Date.now(),
      error: {
        message: err.message,
        toolName: err.toolName,
        provider: err.provider,
        stack: (err.stack || '').slice(0, 500)
      }
    });
    this.save();

    return { code: 'E9', name: '未知错误', severity: 4, confidence: 0.1 };
  }

  /**
   * 匹配已知错误模式
   */
  _matchKnownCase(err) {
    const msg = (err.message || '').toLowerCase();
    for (const c of this.cases) {
      if (c.patterns && c.patterns.some(p => msg.includes(p.toLowerCase()))) {
        if (!c.lastHit) c.lastHit = Date.now();
        c.lastHit = Date.now();
        c.hitCount = (c.hitCount || 0) + 1;
        this.save();
        return { code: c.code, name: c.name, severity: c.severity, confidence: 0.95 };
      }
    }
    return null;
  }

  _match(text, patterns) {
    return patterns.some(p => text.includes(p));
  }

  // ========== 错误案例管理 ==========

  /**
   * 添加一条已知错误模式（将 E9 晋升为有名字的错误）
   */
  addKnownCase({ code, name, severity, patterns, description }) {
    this.cases.push({
      id: 'case_' + Date.now(),
      code: code || 'E9',
      name: name || '自定义错误',
      severity: severity || 2,
      patterns: patterns || [],
      description: description || '',
      hitCount: 0,
      createdAt: Date.now(),
      lastHit: null
    });
    this.save();
  }

  /**
   * 获取待分类的未知错误
   */
  getPendingErrors() {
    return this.pending;
  }

  /**
   * 确认一条待分类错误（从 pending 移除）
   */
  acknowledgePending(index) {
    if (this.pending[index]) {
      this.pending.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 更新统计
   */
  recordError(cls) {
    this.stats.total++;
    if (!this.stats.byType[cls.code]) this.stats.byType[cls.code] = 0;
    this.stats.byType[cls.code]++;
    this.save();
  }

  // ========== 查询 ==========

  /**
   * 获取错误分类统计
   */
  getStats() {
    return {
      ...this.stats,
      knownCases: this.cases.length,
      pendingCount: this.pending.length,
      breakdown: Object.entries(ErrorClassifier.TYPES).map(([code, info]) => ({
        code,
        name: info.name,
        severity: info.severity,
        count: this.stats.byType[code] || 0,
        pct: this.stats.total > 0 ? (((this.stats.byType[code] || 0) / this.stats.total) * 100).toFixed(1) + '%' : '0%'
      })),
      recentPending: this.pending.slice(-10).reverse().map(p => ({
        time: new Date(p.ts).toISOString(),
        message: (p.error.message || '').slice(0, 100),
        toolName: p.error.toolName
      }))
    };
  }
}

module.exports = ErrorClassifier;
