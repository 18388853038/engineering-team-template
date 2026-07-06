/**
 * Error Sink - 错误沉淀与案例库
 * 
 * 机制：
 * 1. 错误捕获 → 分类 (E1-E9)
 * 2. 相似错误聚合 → 生成案例
 * 3. 案例 → 建议修复方案
 * 4. 修复方案 → 标记已处理
 * 5. 统计报告
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'error-sink-data.json');

class ErrorSink {
  constructor() {
    this.data = this._load();
    this.levels = {
      E1: { name: '严重错误', description: '系统崩溃、数据丢失', autoResolve: false },
      E2: { name: '功能性错误', description: '核心功能不可用', autoResolve: false },
      E3: { name: '业务逻辑错误', description: '逻辑错误、计算错误', autoResolve: false },
      E4: { name: 'API 错误', description: '外部 API 调用失败', autoResolve: true },
      E5: { name: '权限错误', description: '权限不足、鉴权失败', autoResolve: false },
      E6: { name: '参数错误', description: '输入参数格式错误', autoResolve: true },
      E7: { name: '超时错误', description: '操作超时', autoResolve: true },
      E8: { name: '限流错误', description: '超出频率限制', autoResolve: true },
      E9: { name: '未知错误', description: '未分类的异常', autoResolve: false }
    };
  }

  _load() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch(e) { return this._default(); }
  }

  _save() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(this.data), 'utf-8'); } catch(e) {}
  }

  _default() {
    return { errors: [], cases: [], stats: { byLevel: {}, byTool: {} }, updatedAt: new Date().toISOString() };
  }

  /**
   * 记录错误
   */
  record(errorInfo) {
    if (!errorInfo) return null;

    var level = errorInfo.level || this._classify(errorInfo);
    
    var error = {
      id: 'err_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      level: level,
      tool: errorInfo.tool || 'unknown',
      message: (errorInfo.message || '').substring(0, 200),
      context: errorInfo.context || {},
      stack: (errorInfo.stack || '').substring(0, 300),
      status: 'open',
      similarCaseId: null,
      timestamp: new Date().toISOString()
    };

    this.data.errors.push(error);
    if (this.data.errors.length > 500) this.data.errors = this.data.errors.slice(-500);

    // 更新统计
    this.data.stats.byLevel[level] = (this.data.stats.byLevel[level] || 0) + 1;
    this.data.stats.byTool[errorInfo.tool] = (this.data.stats.byTool[errorInfo.tool] || 0) + 1;

    // 尝试聚合到已有案例
    var similarCase = this._findSimilarCase(error);
    if (similarCase) {
      similarCase.relatedErrors.push(error.id);
      similarCase.errorCount = (similarCase.errorCount || 0) + 1;
      similarCase.lastOccurrence = error.timestamp;
      error.similarCaseId = similarCase.id;
    } else {
      // 创建新案例
      this._createCase(error);
    }

    this.data.updatedAt = new Date().toISOString();
    this._save();
    return error;
  }

  /**
   * 错误分级
   */
  _classify(info) {
    var msg = (info.message || '').toLowerCase();
    var tool = (info.tool || '').toLowerCase();

    if (msg.includes('crash') || msg.includes('崩溃') || msg.includes('oom') || msg.includes('out of memory')) return 'E1';
    if (msg.includes('timeout') || msg.includes('超时')) return 'E7';
    if (msg.includes('permission') || msg.includes('权限') || msg.includes('auth') || msg.includes('denied')) return 'E5';
    if (msg.includes('rate limit') || msg.includes('限流') || msg.includes('too many')) return 'E8';
    if (msg.includes('not found') || msg.includes('不存在') || msg.includes('404')) return 'E6';
    if (msg.includes('api') || msg.includes('fetch') || msg.includes('connection') || msg.includes('连接') || msg.includes('http')) return 'E4';
    if (msg.includes('逻辑') || msg.includes('逻辑') || msg.includes('invalid') || msg.includes('unexpected')) return 'E3';
    if (msg.includes('参数') || msg.includes('param') || msg.includes('invalid')) return 'E6';
    return 'E9';
  }

  /**
   * 查找相似案例
   */
  _findSimilarCase(error) {
    for (var i = 0; i < this.data.cases.length; i++) {
      var c = this.data.cases[i];
      if (c.level === error.level && c.tool === error.tool && c.status !== 'resolved') {
        // 检查消息相似度
        var words1 = (error.message || '').split(' ').filter(Boolean);
        var words2 = (c.sampleMessage || '').split(' ').filter(Boolean);
        var overlap = words1.filter(function(w) { return words2.indexOf(w) > -1; }).length;
        var similarity = Math.max(words1.length, words2.length) > 0 ? overlap / Math.max(words1.length, words2.length) : 0;
        if (similarity > 0.3) return c;
      }
    }
    return null;
  }

  /**
   * 创建案例
   */
  _createCase(error) {
    var c = {
      id: 'case_' + Date.now().toString(36),
      level: error.level,
      tool: error.tool,
      sampleMessage: error.message,
      sampleStack: error.stack,
      description: this.levels[error.level] ? this.levels[error.level].name + ': ' + (error.message || '').substring(0, 100) : error.message,
      autoResolvable: this.levels[error.level] ? this.levels[error.level].autoResolve : false,
      suggestion: this._generateSuggestion(error),
      status: 'open',
      severity: this._levelToSeverity(error.level),
      errorCount: 1,
      relatedErrors: [error.id],
      firstOccurrence: error.timestamp,
      lastOccurrence: error.timestamp,
      createdAt: new Date().toISOString()
    };
    this.data.cases.push(c);
    if (this.data.cases.length > 200) this.data.cases = this.data.cases.slice(-200);
    error.similarCaseId = c.id;
    return c;
  }

  /**
   * 生成修复建议
   */
  _generateSuggestion(error) {
    var level = error.level || 'E9';
    var msg = (error.message || '').toLowerCase();
    var suggestions = [];
    
    if (level === 'E1') suggestions.push('立即检查服务器状态，重启服务');
    if (level === 'E2') suggestions.push('检查功能模块的配置和依赖');
    if (level === 'E3') suggestions.push('审查相关代码逻辑，添加边界检查');
    if (level === 'E4') suggestions.push('检查 API 地址和网络连接');
    if (level === 'E5') suggestions.push('检查用户权限和 API Key 配置');
    if (level === 'E6') suggestions.push('验证输入参数格式');
    if (level === 'E7') suggestions.push('检查网络连接，考虑增加超时时间');
    if (level === 'E8') suggestions.push('降低请求频率，增加限流间隔');
    
    if (msg.includes('fetch') || msg.includes('network')) suggestions.push('检查网络连接和目标服务是否可达');
    if (msg.includes('api key') || msg.includes('token')) suggestions.push('检查 API Key 是否有效');
    if (msg.includes('timeout')) suggestions.push('考虑增加超时配置或优化响应速度');
    if (msg.includes('circuit')) suggestions.push('熔断器已触发，等待自动恢复');
    
    if (suggestions.length === 0) suggestions.push('未知错误，需人工排查');
    
    return suggestions.join('；');
  }

  _levelToSeverity(level) {
    return { E1: 'critical', E2: 'high', E3: 'medium', E4: 'medium', E5: 'high', E6: 'low', E7: 'low', E8: 'low', E9: 'unknown' }[level] || 'unknown';
  }

  /**
   * 解决案例
   */
  resolveCase(caseId, resolution) {
    for (var i = 0; i < this.data.cases.length; i++) {
      if (this.data.cases[i].id === caseId) {
        this.data.cases[i].status = 'resolved';
        this.data.cases[i].resolvedAt = new Date().toISOString();
        this.data.cases[i].resolution = resolution || '已处理';
        this._save();
        return this.data.cases[i];
      }
    }
    return null;
  }

  /**
   * 获取统计
   */
  getStats() {
    var cases = this.data ? this.data.cases : (this.cases || []);
    var errors = this.data ? this.data.errors : (this.errors || []);
    var stats = this.data ? this.data.stats : (this.stats || {});
    var openCases = cases.filter(function(c) { return c.status === 'open'; }).length;
    var resolvedCases = cases.filter(function(c) { return c.status === 'resolved'; }).length;
    var totalCases = cases.length;
    
    return {
      totalErrors: errors.length,
      totalCases: totalCases,
      openCases: openCases,
      resolvedCases: resolvedCases,
      resolveRate: totalCases > 0 ? Math.round(resolvedCases / totalCases * 100) + '%' : '0%',
      byLevel: stats.byLevel || {},
      byTool: stats.byTool || {},
      recentCases: cases.slice(-5).map(function(c) {
        return { id: c.id, level: c.level, message: (c.sampleMessage || '').substring(0, 60), status: c.status, errorCount: c.errorCount };
      })
    };
  }

  /**
   * 获取所有案例
   */
  getCases(limit) {
    limit = limit || 20;
    return this.data.cases.slice(-limit).reverse();
  }

  /**
   * 获取所有错误
   */
  getErrors(limit) {
    limit = limit || 50;
    return this.data.errors.slice(-limit).reverse();
  }

  /**
   * 获取待处理错误（未聚合到案例的孤立错误）
   */
  getPendingErrors() {
    return this.data.errors.filter(function(e) { return !e.similarCaseId; });
  }

  /**
   * 自动创建改进工单
   */
  autoCreateTicket() {
    var tickets = [];
    var caseCounts = {};
    var cases = this.data ? this.data.cases : (this.cases || []);
    
    // Count errors by type
    for (var c of cases) {
      var level = c.level || 'E9';
      if (!caseCounts[level]) caseCounts[level] = { count: 0, messages: [] };
      caseCounts[level].count += (c.errorCount || 1);
      if (caseCounts[level].messages.length < 3) {
        caseCounts[level].messages.push((c.sampleMessage || '').substring(0, 50));
      }
    }
    
    var now = new Date().toISOString();
    
    // Auto-ticket thresholds: E1>=1, E7>=3, E9>=2, others>=5
    var thresholds = { E1: 1, E7: 3, E9: 2, E2: 5, E3: 5, E4: 5, E5: 5, E6: 5, E8: 5 };
    
    for (var level of Object.keys(caseCounts)) {
      var data = caseCounts[level];
      var threshold = thresholds[level] || 5;
      if (data.count >= threshold) {
        tickets.push({
          title: '自动工单: E' + level + ' 错误累积 ' + data.count + ' 次',
          description: '错误类型: ' + level + '\n累计次数: ' + data.count + '\n示例: ' + data.messages.join('; '),
          priority: level === 'E1' ? 'high' : (level === 'E7' || level === 'E9' ? 'medium' : 'low'),
          status: 'pending',
          creator: 'system',
          tags: ['auto_ticket', 'error_' + level],
          createdAt: now
        });
      }
    }
    
    return tickets;
  }

  /**
   * 获取趋势数据
   */
  getTrendStats() {
    var trend = [];
    var byDay = {};
    var cases = this.data ? this.data.cases : (this.cases || []);
    var stats = this.data ? this.data.stats : (this.stats || {});
    for (var c of cases) {
      var day = (c.lastOccurrence || c.firstOccurrence || '').substring(0, 10);
      if (!day) continue;
      if (!byDay[day]) byDay[day] = { total: 0, byLevel: {}, resolved: 0 };
      byDay[day].total += (c.errorCount || 1);
      var level = c.level || 'E9';
      byDay[day].byLevel[level] = (byDay[day].byLevel[level] || 0) + (c.errorCount || 1);
      if (c.status === 'resolved') byDay[day].resolved++;
    }
    var sortedDays = Object.keys(byDay).sort();
    for (var day of sortedDays) {
      trend.push({ date: day, ...byDay[day] });
    }
    return {
      trend: trend,
      totalCases: cases.length,
      byLevel: stats.byLevel || {},
      byTool: stats.byTool || {}
    };
  }
}

