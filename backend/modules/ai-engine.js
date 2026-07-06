/**
 * eCompany AI Engine
 * 多模型 AI 引擎 - 仅支持豆包 (Doubao)
 * 注入：多模型故障切换、流式输出、高级工具调用
 */

// ========== 模型配置 ==========
const PROVIDERS = {
  "doubao": {
    "baseUrl": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    "apiKeyEnv": "ARK_API_KEY",
    "defaultModel": "doubao-pro-32k",
    "models": [
      { "id": "doubao-pro-32k", "label": "豆包 Pro 32K", "tags": ["推理", "通用", "中文"], "contextWindow": 32000 },
      { "id": "doubao-pro-128k", "label": "豆包 Pro 128K", "tags": ["推理", "长文本"], "contextWindow": 128000 },
      { "id": "doubao-pro-256k", "label": "豆包 Pro 256K", "tags": ["推理", "超长文本"], "contextWindow": 256000 },
      { "id": "doubao-lite-32k", "label": "豆包 Lite 32K", "tags": ["轻量", "经济", "中文"], "contextWindow": 32000 },
      { "id": "doubao-lite-128k", "label": "豆包 Lite 128K", "tags": ["经济", "长文本"], "contextWindow": 128000 },
      { "id": "doubao-1.5-pro-32k", "label": "豆包 1.5 Pro 32K", "tags": ["旗舰", "推理"], "contextWindow": 32000 },
      { "id": "doubao-1.5-pro-256k", "label": "豆包 1.5 Pro 256K", "tags": ["旗舰", "推理", "超长文本"], "contextWindow": 256000 },
      { "id": "doubao-1.5-lite-32k", "label": "豆包 1.5 Lite 32K", "tags": ["均衡", "经济"], "contextWindow": 32000 },
      { "id": "doubao-vision-pro-32k", "label": "豆包 视觉 Pro 32K", "tags": ["视觉", "多模态"], "contextWindow": 32000 },
      { "id": "doubao-vision-lite-32k", "label": "豆包 视觉 Lite 32K", "tags": ["视觉", "经济"], "contextWindow": 32000 }
    ]
  }
};

// ========== 读取 AI 配置（支持备用提供商） ==========
function readAIProviderConfig() {
  const fs = require('fs');
  const path = require('path');
  const BASE = __dirname;
  const cfgPath = path.join(BASE, '..', 'ai-provider.json');
  const config = { provider: 'doubao', fallbackProvider: null, fallbackModel: null };
  try {
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (raw.provider) config.provider = raw.provider;
      if (raw.fallbackProvider) config.fallbackProvider = raw.fallbackProvider;
      if (raw.fallbackModel) config.fallbackModel = raw.fallbackModel;
      // 仅当环境变量未设置时，才从配置文件读取作为兼容降级
      if (raw.apiKey) {
        const envKey = PROVIDERS[raw.provider]?.apiKeyEnv || 'ARK_API_KEY';
        if (!process.env[envKey]) {
          let keyValue = raw.apiKey;
          // 解密 enc: 前缀的密钥
          if (keyValue && keyValue.startsWith('enc:')) {
            try {
              const { decrypt } = require('./key-vault');
              const fs = require('fs');
              const path = require('path');
              const masterKeyPath = path.join(BASE, '..', '.master-key');
              if (fs.existsSync(masterKeyPath)) {
                const masterKey = fs.readFileSync(masterKeyPath, 'utf8').trim();
                keyValue = decrypt(keyValue, masterKey);
              }
            } catch(ex) {
              console.error('[ai-engine] 解密失败:', ex.message);
              keyValue = '';
            }
          }
          if (keyValue) process.env[envKey] = keyValue;
        }
      }
    }
  } catch(e) { /* ignore */ }
  // Check env vars for fallback
  if (process.env.AI_FALLBACK_PROVIDER) config.fallbackProvider = process.env.AI_FALLBACK_PROVIDER;
  return config;
}

