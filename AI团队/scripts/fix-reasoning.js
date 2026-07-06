const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Fix: include reasoning_content when pushing tool call responses back
const oldPush = "currentMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });";
const newPush = "var asstMsg = { role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls };\n        if (msg.reasoning_content) asstMsg.reasoning_content = msg.reasoning_content;\n        currentMessages.push(asstMsg);";

if (c.includes(oldPush)) {
  c = c.replace(oldPush, newPush);
  // Also fix the second occurrence for the tool_calls iteration
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Fixed reasoning_content handling');
} else {
  console.log('Pattern not found');
  // Try different patterns
  const patterns = [
    "currentMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls })",
    "currentMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls })",
  ];
  for (const p of patterns) {
    if (c.includes(p)) {
      console.log('Found alternate pattern');
      break;
    }
  }
}
