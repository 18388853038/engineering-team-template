/**
 * eCompany Tool Scheduler — 工具调用调度与熔断器
 * 
 * Harness 核心模块：限制工具调用频率、熔断机制、重试背压、Token Budget
 * 解决 CEO 循环无限制、无熔断、"8轮×60秒=最长8分钟无响应"问题
 */

const metrics = require('./metrics');

// ========== 配置 ==========

const DEFAULTS = {
  maxRoundsPerConversation: 15,      // 单次对话最大工具调用轮数
  maxTokensPerConversation: 100000,  // 单次对话最大 token 消耗
  maxTokensPerTool: 20000,           // 单次工具调用最大 token
  circuitBreakerThreshold: 5,        // 连续失败多少次后熔断
  circuitBreakerResetMs: 60000,      // 熔断后多久重置（60秒）
  toolTimeoutMs: 30000,              // 单个工具超时（30秒）
  retryMaxAttempts: 2,               // 失败最大重试次数
  retryBaseDelayMs: 1000,            // 重试基础延迟
  maxConcurrentTools: 3,             // 最大并发工具调用
  backpressureQueueSize: 20          // 背压队列大小
};

// ========== 状态追踪 ==========

class ToolState {
  constructor() {
    this.toolFailures = {};           // toolName -> consecutive failures
    this.circuitOpen = {};            // toolName -> true/false
    this.circuitOpenedAt = {};        // toolName -> timestamp
    this.roundCount = 0;              // 当前轮次
    this.tokenBudget = 0;             // 当前已用 token
    this.activeCalls = 0;             // 当前活跃调用数
    this.queue = [];                  // 背压队列
    this.history = [];                // 历史记录
    this.conversationStart = Date.now();
  }

  resetConversation() {
    this.roundCount = 0;
    this.tokenBudget = 0;
    this.queue = [];
    this.history = [];
    this.conversationStart = Date.now();
  }
}

// ========== 熔断器 ==========

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || DEFAULTS.circuitBreakerThreshold;
    this.resetMs = options.resetMs || DEFAULTS.circuitBreakerResetMs;
    this.state = new ToolState();
  }

  /**
   * 检查工具是否可用
   */
  isAvailable(toolName) {
    const state = this.state;
    if (state.circuitOpen[toolName]) {
      const elapsed = Date.now() - (state.circuitOpenedAt[toolName] || 0);
      if (elapsed > this.resetMs) {
        // 半开：允许一次试探
        state.circuitOpen[toolName] = false;
        delete state.circuitOpenedAt[toolName];
        state.toolFailures[toolName] = 0;
        return true;
      }
      return false; // 熔断中
    }
    return true;
  }

  /**
   * 记录成功
   */
  recordSuccess(toolName) {
    const state = this.state;
    state.toolFailures[toolName] = 0;
    state.circuitOpen[toolName] = false;
  }

  /**
   * 记录失败
   */
  recordFailure(toolName) {
    const state = this.state;
    state.toolFailures[toolName] = (state.toolFailures[toolName] || 0) + 1;
    if (state.toolFailures[toolName] >= this.threshold) {
      state.circuitOpen[toolName] = true;
      state.circuitOpenedAt[toolName] = Date.now();
      metrics.raiseAlert('circuit_breaker_tripped', {
        tool: toolName,
        failures: state.toolFailures[toolName],
        message: `工具 "${toolName}" 熔断器触发（连续 ${state.toolFailures[toolName]} 次失败）`
      });
      return true; // just tripped
    }
    return false;
  }

  /**
   * 获取熔断器状态
   */
  getStatus() {
    return {
      openTools: Object.entries(this.state.circuitOpen)
        .filter(([, open]) => open)
        .map(([name]) => ({
          name,
          openedAt: this.state.circuitOpenedAt[name],
          remainingMs: this.resetMs - (Date.now() - (this.state.circuitOpenedAt[name] || 0))
        })),
      failureCounts: { ...this.state.toolFailures }
    };
  }
}

// ========== 工具调度器 ==========

