/**
 * eCompany Workspace Config — Agent 数据缓存工作空间配置
 * 统一管理 Agent 运行时的文件级工作空间、缓存、上传路径
 */
const fs = require('fs');
const path = require('path');

// 项目根目录（F:\eCompanyClaw）
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');

// ========== 工作空间路径定义 ==========
const PATHS = {
  /** 根数据目录 */
  root: DATA,

  // ---- 缓存 ----
  /** LLM 响应缓存（按模型/请求哈希分片） */
  llmCache: path.join(DATA, 'cache', 'llm'),
  /** 会话缓存 */
  sessionCache: path.join(DATA, 'cache', 'sessions'),

  // ---- 工作区 ----
  /** Agent 临时工作文件（读写临时数据） */
  workspaceTemp: path.join(DATA, 'workspace', 'temp'),
  /** Agent 输出产物（生成结果/报告等） */
  workspaceOutputs: path.join(DATA, 'workspace', 'outputs'),

  // ---- 上传 ----
  /** 用户上传文件 */
  uploads: path.join(DATA, 'uploads'),

  // ---- 记忆 ----
  /** Agent 记忆文件（JSON 持久化备份） */
  memoryAgents: path.join(DATA, 'memory', 'agents'),
  /** 全局记忆 */
  memoryGlobal: path.join(DATA, 'memory', 'global'),

  // ---- 对话 ----
  /** 对话历史 */
  conversations: path.join(DATA, 'conversations'),
};

// ========== 初始化 ==========
function ensureDirs() {
  Object.values(PATHS).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// ========== 工具方法 ==========
/**
 * 获取 Agent 专属工作路径（按 agentId 隔离）
 */
function agentDir(agentId) {
  const dir = path.join(PATHS.workspaceTemp, agentId || '_default');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取 Agent 记忆文件路径
 */
function agentMemoryFile(agentId) {
  return path.join(PATHS.memoryAgents, `agent-${agentId || '_default'}.json`);
}

/**
 * 获取 Agent 输出文件路径
 */
function agentOutputFile(agentId, filename) {
  const dir = path.join(PATHS.workspaceOutputs, agentId || '_default');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

/**
 * 检查路径是否在允许的工作空间内（安全校验）
 */
function isWithinWorkspace(targetPath) {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(DATA) || resolved.startsWith(ROOT);
}

/**
 * 清理超时缓存（清理超过 maxAgeMs 的文件）
 */
function cleanCache(cacheDir, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(cacheDir)) return;
  const now = Date.now();
  fs.readdirSync(cacheDir).forEach(f => {
    const fp = path.join(cacheDir, f);
    try {
      const stat = fs.statSync(fp);
      if (stat.isFile() && (now - stat.mtimeMs) > maxAgeMs) {
        fs.unlinkSync(fp);
      }
    } catch (e) { /* ignore */ }
  });
}

// 模块暴露
module.exports = {
  ROOT,
  PATHS,
  ensureDirs,
  agentDir,
  agentMemoryFile,
  agentOutputFile,
  isWithinWorkspace,
  cleanCache,
};
