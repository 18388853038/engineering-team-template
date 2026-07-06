/**
 * eCompany API Middleware — 统一日志、监控、限流
 * 
 * Harness 核心模块：为所有 API 请求提供中间件支持
 * 统一记录请求日志、注入监控指标、限流保护
 */

const metrics = require('./metrics');

// ========== 配置 ==========

const DEFAULTS = {
  rateLimit: {
    windowMs: 60000,           // 1分钟窗口
    maxRequests: 100,          // 每分钟最大请求数
    maxPerEndpoint: 20         // 每端点每分钟最大请求数
  },
  logBodyMax: 500,             // 日志中 body 最大长度
  slowRequestMs: 5000          // 慢请求阈值（毫秒）
};

// ========== 请求追踪 ==========

class RequestTracker {
  constructor() {
    this.counts = {};           // endpoint -> count[]
    this.totalCounts = {};
    this.ipCounts = {};
  }

  /**
   * 检查是否超过限流
   */
  checkRateLimit(endpoint, clientIp) {
    const now = Date.now();
    const window = DEFAULTS.rateLimit.windowMs;

    // 端点级别
    if (!this.counts[endpoint]) this.counts[endpoint] = [];
    this.counts[endpoint] = this.counts[endpoint].filter(t => now - t < window);
    
    if (this.counts[endpoint].length >= DEFAULTS.rateLimit.maxPerEndpoint) {
      return { limited: true, reason: 'endpoint', current: this.counts[endpoint].length };
    }

    // IP 级别
    if (!this.ipCounts[clientIp]) this.ipCounts[clientIp] = [];
    this.ipCounts[clientIp] = this.ipCounts[clientIp].filter(t => now - t < window);

    if (this.ipCounts[clientIp].length >= DEFAULTS.rateLimit.maxRequests) {
      return { limited: true, reason: 'ip', current: this.ipCounts[clientIp].length };
    }

    this.counts[endpoint].push(now);
    this.ipCounts[clientIp].push(now);
    return { limited: false };
  }

  /**
   * 获取请求统计
   */
  getStats() {
    const now = Date.now();
    const window = DEFAULTS.rateLimit.windowMs;

    const activeEndpoints = Object.keys(this.counts).map(endpoint => ({
      endpoint,
      requests: this.counts[endpoint].filter(t => now - t < window).length
    })).filter(e => e.requests > 0).sort((a, b) => b.requests - a.requests);

    return {
      activeEndpoints: activeEndpoints.slice(0, 20),
      totalTracked: Object.keys(this.counts).length,
      rateLimit: DEFAULTS.rateLimit
    };
  }
}

// ========== API 中间件 ==========

class ApiMiddleware {
  constructor() {
    this.tracker = new RequestTracker();
    this.hooks = {
      beforeRequest: [],
      afterRequest: [],
      onError: []
    };
  }

  /**
   * 注册前置钩子
   */
  before(fn) {
    this.hooks.beforeRequest.push(fn);
  }

  /**
   * 注册后置钩子
   */
  after(fn) {
    this.hooks.afterRequest.push(fn);
  }

  /**
   * 注册错误钩子
   */
  onError(fn) {
    this.hooks.onError.push(fn);
  }

  /**
   * 处理请求（由 server-modern.js 调用）
   */
  async process(req, res, handler) {
    const startTime = Date.now();
    const endpoint = req.url || '/';
    const method = req.method || 'GET';
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    // 1. 限流检查
    const limit = this.tracker.checkRateLimit(endpoint, clientIp);
    if (limit.limited) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'rate_limited',
        reason: limit.reason,
        message: '请求过于频繁，请稍后重试',
        retryAfter: Math.ceil(DEFAULTS.rateLimit.windowMs / 1000)
      }));

      metrics.recordToolCall({
        agentId: 'middleware',
        toolName: 'rate_limiter',
        startTime,
        endTime: Date.now(),
        success: false,
        tokensUsed: 0,
        error: 'rate_limited:' + limit.reason
      });
      return;
    }

    // 2. 执行前置钩子
    for (const hook of this.hooks.beforeRequest) {
      try { hook({ req, res, endpoint, method, clientIp }); }
      catch(e) { /* silently continue */ }
    }

    // 3. 记录请求日志
    const logEntry = {
      ts: new Date().toISOString(),
      method,
      endpoint,
      clientIp,
      reqBodyPreview: ''
    };

    // 4. 执行实际 handler
    try {
      await handler(req, res);

      // 5. 后置处理
      const latency = Date.now() - startTime;
      
      // 记录指标
      metrics.recordToolCall({
        agentId: 'middleware',
        toolName: 'api_request',
        startTime,
        endTime: Date.now(),
        success: true,
        tokensUsed: 0,
        error: null
      });

      // 慢请求告警
      if (latency > DEFAULTS.slowRequestMs) {
        metrics.raiseAlert('slow_request', {
          endpoint,
          method,
          latency,
          message: method + ' ' + endpoint + ' 响应慢 (' + (latency/1000).toFixed(1) + 's)'
        });
      }

      // 记录慢日志
      logEntry.latency = latency;

      // 6. 执行后置钩子
      for (const hook of this.hooks.afterRequest) {
        try { hook({ req, res, endpoint, method, latency, logEntry }); }
        catch(e) {}
      }

    } catch (err) {
      // 错误处理
      const latency = Date.now() - startTime;
      logEntry.error = err.message;

      metrics.recordToolCall({
        agentId: 'middleware',
        toolName: 'api_request',
        startTime,
        endTime: Date.now(),
        success: false,
        tokensUsed: 0,
        error: err.message
      });

      for (const hook of this.hooks.onError) {
        try { hook({ req, res, endpoint, method, error: err }); }
        catch(e) {}
      }

      // 不要吞掉错误，让上层处理
      throw err;
    }

    return logEntry;
  }

  /**
   * 生成响应包装函数（替代原始 json()）
   */
  wrapJson(originalJson) {
    return (res, data, status) => {
      // 记录响应大小
      const bodyStr = JSON.stringify(data);
      res.setHeader('X-Response-Size', bodyStr.length);
      res.setHeader('X-Harness', 'active');
      return originalJson(res, data, status);
    };
  }

  /**
   * 获取中间件状态
   */
  getStatus() {
    return {
      rateLimit: DEFAULTS.rateLimit,
      hooks: {
        beforeRequest: this.hooks.beforeRequest.length,
        afterRequest: this.hooks.afterRequest.length,
        onError: this.hooks.onError.length
      },
      tracker: this.tracker.getStats()
    };
  }
}

module.exports = ApiMiddleware;
module.exports.RequestTracker = RequestTracker;
module.exports.DEFAULTS = DEFAULTS;
