/**
 * eCompany Chat Workspace — 独立群聊工作台
 * 所有对话均来自真实的 eCompany AI 引擎
 */
var fs = require('fs');
var path = require('path');
var http = require('http');

var BASE = path.join(__dirname, '..');
var CONV_FILE = path.join(BASE, 'workspace-conv.json');
var PORT = 8005;

function api(method, path, body) {
  return new Promise(function(resolve) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: path, method: method,
      headers: { 'Content-Type': 'application/json' }, timeout: 60000 };
    var req = http.request(opts, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ error: 'parse error' }); }
      });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function loadConv() {
  try { return JSON.parse(fs.readFileSync(CONV_FILE, 'utf-8')); }
  catch(e) { return { messages: [] }; }
}
function saveConv(c) {
  try { fs.writeFileSync(CONV_FILE, JSON.stringify(c, null, 2), 'utf-8'); } catch(e) {}
}

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(path.join(BASE, 'agents.json'), 'utf-8')); }
  catch(e) { return []; }
}

function ChatWorkspace() {
  this.conv = loadConv();
}

ChatWorkspace.prototype.sendMessage = async function(userMessage, agentId, imageData) {
  var timeline = [];
  var agents = loadAgents();

  // 1. 用户消息
  timeline.push({ type: 'user', agentName: '\uD83D\uDC64 \u4F60', content: userMessage, time: new Date().toISOString() });

  // 2. 判断是私聊还是CEO
  var isPrivate = agentId && agentId !== '' && agentId !== 'ai_ceo';
  
  if (isPrivate) {
    // 私聊：调用员工 AI
    timeline.push({ type: 'emp', agentName: agentId, content: '\u231B \u6B63\u5728\u56DE\u7B54...', time: new Date().toISOString() });
    try {
      var empResult = await api('POST', '/api/chat/' + agentId, { message: userMessage });
      timeline[1].content = empResult.reply || '(\u65E0\u54CD\u5E94)';
    } catch(e) {
      timeline[1].content = '\u9519\u8BEF: ' + e.message;
    }
    this.conv.messages.push({ id: 'msg_' + Date.now(), userMessage: userMessage, timeline: timeline, time: new Date().toISOString() });
    saveConv(this.conv);
    return { messages: timeline };
  }

  // 3. CEO 真实 AI 分析
  timeline.push({ type: 'ceo', agentName: '\uD83E\uDD16 AI CEO', content: '\u231B CEO\u6B63\u5728\u5206\u6790...', time: new Date().toISOString() });

  var ceoReply = '';
  try {
    var ceoResult = await api('POST', '/api/chat/ai_ceo', {
      message: '\u4F60\u662F eCompany \u7684 CEO\uFF0C\u7528\u6237\u53D1\u6765\u4E86\u6D88\u606F\uFF1A' + userMessage +
        '\n\n\u81EA\u7136\u5730\u56DE\u7B54\u7528\u6237\u3002\u5982\u679C\u6709\u5177\u4F53\u4EFB\u52A1\uFF0C\u8BF7\u8BF4\u660E\u4F60\u7684\u5206\u6790\u548C\u8C03\u5EA6\u8BA1\u5212\u3002\u5982\u679C\u662F\u7B80\u5355\u95EE\u5019\u6216\u95EE\u9898\uFF0C\u76F4\u63A5\u56DE\u7B54\u5373\u53EF\u3002\u56DE\u7B54\u4E0D\u8981\u592A\u683C\u5F0F\u5316\uFF0C\u7528\u81EA\u7136\u8BED\u8A00\u3002',
      image: imageData || ''
    });
    ceoReply = ceoResult.reply || '\u274C CEO\u54CD\u5E94\u5F02\u5E38';
  } catch(e) {
    ceoReply = '\u274C CEO\u54CD\u5E94\u5F02\u5E38: ' + e.message;
  }

  // 更新CEO回复
  timeline[timeline.length - 1].content = ceoReply;

  this.conv.messages.push({ id: 'msg_' + Date.now(), userMessage: userMessage, timeline: timeline, time: new Date().toISOString() });
  saveConv(this.conv);

  return { messages: timeline };
};

ChatWorkspace.prototype.getHistory = function(limit) {
  return (this.conv.messages || []).slice(-(limit || 50));
};

ChatWorkspace.prototype.getStatus = function() {
  var agents = loadAgents();
  var tasks = [];
  try { tasks = JSON.parse(fs.readFileSync(path.join(BASE, 'tasks.json'), 'utf-8')); } catch(e) {}
  return {
    ceoStatus: 'running',
    totalAgents: agents.length,
    activeConversations: (this.conv.messages || []).length,
    totalTasks: tasks.length
  };
};

module.exports = ChatWorkspace;
