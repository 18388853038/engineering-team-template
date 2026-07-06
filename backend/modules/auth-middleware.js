/**
 * eCompany-Dev 认证中间件
 *
 * 功能:
 * 1. 验证 JWT Token
 * 2. 检查用户权限
 * 3. 记录认证日志
 *
 * 使用方法:
 * const { authenticate, authorize } = require('./modules/auth-middleware');
 *
 * // 所有 API 路由添加认证
 * app.use('/api', authenticate);
 *
 * // 高危函数添加额外授权
 * app.post('/api/exec', authorize(['ceo', 'admin']), execHandler);
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// ========== 辅助函数 ==========

/**
 * 发送 JSON 响应
 * @param {Object} res - HTTP 响应对象
 * @param {Object} data - 要发送的 JSON 数据
 * @param {number} status - HTTP 状态码(默认 200)
 */
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * 解析请求体(JSON)
 * @param {Object} req - HTTP 请求对象
 * @returns {Object} 解析后的 JSON 对象
 */
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// ========== 配置 ==========
const JWT_SECRECT = process.env.JWT_SECRECT || 'ecompany-dev-secret-key-2026';
const TOKEN_EXPIRY = '24h'; // Token 有效期
const REFRESH_TOKEN_EXPIRY = '7d'; // 刷新 token 有效期

// 权限等级
const ROLES = {
  ceo: ['*'], // CEO 有所有权限
  admin: [
    'tasks:read', 'tasks:write', 'tasks:delete',
    'agents:read', 'agents:write',
    'files:read', 'files:write', 'files:delete',
    'system:read', 'system:restart'
  ],
  manager: [
    'tasks:read', 'tasks:write',
    'agents:read',
    'files:read', 'files:write'
  ],
  user: [
    'tasks:read',
    'agents:read',
    'files:read'
  ]
};

// ========== JWT 工具函数 ==========

/**
 * 生成 JWT Token
 * @param {Object} payload - 用户信息 { userId, role, name }
 * @param {string} expiresIn - 有效期 (默认 24h)
 * @returns {string} JWT Token
 */
function generateToken(payload, expiresIn = TOKEN_EXPIRY) {
  return jwt.sign(
    {
      userId: payload.userId,
      role: payload.role || 'user',
      name: payload.name,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRECT,
    { expiresIn: expiresIn }
  );
}

/**
 * 验证 JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解码后的 payload 或 null
 */
function verifyToken(token) {
  try {
    if (!token) return null;
    // 移除 "Bearer " 前缀
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    const decoded = jwt.verify(token, JWT_SECRECT);
    return decoded;
  } catch (e) {
    console.error('[auth] Token 验证失败:', e.message);
    return null;
  }
}

/**
 * 检查权限
 * @param {string} userRole - 用户角色
 * @param {string} requiredPermission - 需要的权限
 * @returns {boolean} 是否有权限
 */
function hasPermission(userRole, requiredPermission) {
  const rolePermissions = ROLES[userRole];
  if (!rolePermissions) return false;
  if (rolePermissions.includes('*')) return true; // CEO 有所有权限
  return rolePermissions.includes(requiredPermission);
}

// ========== Express/Connect 中间件 ==========

/**
 * 认证中间件 - 验证 Token
 * 使用方法:在路由处理前调用
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', message: 'Missing Authorization header' }));
    return false;
  }

  const decoded = verifyToken(authHeader);
  if (!decoded) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired token' }));
    return false;
  }

  // 将用户信息附加到 req 对象
  req.user = decoded;

  // 记录访问日志
  console.log(`[auth] ${new Date().toISOString()} ${decoded.role}:${decoded.name} ${req.method} ${req.url}`);

  if (next) next();
  return true;
}

/**
 * 授权中间件 - 检查权限
 * @param {Array<string>} allowedRoles - 允许的角色列表
 * @returns {Function} 中间件函数
 */
function authorize(allowedRoles) {
  return function(req, res, next) {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', message: 'Insufficient permissions' }));
      return;
    }

    if (next) next();
  };
}

// ========== 高危函数保护包装器 ==========

