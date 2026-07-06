/**
 * eCompany 文件权限管理系统
 * 
 * 为所有AI员工提供精细化的本地文件读写权限控制
 * 
 * 功能：
 * 1. 角色级别文件权限
 * 2. Agent级别权限覆盖
 * 3. 文件类型权限控制
 * 4. 路径白名单/黑名单
 * 5. 文件操作审计
 * 6. CEO权限管理接口
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..');
const PERMISSIONS_FILE = path.join(CONFIG_DIR, 'file-permissions.json');
const AUDIT_FILE = path.join(CONFIG_DIR, 'file-permissions-audit.json');

// ========== 默认文件权限配置 ==========
const DEFAULTS = {
  // 默认角色文件权限
  rolePermissions: {
    // CEO - 最高权限
    ceo: {
      description: 'CEO - 最高权限',
      readPaths: ['*'],           // 所有路径可读
      writePaths: ['*'],          // 所有路径可写
      allowedExtensions: ['*'],   // 所有扩展名
      maxFileSize: Infinity,       // 无限制
      canDelete: true,
      canCreateDir: true,
      canExecute: true
    },
    // C-Suite 高管
    c_suite: {
      description: 'C-Suite 高管',
      readPaths: ['*'],
      writePaths: ['/data', '/logs', '/config'],
      allowedExtensions: ['.json', '.txt', '.log', '.md', '.yaml', '.yml'],
      maxFileSize: 100 * 1024 * 1024,  // 100MB
      canDelete: false,
      canCreateDir: false,
      canExecute: false
    },
    // 总监
    director: {
      description: '部门总监',
      readPaths: ['/data', '/logs', '/config', '/projects'],
      writePaths: ['/data', '/logs'],
      allowedExtensions: ['.json', '.txt', '.log', '.md'],
      maxFileSize: 50 * 1024 * 1024,  // 50MB
      canDelete: false,
      canCreateDir: false,
      canExecute: false
    },
    // 资深工程师
    senior: {
      description: '资深工程师',
      readPaths: ['/data', '/logs', '/projects', '/src'],
      writePaths: ['/data/output', '/projects/*/src'],
      allowedExtensions: ['.js', '.ts', '.vue', '.css', '.html', '.json', '.txt', '.md', '.py', '.go', '.rs'],
      maxFileSize: 10 * 1024 * 1024,  // 10MB
      canDelete: false,
      canCreateDir: false,
      canExecute: true
    },
    // 普通工程师
    staff: {
      description: '普通工程师',
      readPaths: ['/data', '/projects'],
      writePaths: ['/data/output'],
      allowedExtensions: ['.js', '.ts', '.vue', '.css', '.json', '.txt', '.md'],
      maxFileSize: 5 * 1024 * 1024,   // 5MB
      canDelete: false,
      canCreateDir: false,
      canExecute: false
    },
    // 全栈工程师
    fullstack: {
      description: '全栈工程师',
      readPaths: ['/data', '/logs', '/projects', '/src', '/backend', '/frontend'],
      writePaths: ['/data', '/projects', '/backend', '/frontend'],
      allowedExtensions: ['.js', '.ts', '.vue', '.css', '.html', '.json', '.txt', '.md', '.py', '.go', '.sh', '.bat'],
      maxFileSize: 20 * 1024 * 1024,  // 20MB
      canDelete: true,
      canCreateDir: true,
      canExecute: true
    },
    // 测试工程师
    testing: {
      description: '测试工程师',
      readPaths: ['/data', '/logs', '/projects', '/src'],
      writePaths: ['/data/test-results'],
      allowedExtensions: ['.js', '.json', '.txt', '.log', '.xml', '.html'],
      maxFileSize: 50 * 1024 * 1024,  // 50MB
      canDelete: false,
      canCreateDir: false,
      canExecute: false
    },
    // 运维工程师
    devops: {
      description: '运维工程师',
      readPaths: ['*'],
      writePaths: ['/logs', '/config', '/deploy'],
      allowedExtensions: ['.sh', '.bat', '.ps1', '.yaml', '.yml', '.json', '.txt', '.log'],
      maxFileSize: 100 * 1024 * 1024,  // 100MB
      canDelete: true,
      canCreateDir: true,
      canExecute: true
    },
    // 安全工程师
    security: {
      description: '安全工程师',
      readPaths: ['*'],
      writePaths: ['/logs', '/security'],
      allowedExtensions: ['.json', '.txt', '.log', '.yaml', '.yml', '.html'],
      maxFileSize: 50 * 1024 * 1024,  // 50MB
      canDelete: false,
      canCreateDir: false,
      canExecute: false
    }
  },
  
  // 全局路径配置
  globalPaths: {
    workspace: '/workspace',
    data: '/data',
    logs: '/logs',
    projects: '/projects',
    src: '/src',
    backend: '/backend',
    frontend: '/frontend',
    config: '/config',
    security: '/security',
    deploy: '/deploy'
  },
  
  // 全局限流
  rateLimits: {
    readPerMinute: 100,
    writePerMinute: 50,
    deletePerHour: 10
  },
  
  // Agent级别覆盖
  agentOverrides: {}
};

