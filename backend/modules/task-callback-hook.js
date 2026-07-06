/**
 * task-callback-hook.js — 任务完成回调钩子 v1.0
 * 
 * 当AI员工完成任务后，自动触发回调通知CEO。
 * 集成到 agent-executor.js 的 executeAgent 出口。
 * 
 * 回调链：任务完成 → 写通知日志 → 更新记忆库 → 通知CEO
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const NOTIFY_LOG = path.join(BASE, 'logs', 'task-callbacks.log');
const NOTIFY_QUEUE = path.join(BASE, 'logs', 'ceo-notify-queue.json');

// 确保日志目录存在
const LOG_DIR = path.join(BASE, 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 任务完成回调 - 员工完成任务后调用
 * @param {Object} context - 任务上下文
 * @param {string} context.taskId - 任务ID
 * @param {string} context.agentId - 员工ID
 * @param {string} context.agentName - 员工名称
 * @param {string} context.taskTitle - 任务标题
 * @param {string} context.result - 执行结果（摘要）
 * @param {boolean} context.success - 是否成功
 * @param {number} context.durationMs - 执行耗时(毫秒)
 */
function onTaskComplete(context) {
  if (!context || !context.taskId) return;

  const entry = {
    taskId: context.taskId,
    agentId: context.agentId || 'unknown',
    agentName: context.agentName || 'Unknown',
    taskTitle: context.taskTitle || 'Untitled',
    success: context.success !== false,
    durationMs: context.durationMs || 0,
    completedAt: new Date().toISOString(),
    resultSummary: (context.result || '').substring(0, 200)
  };

  // 1. 写回调日志
  writeCallbackLog(entry);

  // 2. 推送CEO通知队列
  pushNotifyQueue(entry);

  // 3. 自动保存产出物到工作成果目录（兜底：不管agent有没有写文件，都保存finalReply）
  try {
    var resultText = context.result || '';
    if (resultText.length > 50) {
      var reportDir = path.join(BASE, '..', 'AI团队', '工作成果');
      if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
      var safeName = (context.taskTitle || 'task').replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
      var reportFile = path.join(reportDir, context.agentName + '-' + safeName + '-' + (context.taskId || '').substring(0, 8) + '.md');
      fs.writeFileSync(reportFile, '# ' + (context.taskTitle || '任务报告') + '\n\n**执行人：' + context.agentName + '** | **完成时间：' + entry.completedAt + '**\n\n---\n\n' + resultText, 'utf-8');
    }
  } catch(_ae) {}

  // 4. 写入CEO记忆库（简要记录）
  writeCEOMemory(entry);

  // 5. WebSocket实时推送（通知CEO+工作台）
  try {
    if (global.__wsServer && global.__wsServer.broadcast) {
      var notifMsg = '【' + (entry.agentName || '员工') + '】完成「' + (entry.taskTitle || '任务') + '」' + (entry.success ? ' ✅' : ' ❌');
      global.__wsServer.broadcast('ceo', { type: 'ceo_message', source: 'task', message: notifMsg, timestamp: new Date().toISOString() });
      global.__wsServer.broadcast('agents', { type: 'agent_activity', agentId: entry.agentId || '', agentName: entry.agentName || '员工', action: '完成: ' + (entry.taskTitle || ''), taskId: entry.taskId });
    }
  } catch(e) {}

  return entry;
}

/**
 * 写回调日志（追加模式）
 */
function writeCallbackLog(entry) {
  try {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(NOTIFY_LOG, line, 'utf-8');
  } catch(e) {
    // 静默失败，不影响主流程
  }
}

/**
 * 推送CEO通知队列
 */
function pushNotifyQueue(entry) {
  try {
    let queue = [];
    if (fs.existsSync(NOTIFY_QUEUE)) {
      const raw = fs.readFileSync(NOTIFY_QUEUE, 'utf-8');
      try { queue = JSON.parse(raw); } catch(e) { queue = []; }
    }
    
    // 去重：同一taskId不重复推送
    if (!queue.some(function(item) { return item.taskId === entry.taskId; })) {
      queue.push({
        type: 'task_completed',
        message: '【' + entry.agentName + '】完成任务「' + entry.taskTitle + '」',
        taskId: entry.taskId,
        agentName: entry.agentName,
        completedAt: entry.completedAt,
        status: 'unread'
      });
    }
    
    // 只保留最近200条
    if (queue.length > 200) queue = queue.slice(-200);
    
    fs.writeFileSync(NOTIFY_QUEUE, JSON.stringify(queue, null, 2), 'utf-8');
  } catch(e) {
    // 静默失败
  }
}

/**
 * 写入CEO记忆库
 */
function writeCEOMemory(entry) {
  try {
    const memPath = path.join(BASE, 'memory-ai_ceo.json');
    let mem = { decisions: [], notes: [], notifications: [] };
    
    if (fs.existsSync(memPath)) {
      const raw = fs.readFileSync(memPath, 'utf-8');
      try { mem = JSON.parse(raw); } catch(e) {}
    }
    
    if (!mem.notifications) mem.notifications = [];
    
    mem.notifications.push({
      type: 'task_completed',
      taskId: entry.taskId,
      agent: entry.agentName,
      title: entry.taskTitle,
      success: entry.success,
      time: entry.completedAt
    });
    
    if (mem.notifications.length > 200) mem.notifications = mem.notifications.slice(-200);
    
    fs.writeFileSync(memPath, JSON.stringify(mem, null, 2), 'utf-8');
  } catch(e) {
    // 静默失败
  }
}

/**
 * 获取待处理的通知队列（供CEO查阅）
 * @returns {Array} 未读通知列表
 */
function getPendingNotifications() {
  try {
    if (!fs.existsSync(NOTIFY_QUEUE)) return [];
    const raw = fs.readFileSync(NOTIFY_QUEUE, 'utf-8');
    const queue = JSON.parse(raw);
    return queue.filter(function(item) { return item.status === 'unread'; });
  } catch(e) {
    return [];
  }
}

/**
 * 标记通知为已读
 */
function markAsRead(taskId) {
  try {
    if (!fs.existsSync(NOTIFY_QUEUE)) return;
    const raw = fs.readFileSync(NOTIFY_QUEUE, 'utf-8');
    const queue = JSON.parse(raw);
    queue.forEach(function(item) {
      if (item.taskId === taskId) item.status = 'read';
    });
    fs.writeFileSync(NOTIFY_QUEUE, JSON.stringify(queue, null, 2), 'utf-8');
  } catch(e) {}
}

module.exports = {
  onTaskComplete: onTaskComplete,
  getPendingNotifications: getPendingNotifications,
  markAsRead: markAsRead
};