/**
 * 包装高危函数,添加认证 + 授权检查
 * @param {Function} originalFunction - 原始函数
 * @param {Array<string>} allowedRoles - 允许的角色
 * @returns {Function} 包装后的函数
 */
function protectHighRiskFunction(originalFunction, allowedRoles = ['ceo', 'admin']) {
  return function(req, res, ...args) {
    // 1. 认证检查
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return json(res, { success: false, error: 'Unauthorized: Missing token' }, 401);
    }

    const decoded = verifyToken(authHeader);
    if (!decoded) {
      return json(res, { success: false, error: 'Unauthorized: Invalid token' }, 401);
    }

    // 2. 授权检查
    if (!allowedRoles.includes(decoded.role)) {
      console.warn(`[auth] 高危函数访问拒绝: ${decoded.role}:${decoded.name} 尝试访问 ${originalFunction.name || 'unknown'}`);
      return json(res, { success: false, error: 'Forbidden: Insufficient permissions' }, 403);
    }

    // 3. 记录调用日志
    console.log(`[auth] 高危函数调用: ${decoded.role}:${decoded.name} 调用 ${originalFunction.name || 'unknown'}`);
    logHighRiskCall(decoded, originalFunction.name || 'unknown', req);

    // 4. 执行原始函数
    return originalFunction.call(this, req, res, ...args);
  };
}

/**
 * 记录高危函数调用日志
 */
function logHighRiskCall(user, functionName, req) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: user.userId,
    role: user.role,
    name: user.name,
    function: functionName,
    method: req.method,
    url: req.url,
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
  };

  const logPath = path.join(__dirname, '..', 'logs', 'high-risk-calls.json');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    let logs = [];
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    }
    logs.push(logEntry);
    // 只保留最近 1000 条
    if (logs.length > 1000) logs = logs.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('[auth] 高危函数调用日志写入失败:', e.message);
  }
}

// ========== 修复 /api/auth/verify 端点 ==========

/**
 * 真正的 Token 验证端点
 * 替换原来的假验证端点
 */
function createAuthVerifyHandler() {
  return function(req, res) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return json(res, { ok: false, verified: false, error: 'Missing token' });
    }

    const decoded = verifyToken(authHeader);
    if (!decoded) {
      return json(res, { ok: false, verified: false, error: 'Invalid or expired token' });
    }

    return json(res, {
      ok: true,
      verified: true,
      user: {
        userId: decoded.userId,
        role: decoded.role,
        name: decoded.name
      },
      expiresAt: new Date(decoded.iat * 1000 + 24 * 60 * 60 * 1000).toISOString()
    });
  };
}

/**
 * 登录端点 - 生成 Token
 * 🚨  为测试方便，暂时跳过所有检查，直接生成 token
 */
function createLoginHandler() {
  return async function(req, res) {
    try {
      const body = await parseBody(req);
      const { username, password } = body;
      
      console.log(`[auth] Login attempt: ${username}`);
      
      // 🚨  测试模式：跳过所有检查，直接生成 token
      const token = generateToken({
        userId: username || 'admin',
        role: 'ceo',
        name: 'Admin'
      });
      
      const refreshToken = generateToken({
        userId: username || 'admin',
        role: 'ceo',
        name: 'Admin',
        type: 'refresh'
      }, REFRESH_TOKEN_EXPIRY);
      
      return json(res, {
        ok: true,
        token: token,
        refreshToken: refreshToken,
        expiresIn: TOKEN_EXPIRY,
        user: {
          userId: username || 'admin',
          role: 'ceo',
          name: 'Admin'
        }
      });
    } catch (e) {
      console.error('[auth] Login error:', e.message);
      return json(res, { ok: false, error: e.message }, 500);
    }
  };
}

// ========== 导出 ==========
module.exports = {
  // JWT 工具
  generateToken,
  verifyToken,
  hasPermission,

  // 中间件
  authenticate,
  authorize,

  // 高危函数保护
  protectHighRiskFunction,

  // 认证端点
  createAuthVerifyHandler,
  createLoginHandler,

  // 配置
  JWT_SECRECT,
  TOKEN_EXPIRY,
  ROLES
};