// ========== 文件权限检查器 ==========
class FilePermissionManager {
  constructor() {
    this.config = this._load();
    this.auditLog = this._loadAudit();
  }

  // ========== 配置加载 ==========
  _load() {
    try {
      if (fs.existsSync(PERMISSIONS_FILE)) {
        const saved = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf-8'));
        return this._mergeDefaults(saved);
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  _mergeDefaults(saved) {
    const merged = JSON.parse(JSON.stringify(DEFAULTS));
    
    // 合并角色权限
    if (saved.rolePermissions) {
      for (const [role, perms] of Object.entries(saved.rolePermissions)) {
        if (merged.rolePermissions[role]) {
          merged.rolePermissions[role] = { ...merged.rolePermissions[role], ...perms };
        } else {
          merged.rolePermissions[role] = perms;
        }
      }
    }
    
    // 合并全局配置
    if (saved.globalPaths) merged.globalPaths = { ...merged.globalPaths, ...saved.globalPaths };
    if (saved.rateLimits) merged.rateLimits = { ...merged.rateLimits, ...saved.rateLimits };
    if (saved.agentOverrides) merged.agentOverrides = saved.agentOverrides;
    
    return merged;
  }

  _save() {
    try {
      fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch(e) {}
  }

  _loadAudit() {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
      }
    } catch(e) {}
    return { entries: [] };
  }

  _saveAudit() {
    try {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(this.auditLog, null, 2), 'utf-8');
    } catch(e) {}
  }

  // ========== 权限检查 ==========

  /**
   * 获取Agent的文件权限配置
   */
  getAgentPermissions(agentId, agentRole, agentCategory) {
    // 1. 检查Agent级别覆盖
    if (this.config.agentOverrides[agentId]) {
      return { ...this._getBasePermissions(agentRole || agentCategory), ...this.config.agentOverrides[agentId] };
    }
    
    // 2. 返回角色权限
    return this._getBasePermissions(agentRole || agentCategory);
  }

  _getBasePermissions(role) {
    // 尝试多种角色名称
    const roleLower = (role || 'staff').toLowerCase();
    
    if (this.config.rolePermissions[roleLower]) {
      return { ...this.config.rolePermissions[roleLower] };
    }
    
    // 特殊映射
    const roleMap = {
      'c_suite': 'c_suite',
      'csuite': 'c_suite',
      'senior': 'senior',
      'staff': 'staff',
      'fullstack': 'fullstack',
      'full_stack': 'fullstack',
      'director': 'director',
      'testing': 'testing',
      'devops': 'devops',
      'security': 'security',
      'ceo': 'ceo'
    };
    
    const mapped = roleMap[roleLower] || 'staff';
    return { ...this.config.rolePermissions[mapped] };
  }

  /**
   * 检查文件读取权限
   */
  checkRead(agentId, agentRole, agentCategory, filePath) {
    const perms = this.getAgentPermissions(agentId, agentRole, agentCategory);
    
    // CEO拥有所有权限
    if (perms.readPaths.includes('*')) {
      return { allowed: true, reason: 'CEO权限' };
    }
    
    // 检查路径
    const normalizedPath = this._normalizePath(filePath);
    const canRead = perms.readPaths.some(p => this._matchPath(p, normalizedPath));
    
    if (!canRead) {
      this._logAudit(agentId, 'read', filePath, false, '路径不在白名单');
      return { allowed: false, reason: '路径不在白名单' };
    }
    
    this._logAudit(agentId, 'read', filePath, true);
    return { allowed: true, reason: '权限允许' };
  }

  /**
   * 检查文件写入权限
   */
  checkWrite(agentId, agentRole, agentCategory, filePath) {
    const perms = this.getAgentPermissions(agentId, agentRole, agentCategory);
    
    // CEO拥有所有权限
    if (perms.writePaths.includes('*')) {
      return { allowed: true, reason: 'CEO权限' };
    }
    
    // 检查路径
    const normalizedPath = this._normalizePath(filePath);
    const canWrite = perms.writePaths.some(p => this._matchPath(p, normalizedPath));
    
    if (!canWrite) {
      this._logAudit(agentId, 'write', filePath, false, '路径不在白名单');
      return { allowed: false, reason: '路径不在白名单' };
    }
    
    // 检查扩展名
    const ext = path.extname(filePath).toLowerCase();
    if (!perms.allowedExtensions.includes('*') && !perms.allowedExtensions.includes(ext)) {
      this._logAudit(agentId, 'write', filePath, false, `扩展名 ${ext} 不允许`);
      return { allowed: false, reason: `扩展名 ${ext} 不允许` };
    }
    
    // 检查删除权限
    if (!perms.canDelete && this._isDeleteOperation(filePath)) {
      this._logAudit(agentId, 'delete', filePath, false, '角色无删除权限');
      return { allowed: false, reason: '角色无删除权限' };
    }
    
    // 检查执行权限
    if (this._isExecuteOperation(filePath) && !perms.canExecute) {
      this._logAudit(agentId, 'execute', filePath, false, '角色无执行权限');
      return { allowed: false, reason: '角色无执行权限' };
    }
    
    this._logAudit(agentId, 'write', filePath, true);
    return { allowed: true, reason: '权限允许' };
  }

  /**
   * 检查文件大小限制
   */
  checkFileSize(agentId, agentRole, agentCategory, fileSize) {
    const perms = this.getAgentPermissions(agentId, agentRole, agentCategory);
    
    if (fileSize > perms.maxFileSize) {
      return { allowed: false, reason: `文件大小 ${this._formatSize(fileSize)} 超过限制 ${this._formatSize(perms.maxFileSize)}` };
    }
    
    return { allowed: true };
  }

  /**
   * 一次性检查多个操作
   */
  checkAll(agentId, agentRole, agentCategory, operations) {
    const results = {};
    
    for (const [op, filePath] of Object.entries(operations)) {
      if (op === 'read') {
        results[op] = this.checkRead(agentId, agentRole, agentCategory, filePath);
      } else if (op === 'write') {
        results[op] = this.checkWrite(agentId, agentRole, agentCategory, filePath);
      } else if (op === 'execute') {
        results[op] = this.checkWrite(agentId, agentRole, agentCategory, filePath); // 执行也需要写权限
      } else if (op === 'delete') {
        results[op] = this.checkWrite(agentId, agentRole, agentCategory, filePath);
      }
    }
    
    const allAllowed = Object.values(results).every(r => r.allowed);
    
    return {
      allAllowed,
      results,
      deniedCount: Object.values(results).filter(r => !r.allowed).length
    };
  }

  // ========== 权限管理 ==========

  /**
   * 设置Agent级别权限覆盖
   */
  setAgentOverride(agentId, override) {
    if (!override || Object.keys(override).length === 0) {
      delete this.config.agentOverrides[agentId];
    } else {
      this.config.agentOverrides[agentId] = {
        ...(this.config.agentOverrides[agentId] || {}),
        ...override
      };
    }
    this._save();
    return { success: true, agentId };
  }

  /**
   * 获取Agent级别覆盖
   */
  getAgentOverride(agentId) {
    return this.config.agentOverrides[agentId] || null;
  }

  /**
   * 更新角色权限
   */
  updateRolePermissions(role, permissions) {
    if (!this.config.rolePermissions[role]) {
      return { success: false, error: '角色不存在' };
    }
    
    this.config.rolePermissions[role] = {
      ...this.config.rolePermissions[role],
      ...permissions
    };
    
    this._save();
    return { success: true, role };
  }

  /**
   * 获取所有角色权限
   */
  getAllRolePermissions() {
    return Object.entries(this.config.rolePermissions).map(([role, perms]) => ({
      role,
      ...perms
    }));
  }

  /**
   * 添加路径到白名单
   */
  addPathToWhitelist(agentId, role, pathType, newPath) {
    const perms = this.getAgentPermissions(agentId, role, role);
    
    if (pathType === 'read') {
      perms.readPaths.push(newPath);
    } else if (pathType === 'write') {
      perms.writePaths.push(newPath);
    }
    
    this.setAgentOverride(agentId, perms);
    return { success: true };
  }

  /**
   * 添加允许的扩展名
   */
  addAllowedExtension(agentId, role, extension) {
    const perms = this.getAgentPermissions(agentId, role, role);
    
    if (!perms.allowedExtensions.includes(extension)) {
      perms.allowedExtensions.push(extension);
      this.setAgentOverride(agentId, perms);
    }
    
    return { success: true };
  }

  // ========== 审计日志 ==========

  _logAudit(agentId, operation, filePath, allowed, reason = '') {
    this.auditLog.entries.push({
      agentId,
      operation,  // read, write, delete, execute
      filePath,
      allowed,
      reason,
      timestamp: new Date().toISOString()
    });
    
    // 保留最近10000条
    if (this.auditLog.entries.length > 10000) {
      this.auditLog.entries = this.auditLog.entries.slice(-5000);
    }
    
    this._saveAudit();
  }

  /**
   * 获取审计日志
   */
  getAuditLog(options = {}) {
    let entries = this.auditLog.entries;
    
    if (options.agentId) {
      entries = entries.filter(e => e.agentId === options.agentId);
    }
    
    if (options.operation) {
      entries = entries.filter(e => e.operation === options.operation);
    }
    
    if (options.allowed !== undefined) {
      entries = entries.filter(e => e.allowed === options.allowed);
    }
    
    if (options.since) {
      const since = new Date(options.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() > since);
    }
    
    return entries.slice(-(options.limit || 100));
  }

  /**
   * 获取审计统计
   */
  getAuditStats() {
    const entries = this.auditLog.entries;
    const now = Date.now();
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;
    
    return {
      total: entries.length,
      last24h: entries.filter(e => new Date(e.timestamp).getTime() > dayAgo).length,
      last1h: entries.filter(e => new Date(e.timestamp).getTime() > hourAgo).length,
      denied: entries.filter(e => !e.allowed).length,
      byOperation: {
        read: entries.filter(e => e.operation === 'read').length,
        write: entries.filter(e => e.operation === 'write').length,
        delete: entries.filter(e => e.operation === 'delete').length,
        execute: entries.filter(e => e.operation === 'execute').length
      },
      topDenied: this._getTopDenied()
    };
  }

  _getTopDenied() {
    const denied = this.auditLog.entries.filter(e => !e.allowed);
    const counts = {};
    
    for (const entry of denied) {
      counts[entry.agentId] = (counts[entry.agentId] || 0) + 1;
    }
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agentId, count]) => ({ agentId, count }));
  }

  // ========== 工具方法 ==========

  _normalizePath(filePath) {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  _matchPath(pattern, filePath) {
    // 通配符匹配
    if (pattern === '*') return true;
    
    const normalizedPattern = this._normalizePath(pattern);
    
    // 完整匹配
    if (normalizedPattern === filePath) return true;
    
    // 前缀匹配 (* 表示任意目录)
    if (normalizedPattern.endsWith('/*')) {
      const prefix = normalizedPattern.slice(0, -2);
      return filePath.startsWith(prefix + '/');
    }
    
    // 通配符匹配 (*.js 等)
    if (normalizedPattern.includes('*')) {
      const regex = new RegExp('^' + normalizedPattern.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }
    
    // 目录前缀匹配
    if (filePath.startsWith(normalizedPattern)) return true;
    
    return false;
  }

  _isDeleteOperation(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.delete', '.remove', '.trash'].includes(ext);
  }

  _isExecuteOperation(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.exe', '.sh', '.bat', '.ps1', '.cmd', '.py', '.js', '.rb', '.go', '.rs'].includes(ext);
  }

  _formatSize(bytes) {
    if (bytes === Infinity) return '无限制';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  /**
   * 获取权限概览
   */
  getOverview() {
    return {
      roles: this.getAllRolePermissions(),
      globalPaths: this.config.globalPaths,
      rateLimits: this.config.rateLimits,
      agentOverrideCount: Object.keys(this.config.agentOverrides).length
    };
  }
}

// ========== 安全文件操作 ==========
class SecureFileOperations {
  constructor(permissionManager) {
    this.pm = permissionManager;
  }

  /**
   * 安全读取文件
   */
  secureRead(agentId, agentRole, agentCategory, filePath) {
    const check = this.pm.checkRead(agentId, agentRole, agentCategory, filePath);
    
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
    
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' };
      }
      
      const stats = fs.statSync(filePath);
      const sizeCheck = this.pm.checkFileSize(agentId, agentRole, agentCategory, stats.size);
      
      if (!sizeCheck.allowed) {
        return { success: false, error: sizeCheck.reason };
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, size: stats.size };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 安全写入文件
   */
  secureWrite(agentId, agentRole, agentCategory, filePath, content) {
    const check = this.pm.checkWrite(agentId, agentRole, agentCategory, filePath);
    
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
    
    try {
      const contentBuffer = Buffer.from(content);
      const sizeCheck = this.pm.checkFileSize(agentId, agentRole, agentCategory, contentBuffer.length);
      
      if (!sizeCheck.allowed) {
        return { success: false, error: sizeCheck.reason };
      }
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, path: filePath, size: contentBuffer.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 安全删除文件
   */
  secureDelete(agentId, agentRole, agentCategory, filePath) {
    const check = this.pm.checkWrite(agentId, agentRole, agentCategory, filePath);
    
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
    
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' };
      }
      
      fs.unlinkSync(filePath);
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 安全列出目录
   */
  secureListDir(agentId, agentRole, agentCategory, dirPath) {
    const check = this.pm.checkRead(agentId, agentRole, agentCategory, dirPath);
    
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
    
    try {
      if (!fs.existsSync(dirPath)) {
        return { success: false, error: '目录不存在' };
      }
      
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const result = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, item.name)
      }));
      
      return { success: true, items: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// 导出单例
let instance = null;
let secureOps = null;

function getFilePermissionInstance() {
  if (!instance) {
    instance = new FilePermissionManager();
    secureOps = new SecureFileOperations(instance);
  }
  return instance;
}

function getSecureFileOperations() {
  if (!secureOps) {
    getFilePermissionInstance();
  }
  return secureOps;
}

module.exports = {
  FilePermissionManager,
  SecureFileOperations,
  DEFAULTS,
  getFilePermissionInstance,
  getSecureFileOperations
};
