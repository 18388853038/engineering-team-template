/**
 * sse-stream.js — SSE (Server-Sent Events) 流式响应模块
 * 
 * 功能：
 * 1. 将完整 HTTP 响应改造为 SSE 流式输出
 * 2. 支持 AI 模型逐 token 输出
 * 3. 兼容现有 /api/chat 接口
 * 4. 提供 /api/chat/stream 端点（SSE 版本）
 */

const fs = require('fs');
const path = require('path');

// ========== SSE 辅助函数 ==========

/**
 * 发送 SSE 格式数据
 */
function sendSSE(res, event, data, id) {
  if (res.headersSent) return;
  res.write(`id: ${id || Date.now()}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
}

/**
 * 发送 SSE comment（保持连接）
 */
function sendPing(res) {
  if (res.headersSent) return;
  res.write(': ping\n\n');
}

/**
 * 设置 SSE 响应头
 */
function setSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // 禁用 nginx 缓冲
  res.flushHeaders();
}

/**
 * 发送错误 SSE 事件
 */
function sendSSEError(res, code, message) {
  sendSSE(res, 'error', { code, message }, 'err_' + Date.now());
  res.end();
}

// ========== 流式 AI 调用 ==========

/**
 * 流式调用 AI 模型
 * @param {object} aiEngine - AI 引擎实例
 * @param {object} options - 调用选项 { model, messages, temperature, maxTokens }
 * @param {function} onChunk - 每当收到一个 chunk 时的回调
 * @param {function} onComplete - 完成时的回调
 */
async function streamAI(aiEngine, options, onChunk, onComplete) {
  const { model, messages, temperature = 0.7, maxTokens = 4096, stream = true } = options;
  
  try {
    // 尝试使用流式 API
    const response = await aiEngine.chat({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: true
    });
    
    let fullContent = '';
    let chunkCount = 0;
    
    if (response.body && response.body.pipe) {
      // Node.js 流式响应
      await new Promise((resolve, reject) => {
        const { Readable } = require('stream');
        const stream = response.body;
        
        let buffer = '';
        
        stream.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留不完整的行
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                if (onComplete) onComplete({ content: fullContent, chunkCount });
                resolve();
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  chunkCount++;
                  if (onChunk) onChunk({ content, delta: content, index: chunkCount, full: fullContent });
                }
              } catch(e) {}
            }
          }
        });
        
        stream.on('end', () => {
          if (onComplete) onComplete({ content: fullContent, chunkCount });
          resolve();
        });
        
        stream.on('error', (err) => {
          reject(err);
        });
      });
    } else if (response.content !== undefined) {
      // 非流式响应（逐步模拟）
      const chars = response.content.split('');
      for (let i = 0; i < chars.length; i++) {
        fullContent += chars[i];
        if (onChunk) onChunk({ content: chars[i], delta: chars[i], index: i + 1, full: fullContent });
        await new Promise(r => setTimeout(r, 5)); // 模拟打字效果
      }
      if (onComplete) onComplete({ content: fullContent, chunkCount: chars.length });
    } else {
      throw new Error('Unsupported response format');
    }
    
    return { ok: true, content: fullContent, chunks: chunkCount };
    
  } catch(err) {
    // 流式失败，降级为完整响应
    try {
      const response = await aiEngine.chat({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: false
      });
      
      fullContent = response.content || JSON.stringify(response);
      chunkCount = fullContent.length;
      
      if (onChunk) {
        // 一次性发送所有内容作为单个 chunk
        onChunk({ content: fullContent, delta: fullContent, index: 1, full: fullContent });
      }
      if (onComplete) onComplete({ content: fullContent, chunkCount, mode: 'fallback' });
      
      return { ok: true, content: fullContent, chunks: chunkCount, fallback: true };
    } catch(e2) {
      return { ok: false, error: e2.message || err.message };
    }
  }
}

// ========== SSE HTTP 响应处理 ==========

/**
 * 注册 SSE 相关路由（需要调用 registerRoute）
 * @param {function} registerRoute - 路由注册函数
 */
function registerSSERoutes(registerRoute, deps) {
  const { json, parseBody } = deps;
  
  // ====== SSE 流式聊天端点 ======
  registerRoute(['GET'], /^\/api\/chat\/stream$/, async (req, res) => {
    // GET 用于测试连接（检查 SSE 是否可用）
    setSSEHeaders(res);
    sendSSE(res, 'ping', { message: 'SSE connection OK', time: new Date().toISOString() }, 'init');
    sendPing(res);
    res.end();
  });
  
  // ====== POST 流式聊天 ======
  registerRoute(['POST'], /^\/api\/chat\/stream$/, async (req, res) => {
    try {
      const body = await parseBody(req);
      const { messages, model, temperature = 0.7, maxTokens = 4096, agentId = 'ai_ceo' } = body;
      
      if (!messages || !Array.isArray(messages)) {
        sendSSEError(res, 400, 'messages array is required');
        return;
      }
      
      setSSEHeaders(res);
      
      // 发送开始事件
      sendSSE(res, 'start', { agentId, model, time: new Date().toISOString() }, 'start');
      
      const aiEngine = deps.aiEngine || _getAIEngine();
      if (!aiEngine) {
        sendSSEError(res, 503, 'AI engine not available');
        return;
      }
      
      // 流式调用 AI
      const result = await streamAI(
        aiEngine,
        { model: model || 'deepseek-v4-pro', messages, temperature, maxTokens },
        
        // onChunk: 每个 token 发送一次 SSE 事件
        ({ content, delta, index, full }) => {
          sendSSE(res, 'chunk', {
            delta,
            index,
            content: content.length === 1 ? content : '',
            partial: content.length > 1 ? content : null,
            full: content.length === 1 ? full : ''
          }, 'chunk_' + index);
        },
        
        // onComplete: 发送完成事件
        ({ content, chunkCount, mode }) => {
          sendSSE(res, 'complete', {
            content,
            chunks: chunkCount,
            mode: mode || 'stream',
            time: new Date().toISOString()
          }, 'complete');
          res.end();
        }
      );
      
      if (!result.ok) {
        sendSSEError(res, 500, result.error);
      }
      
    } catch(err) {
      sendSSEError(res, 500, err.message);
    }
  });
  
  // ====== SSE 状态端点 ======
  registerRoute(['GET'], /^\/api\/stream\/status$/, (req, res) => {
    const aiEngine = deps.aiEngine || _getAIEngine();
    const hasStreaming = aiEngine && typeof aiEngine.chat === 'function';
    json(res, {
      ok: true,
      streaming: hasStreaming,
      endpoints: {
        stream: '/api/chat/stream (POST)',
        test: '/api/chat/stream (GET)'
      },
      formats: ['sse', 'json'],
      supported: hasStreaming ? ['deepseek', 'openai', 'claude', 'gemini'] : []
    });
  });
}

// ========== 内部工具 ==========

let _aiEngine = null;
function _getAIEngine() {
  if (!_aiEngine) {
    try {
      _aiEngine = require('./ai-engine');
    } catch(e) {}
  }
  return _aiEngine;
}

module.exports = {
  setSSEHeaders,
  sendSSE,
  sendPing,
  sendSSEError,
  streamAI,
  registerSSERoutes
};