// Prototype extensions (added outside class)
ErrorSink.prototype.autoCreateTicket = function() {
  var tickets = [];
  var caseCounts = {};
  for (var c of (this.cases || [])) {
    var level = c.level || 'E9';
    if (!caseCounts[level]) caseCounts[level] = { count: 0, messages: [] };
    caseCounts[level].count += (c.errorCount || 1);
    if (caseCounts[level].messages.length < 3) {
      caseCounts[level].messages.push((c.sampleMessage || '').substring(0, 50));
    }
  }
  var thresholds = { E1: 1, E7: 3, E9: 2, E2: 5, E3: 5, E4: 5, E5: 5, E6: 5, E8: 5 };
  for (var level of Object.keys(caseCounts)) {
    var data = caseCounts[level];
    var threshold = thresholds[level] || 5;
    if (data.count >= threshold) {
      tickets.push({
        title: '自动工单: ' + level + ' 错误累积 ' + data.count + ' 次',
        description: '错误类型: ' + level + '\n累计次数: ' + data.count + '\n示例: ' + data.messages.join('; '),
        priority: level === 'E1' ? 'high' : (level === 'E7' || level === 'E9' ? 'medium' : 'low'),
        status: 'pending',
        creator: 'system',
        tags: ['auto_ticket', 'error_' + level],
        createdAt: new Date().toISOString()
      });
    }
  }
  return tickets;
};

module.exports = ErrorSink;