// ========== 执行一次 API 调用 ==========
async function callProviderOnce(providerName, messages, options) {
  // 每次调用前重新读取并解密 provider-keys.json
  try {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const pkPath = path.join(__dirname, '..', 'provider-keys.json');
    if (fs.existsSync(pkPath)) {
      const allKeys = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
      const MASTER_KEY_PATH = path.join(__dirname, '..', '.master-key');
      let masterKey = null;
      if (fs.existsSync(MASTER_KEY_PATH)) masterKey = fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim();
      for (const [provider, encryptedKey] of Object.entries(allKeys)) {
        if (!encryptedKey) continue;
        let decryptedKey = '';
        if (encryptedKey.startsWith('enc:') && masterKey) {
          try {
            const ENCRYPTION_KEY = crypto.createHash('sha256').update(masterKey).digest();
            const parts = encryptedKey.replace('enc:', '').split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = Buffer.from(parts[1], 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv, { authTagLength: 16 });
            const authTag = encrypted.slice(-16);
            decipher.setAuthTag(authTag);
            const ciphertext = encrypted.slice(0, -16);
            decryptedKey = decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
          } catch(ex) { continue; }
        } else if (!encryptedKey.startsWith('enc:')) {
          decryptedKey = encryptedKey;
        }
        if (decryptedKey) {
          const envKey = PROVIDERS[provider]?.apiKeyEnv || (provider.toUpperCase() + '_API_KEY');
          process.env[envKey] = decryptedKey;
        }
      }
    }
  } catch(e) { /* ignore */ }
  
  const { toolDefs, model, temperature = 0.7, maxTokens = 4096, timeout = 30000 } = options;
  const providerCfg = PROVIDERS[providerName.toLowerCase()];
  if (!providerCfg) throw new Error(`不支持的 AI 提供商: ${providerName}`);
  
  const apiKey = process.env[providerCfg.apiKeyEnv];
  if (!apiKey && !providerCfg.noApiKey) throw new Error(`未配置 ${providerCfg.apiKeyEnv} 环境变量`);

  const body = {
    model: model || providerCfg.defaultModel,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (toolDefs && toolDefs.length) {
    body.tools = toolDefs;
    body.tool_choice = 'auto';
  }

  var _retries = 0;
  var _lastErr = null;
  while (_retries < 3) {
    _retries++;
    if (_retries > 1) await new Promise(function(r) { setTimeout(r, (_retries - 1) * 1500); });
    try {
      const controller = new AbortController();
      var rt = setTimeout(function() { controller.abort(); }, timeout);
      var pn = providerName.toLowerCase();
      if (pn === 'doubao') {
        try {
          const OpenAI = require('openai');
          const oaiclient = new OpenAI({
            baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
            apiKey: apiKey
          });
          var oaiMsg = messages.map(function(m) {
            if (m.role === 'system') return { role: 'system', content: m.content };
            if (m.role === 'user') return { role: 'user', content: m.content };
            if (m.role === 'assistant') return { role: 'assistant', content: m.content };
            if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
            return { role: m.role, content: m.content };
          });
          var oaiOpts = {
            model: model || providerCfg.defaultModel,
            messages: oaiMsg,
            max_tokens: maxTokens,
            timeout: timeout
          };
          if (temperature !== undefined) oaiOpts.temperature = temperature;
          if (toolDefs && toolDefs.length) {
            oaiOpts.tools = toolDefs;
            oaiOpts.tool_choice = 'auto';
          }
          var oaiResult = await oaiclient.chat.completions.create(oaiOpts);
          var oaiReply = oaiResult.choices && oaiResult.choices[0];
          if (!oaiReply) throw new Error('豆包 API 返回空结果');
          clearTimeout(rt);
          return {
            reply: oaiReply.message.content || '',
            usage: oaiResult.usage || {},
            toolCalls: (oaiReply.message.tool_calls || []).map(function(tc) {
              return { id: tc.id, type: tc.type, function: { name: tc.function.name, arguments: tc.function.arguments } };
            })
          };
        } catch(oaiErr) {
          throw new Error('豆包 API ' + (oaiErr.status || '请求失败') + ': ' + oaiErr.message);
        }
      }
      const res = await fetch(providerCfg.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(rt);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${providerName} API ${res.status}: ${errText.substring(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      _lastErr = err;
      continue;
    }
  }
  throw _lastErr || new Error(providerName + ' 调用失败（已重试 3 次）');
}

// ========== AI 调用（带多提供商遍历降级） ==========
async function aiChat(messages, options = {}) {
  const { toolDefs, provider, model, temperature = 0.7, maxTokens = 4096, timeout = 30000 } = options;

  const config = readAIProviderConfig();
  const activeProvider = provider || config.provider || process.env.AI_PROVIDER || 'doubao';

  // 第一优先级：显式指定的 provider
  if (provider) {
    return await callProviderOnce(provider, messages, options);
  }

  // 第二优先级：尝试主提供商
  try {
    const result = await callProviderOnce(activeProvider, messages, options);
    return result;
  } catch (primaryErr) {
    // 主提供商失败，尝试备用提供商
    const fallbackProvider = config.fallbackProvider || process.env.AI_FALLBACK_PROVIDER;
    if (fallbackProvider && fallbackProvider !== activeProvider) {
      try {
        const fallbackOptions = { ...options };
        if (config.fallbackModel) fallbackOptions.model = config.fallbackModel;
        const result = await callProviderOnce(fallbackProvider, messages, fallbackOptions);
        return result;
      } catch (fallbackErr) {
        throw new Error(`主提供商(${activeProvider})和备用提供商(${fallbackProvider})均失败: ${fallbackErr.message}`);
      }
    }
    throw primaryErr;
  }
}

// ========== 多轮对话（含工具调用） ==========
// 延迟加载 execCEOTool（由 server-modern.js 注入全局）
var _execCEOTool = null;
try {
  var execTools = require('./executor-tools');
  if (execTools && typeof execTools.execCEOTool === 'function') {
    _execCEOTool = execTools.execCEOTool;
  }
} catch(e) { /* fallback below */ }
var _execCEOToolFn = _execCEOTool || (typeof globalThis !== 'undefined' && globalThis.execCEOTool) || null;

async function aiChatWithTools(messages, tools, options = {}) {
  // 第一轮：调用模型（可能返回工具调用）
  const response = await aiChat(messages, { ...options, toolDefs: tools });
  if (!response.choices?.length) throw new Error('API 返回为空');

  const choice = response.choices[0];

  // 如果没有工具调用，直接返回
  if (choice.finish_reason !== 'tool_calls' || !choice.message?.tool_calls) {
    return { reply: choice.message?.content || '', toolCalls: [] };
  }

  // 执行工具调用
  const secondMessages = [...messages, choice.message];
  const toolResults = [];

  for (const tc of choice.message.tool_calls) {
    if (tc.type === 'function') {
      const funcName = tc.function.name;
      let funcArgs = {};
      try { funcArgs = JSON.parse(tc.function.arguments); } catch (e) {}

      toolResults.push({ name: funcName, args: funcArgs });

      // 执行实际工具函数
      var toolResult = '';
      try {
        if (_execCEOToolFn) {
          var raw = await Promise.resolve(_execCEOToolFn(funcName, funcArgs));
          if (raw && typeof raw === 'object') {
            toolResult = JSON.stringify(raw, null, 2);
          } else if (raw !== undefined) {
            toolResult = String(raw);
          } else {
            toolResult = 'null';
          }
        } else {
          toolResult = JSON.stringify({ note: 'execCEOTool不可用', args: funcArgs, funcName: funcName });
        }
      } catch(e) {
        toolResult = JSON.stringify({ error: e.message, args: funcArgs });
      }

      secondMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult
      });
    }
  }

  // 第二轮：获取最终回复
  const secondResponse = await aiChat(secondMessages, { ...options, toolDefs: tools });
  const finalReply = secondResponse.choices?.[0]?.message?.content || '';

  return { reply: finalReply, toolCalls: toolResults };
}

// ========== 流式输出 ==========
async function* aiChatStream(messages, options = {}) {
  const { provider, model } = options;
  const activeProvider = provider || process.env.AI_PROVIDER || 'doubao';
  const providerCfg = PROVIDERS[activeProvider];
  if (!providerCfg) throw new Error(`不支持的提供商: ${activeProvider}`);

  const apiKey = process.env[providerCfg.apiKeyEnv];
  if (!apiKey && !providerCfg.noApiKey) throw new Error(`未配置 ${providerCfg.apiKeyEnv}`);

  const headers = { 'Content-Type': 'application/json' };
  if (!providerCfg.noApiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(providerCfg.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || providerCfg.defaultModel,
      messages,
      stream: true,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4096
    })
  });

  if (!res.ok) throw new Error(`API ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) yield content;
        } catch (e) { /* 跳过解析错误 */ }
      }
    }
  }
}

module.exports = {
  PROVIDERS,
  aiChat,
  aiChatWithTools,
  aiChatStream
};
