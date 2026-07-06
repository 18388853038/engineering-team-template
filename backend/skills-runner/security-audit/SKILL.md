---
name: security-audit
description: 安全审计检查清单与常见漏洞防护指南，涵盖 Web 应用、API、数据库安全
---

# Security Audit - 安全审计

## 适用场景
- 代码上线前安全审查
- API 安全加固
- 依赖漏洞扫描
- 敏感信息泄露检查
- XSS/SQL 注入/CSRF 防护

## 安全审查清单

### 1. 认证与授权
- [ ] 密码是否使用 bcrypt/argon2 哈希？（禁止 MD5/SHA1）
- [ ] JWT Token 是否设置过期时间？
- [ ] 敏感 API 是否有权限校验？
- [ ] 是否有暴力破解防护（限流）？

### 2. 输入验证
- [ ] 用户输入是否经过 sanitize？（XSS 防护）
- [ ] SQL 查询是否使用参数化查询？（防注入）
- [ ] 文件上传是否有类型/大小限制？
- [ ] JSON/XML 解析是否有深度限制？

### 3. 敏感信息保护
- [ ] API Key/密码是否从环境变量读取？（非硬编码）
- [ ] .env 文件是否在 .gitignore 中？
- [ ] 日志中是否可能泄露敏感信息？
- [ ] 错误信息是否避免暴露堆栈给最终用户？

### 4. 依赖安全
- [ ] `npm audit` 是否通过？（无高危漏洞）
- [ ] 是否定期更新依赖？
- [ ] 是否只引入必要的依赖？（减少攻击面）

### 5. 传输安全
- [ ] 生产环境是否启用 HTTPS？
- [ ] CORS 配置是否限制特定域名？
- [ ] API 是否受 CSRF 保护？

### 6. Node.js 特有检查
```javascript
// ❌ 危险：路径遍历
const content = fs.readFileSync(req.query.file);

// ✅ 安全：路径校验
const base = path.resolve(__dirname, 'data');
const target = path.resolve(base, req.query.file);
if (!target.startsWith(base)) throw new Error('Access denied');

// ❌ 危险：eval
const result = eval(userInput);

// ❌ 危险：不安全的原型赋值
obj[userKey] = value;  // 可能污染原型链
```

## 常见漏洞模式

### XSS 防护
```javascript
// ❌ 直接插入用户输入
element.innerHTML = userInput;

// ✅ 安全方式
element.textContent = userInput;
// 或使用 DOMPurify
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

### SQL 注入防护
```javascript
// ❌ 字符串拼接
const sql = `SELECT * FROM users WHERE name = '${name}'`;

// ✅ 参数化查询
const sql = 'SELECT * FROM users WHERE name = ?';
db.prepare(sql).get(name);
```

## 审计命令

```bash
# npm 依赖审计
npm audit
npm audit fix           # 自动修复低风险
npm audit fix --force   # 强制修复（可能破坏兼容性）

# 扫描环境变量中的密钥
grep -r "apiKey\|secret\|password\|token" --include="*.js" --include="*.json" .
```