class ToolScheduler {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.circuitBreaker = new CircuitBreaker(options);
    this.state = new ToolState();
  }

  /**
   * 检查是否可以继续工具调用
   * @returns {{ allowed: boolean, reason: string }}
   */
  canProceed() {
    const reasons = [];

    if (this.state.roundCount >= this.options.maxRoundsPerConversation) {
      reasons.push(`达到最大轮次限制(${this.options.maxRoundsPerConversation})`);
    }

    if (this.state.tokenBudget >= this.options.maxTokensPerConversation) {
      reasons.push(`达到对话 token 限制(${this.options.maxTokensPerConversation})`);
    }

    if (this.state.activeCalls >= this.options.maxConcurrentTools) {
      reasons.push(`达到最大并发限制(${this.options.maxConcurrentTools})`);
    }

    return {
      allowed: reasons.length === 0,
      reasons
    };
  }

  /**
   * 调度一次工具调用
   * @param {string} toolName
   * @param {Function} fn - 实际执行函数
   * @param {object} options
   * @returns {Promise<{success, result, error, latency, retries}>}
   */
  async schedule(toolName, fn, options = {}) {
    const { priority = 0, timeout = this.options.toolTimeoutMs } = options;

    // 1. 熔断检查
    if (!this.circuitBreaker.isAvailable(toolName)) {
      return {
        success: false,
        error: `CIRCUIT_OPEN: 工具 "${toolName}" 已熔断，请 ${Math.ceil((this.circuitBreaker.resetMs - (Date.now() - (this.circuitBreaker.state.circuitOpenedAt[toolName] || 0))) / 1000)} 秒后再试`,
        latency: 0,
        retries: 0
      };
    }

    // 2. 限流检查
    const canProceed = this.canProceed();
    if (!canProceed.allowed) {
      // 如果是高优先级，可以入队等待
      if (priority > 0 && this.state.queue.length < this.options.backpressureQueueSize) {
        return new Promise((resolve) => {
          this.state.queue.push({ toolName, fn, options, resolve, queuedAt: Date.now() });
        });
      }
      return {
        success: false,
        error: `BACKPRESSURE: ${canProceed.reasons.join('; ')}`,
        latency: 0,
        retries: 0
      };
    }

    // 3. 执行
    this.state.roundCount++;
    this.state.activeCalls++;
    const startTime = Date.now();
    let lastError = null;
    let retries = 0;

    for (let attempt = 0; attempt <= this.options.retryMaxAttempts; attempt++) {
      try {
        const result = await this._executeWithTimeout(fn, timeout);
        const latency = Date.now() - startTime;
        const tokensUsed = (result && result.tokens) || 0;

        this.state.tokenBudget += tokensUsed;
        this.circuitBreaker.recordSuccess(toolName);
        this.state.activeCalls--;

        // 记录指标
        metrics.recordToolCall({
          agentId: options.agentId,
          toolName,
          startTime,
          endTime: Date.now(),
          success: true,
          tokensUsed,
          error: null
        });

        // 处理队列
        this._processQueue();

        return { success: true, result, latency, retries, tokensUsed };
      } catch (err) {
        lastError = err;
        retries = attempt + 1;

        if (attempt < this.options.retryMaxAttempts) {
          // 指数退避
          const delay = this.options.retryBaseDelayMs * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // 全部重试失败
    const latency = Date.now() - startTime;
    const isCircuitTripped = this.circuitBreaker.recordFailure(toolName);
    this.state.activeCalls--;

    metrics.recordToolCall({
      agentId: options.agentId,
      toolName,
      startTime,
      endTime: Date.now(),
      success: false,
      tokensUsed: 0,
      error: lastError ? lastError.message : 'Unknown error'
    });

    this._processQueue();

    return {
      success: false,
      error: lastError ? lastError.message : 'Tool execution failed',
      latency,
      retries,
      circuitTripped: isCircuitTripped
    };
  }

  /**
   * 带超时的执行
   */
  _executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`TIMEOUT: 工具执行超过 ${timeout}ms`));
      }, timeout);

      Promise.resolve().then(() => fn()).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * 处理背压队列
   */
  _processQueue() {
    if (this.state.queue.length > 0 && this.state.activeCalls < this.options.maxConcurrentTools) {
      const item = this.state.queue.shift();
      // 检查是否已超时等待
      if (Date.now() - item.queuedAt < 30000) {
        this.schedule(item.toolName, item.fn, item.options).then(item.resolve);
      } else {
        item.resolve({ success: false, error: 'QUEUE_TIMEOUT: 等待超时' });
      }
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      options: this.options,
      state: {
        roundCount: this.state.roundCount,
        tokenBudget: this.state.tokenBudget,
        activeCalls: this.state.activeCalls,
        queueLength: this.state.queue.length,
        conversationDuration: Date.now() - this.state.conversationStart
      },
      circuitBreaker: this.circuitBreaker.getStatus()
    };
  }

  /**
   * 重置对话状态
   */
  resetConversation() {
    this.state.resetConversation();
  }
}

// ========== 导出 ==========

module.exports = ToolScheduler;
module.exports.CircuitBreaker = CircuitBreaker;
module.exports.DEFAULTS = DEFAULTS;
