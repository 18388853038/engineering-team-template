/**
 * Context Manager - 对话上下文管理
 * 
 * 功能：
 * 1. 意图提取（从对话历史中提取用户意图）
 * 2. 历史摘要（压缩长对话为摘要）
 * 3. Token 预算管理（控制上下文大小）
 */

class ContextManager {
  constructor() {
    this.history = [];
    this.tokenBudget = 8000;
    this.summaryInterval = 10; // 每 10 条消息摘要一次
    this.maxHistory = 50;
  }

  /**
   * 准备上下文：裁剪、摘要、优化消息序列
   */
  prepare(messages, options) {
    options = options || {};
    var budget = options.tokenBudget || this.tokenBudget;
    var systemPrompt = options.systemPrompt || '';
    
    if (!messages || messages.length === 0) {
      return { messages: [], summary: '', tokenCount: 0 };
    }

    var systemMsgs = [];
    var contentMsgs = [];

    // 分离 system prompt
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        systemMsgs.push(messages[i]);
      } else {
        contentMsgs.push(messages[i]);
      }
    }

    // 精简 system prompt 数量（保留最后一个）
    var finalSystem = systemMsgs.length > 0 ? [systemMsgs[systemMsgs.length - 1]] : [];

    // 如果 content 消息太多，截断到 maxHistory
    if (contentMsgs.length > this.maxHistory) {
      // 保留系统提示、保留最近的 maxHistory 条
      contentMsgs = contentMsgs.slice(-this.maxHistory);
    }

    // 估算 token 数（经验公式：中英文混合 ~1.5 chars/token）
    var totalText = (finalSystem[0] ? finalSystem[0].content : '') + '\n' + 
      contentMsgs.map(function(m) { return m.content || ''; }).join('\n');
    var estimatedTokens = Math.ceil(totalText.length / 1.5);

    // 如果超出预算，从最早的 content 消息开始丢弃
    while (estimatedTokens > budget && contentMsgs.length > 1) {
      contentMsgs.shift();
      totalText = (finalSystem[0] ? finalSystem[0].content : '') + '\n' + 
        contentMsgs.map(function(m) { return m.content || ''; }).join('\n');
      estimatedTokens = Math.ceil(totalText.length / 1.5);
    }

    var result = {
      messages: finalSystem.concat(contentMsgs),
      summary: '',
      tokenCount: estimatedTokens
    };

    // 更新历史记录
    this.history = contentMsgs;
    return result;
  }

  /**
   * 生成对话摘要（供后续轮次使用）
   */
  summarize(messages) {
    if (!messages || messages.length === 0) return '';
    var lastFew = messages.slice(-4);
    var summary = lastFew.map(function(m) {
      var role = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : '系统';
      var content = (m.content || '').substring(0, 100);
      return role + ': ' + content;
    }).join('\n');
    return summary;
  }

  /**
   * 提取意图关键词
   */
  extractIntent(messages) {
    var lastMsg = messages[messages.length - 1];
    if (!lastMsg || !lastMsg.content) return { type: 'unknown', keywords: [] };
    
    var text = lastMsg.content;
    var keywords = [];
    
    // 基础关键词提取（按常见动词/名词）
    var patterns = {
      query: ['查', '看', '显示', '列出', '搜索', '找', '查看', '查询', '显示'],
      action: ['创建', '新建', '添加', '删除', '修改', '更新', '分配', '设置', '开启', '关闭'],
      chat: ['你好', 'hi', 'hello', '嗨', '请问', '问', '想', '能', '可以'],
      system: ['配置', '设置', '状态', '健康', '监控', '指标', '日志', '报告']
    };

    for (var type in patterns) {
      for (var p = 0; p < patterns[type].length; p++) {
        if (text.includes(patterns[type][p])) {
          keywords.push(patterns[type][p]);
          break;
        }
      }
    }

    var intentType = 'chat';
    if (keywords.some(function(k) { return patterns.query.indexOf(k) > -1; })) intentType = 'query';
    if (keywords.some(function(k) { return patterns.action.indexOf(k) > -1; })) intentType = 'action';
    if (keywords.some(function(k) { return patterns.system.indexOf(k) > -1; })) intentType = 'system';

    return { type: intentType, keywords: keywords };
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      status: 'active',
      tokenBudget: this.tokenBudget,
      historyLength: this.history.length,
      maxHistory: this.maxHistory,
      summaryInterval: this.summaryInterval
    };
  }

  /**
   * 设置 Token 预算
   */
  setTokenBudget(budget) {
    if (budget > 0) this.tokenBudget = budget;
  }
}

module.exports = ContextManager;
