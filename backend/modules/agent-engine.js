/**
 * agent-engine.js — eCompany Agent 记忆引擎
 *
 * 角色工具已迁移到 tools-registry.js（ROLE_TOOLS 段），
 * 角色 prompt 由 agent-executor.js 的 buildPrompt 处理。
 * 这里仅保留员工记忆系统（JSON文件读写）。
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function loadAgentMemory(agentId) {
  try {
    const file = path.join(MEMORY_DIR, 'agent-' + agentId + '.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch(e) {}
  return { decisions: [], notes: [], status: 'idle', currentTask: null, lastActive: null };
}

function saveAgentMemory(agentId, mem) {
  try {
    const file = path.join(MEMORY_DIR, 'agent-' + agentId + '.json');
    if (mem.decisions && mem.decisions.length > 100) mem.decisions = mem.decisions.slice(-100);
    fs.writeFileSync(file, JSON.stringify(mem), 'utf-8');
  } catch(e) {}
}

module.exports = {
  loadAgentMemory: loadAgentMemory,
  saveAgentMemory: saveAgentMemory
};
