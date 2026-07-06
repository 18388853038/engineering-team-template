const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend-v2\\src\\views\\Chat.vue';
let c = fs.readFileSync(f, 'utf-8');

// Add message persistence: save messages to localStorage, restore on mount
// 1. After pushing a new message, save to localStorage
c = c.replace(
  "this.messages.push({ role: 'user', content: text, files: msgFiles })",
  "this.messages.push({ role: 'user', content: text, files: msgFiles });this.saveMessages()"
);

c = c.replace(
  "this.messages.push({ role: 'system', content: r.reply || r.message || '(无回复)' })",
  "this.messages.push({ role: 'system', content: r.reply || r.message || '(无回复)' });this.saveMessages()"
);

c = c.replace(
  "this.messages.push({ role: 'system', content: '(对话服务暂不可用)' })",
  "this.messages.push({ role: 'system', content: '(对话服务暂不可用)' });this.saveMessages()"
);

c = c.replace(
  "this.messages = [{ role: 'system', content: '你好！我是' + a.name_cn + '，' + a.title + '。有什么可以帮你的？' }]",
  "this.messages = [{ role: 'system', content: '你好！我是' + a.name_cn + '，' + a.title + '。有什么可以帮你的？' }];this.saveMessages()"
);

// 2. Add saveMessages and loadMessages methods
c = c.replace(
  "    removeFile(i) { this.files.splice(i, 1) },",
  "    saveMessages() {\n      const key = 'chat_msgs_' + (this.current?.id || 'none')\n      localStorage.setItem(key, JSON.stringify(this.messages.slice(-50)))\n    },\n    loadMessages(agentId) {\n      const key = 'chat_msgs_' + agentId\n      try {\n        const saved = localStorage.getItem(key)\n        if (saved) this.messages = JSON.parse(saved)\n      } catch(e) {}\n    },\n    removeFile(i) { this.files.splice(i, 1) },"
);

// 3. After selectAgent, load saved messages
c = c.replace(
  "this.messages = [{ role: 'system', content: '你好！我是' + a.name_cn + '，' + a.title + '。有什么可以帮你的？' }];this.saveMessages()",
  "this.loadMessages(a.id)"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Chat persistence added');
