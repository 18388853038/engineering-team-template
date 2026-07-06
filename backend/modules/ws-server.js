/**
 * eCompany WebSocket 实时推送模块
 * 广播：任务状态变更、Agent 活动、系统事件
 */
const { WebSocketServer } = require('ws');

let wss = null;

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log('[WS] 新连接: ' + ip);
    ws.isAlive = true;
    
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe') {
          ws.subscriptions = msg.channels || ['all'];
        }
      } catch(e) {}
    });
    ws.on('close', () => { console.log('[WS] 断开:', ip); });
    ws.on('error', (e) => { console.log('[WS] 错误:', ip, e.message); });
    
    // Send welcome
    send(ws, { type: 'connected', message: 'eCompany WebSocket 已连接', time: new Date().toISOString() });
  });
  
  // Heartbeat every 15s (was 30s)
  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);
  
  // 连接数告警：超过100个连接时打印警告
  setInterval(() => {
    if (wss && wss.clients.size > 100) {
      console.log('[WS] 警告: 连接数=' + wss.clients.size);
    }
  }, 60000);
  
  console.log('[WS] WebSocket 服务已启动');
}

function send(ws, data) {
  if (ws.readyState === 1) { // OPEN
    ws.send(JSON.stringify(data));
  }
}

var harnessMetricsInterval = null;

function startHarnessBroadcast() {
  if (harnessMetricsInterval) return;
  try {
    var metrics = require('../modules/metrics');
    harnessMetricsInterval = setInterval(function() {
      broadcast('harness', { type: 'metrics', data: metrics.getStats() });
      broadcast('harness', { type: 'scheduler', data: (function(){
        try { return require('../modules/tool-scheduler'); } catch(e) { return null; }
      })() });
    }, 5000);
  } catch(e) { /* harness module not loaded yet */ }
}

setTimeout(startHarnessBroadcast, 3000);

function broadcast(channel, data) {
  if (!wss) return;
  const msg = JSON.stringify({ channel, ...data, time: new Date().toISOString() });
  wss.clients.forEach(ws => {
    if (ws.readyState !== 1) return;
    if (!ws.subscriptions || ws.subscriptions.includes('all') || ws.subscriptions.includes(channel)) {
      ws.send(msg);
    }
  });
}

// Event helpers
function taskCreated(task) {
  broadcast('tasks', { type: 'task_created', task });
}

function taskUpdated(task) {
  broadcast('tasks', { type: 'task_updated', task });
}

function taskClaimed(task, agentName) {
  broadcast('tasks', { type: 'task_claimed', task, agentName });
}

function taskCompleted(task, agentName) {
  broadcast('tasks', { type: 'task_completed', task, agentName });
}

function agentActivity(agentId, agentName, action, detail) {
  broadcast('agents', { type: 'agent_activity', agentId, agentName, action, detail });
  var displayText = (action || '') + (typeof detail === 'string' && detail ? ' — ' + detail : '');
  broadcast('channel', { type: 'channel_message', message: displayText, source: 'system', from: agentName || '系统', timestamp: new Date().toISOString() });
}

function systemEvent(event, data) {
  broadcast('system', { type: event, data });
}

function ceoMessage(content, source) {
  broadcast('ceo', { type: 'ceo_message', content, source: source || 'system', timestamp: new Date().toISOString() });
  broadcast('agents', { type: 'agent_activity', agentId: 'ai_ceo', agentName: 'CEO', action: content ? content.substring(0, 200) : '执行任务' });
}

module.exports = {
  init,
  broadcast,
  taskCreated,
  taskUpdated,
  taskClaimed,
  taskCompleted,
  agentActivity,
  systemEvent,
  ceoMessage
};
