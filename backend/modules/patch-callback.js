const fs = require('fs');
const path = require('path');

const file = 'F:/eCompany-EXE/eCompany-正式版/backend/modules/agent-executor.js';
let c = fs.readFileSync(file, 'utf-8');

// 1. 引入 task-callback-hook（在 CEOMEM_PATH 之后）
c = c.replace(
  "const CEOMEM_PATH = path.join(BASE, 'memory-ai_ceo.json');",
  "const CEOMEM_PATH = path.join(BASE, 'memory-ai_ceo.json');\nconst { onTaskComplete } = require('./task-callback-hook');"
);

// 2. executeAgent 开始处记录时间
c = c.replace(
  'async function executeAgent(agentId, userMessage, options) {\n  var agentInfo = getAgentInfo(agentId);',
  'async function executeAgent(agentId, userMessage, options) {\n  var _startTime = Date.now();\n  var agentInfo = getAgentInfo(agentId);'
);

// 3. 返回前触发回调
c = c.replace(
  '  return {\n    reply: finalReply,\n    memory: memory,\n    toolCalls: allToolCalls,\n    iterations: iter + 1\n  };',
  '  // ====== 任务完成回调通知CEO ======\n  if (options && options.taskId) {\n    try {\n      onTaskComplete({\n        taskId: options.taskId,\n        agentId: agentId,\n        agentName: (agentInfo && agentInfo.name_cn) || agentId,\n        taskTitle: options.taskTitle || (userMessage || \"\").substring(0, 50),\n        result: finalReply || \"\",\n        success: true,\n        durationMs: Date.now() - _startTime\n      });\n    } catch(e) { /* 回调失败不影响主流程 */ }\n  }\n  return {\n    reply: finalReply,\n    memory: memory,\n    toolCalls: allToolCalls,\n    iterations: iter + 1\n  };'
);

fs.writeFileSync(file, c, 'utf-8');
console.log('DONE: 3 patches applied');
console.log('New size:', c.length, 'bytes');
