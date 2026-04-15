# 工程团队 - API设计规范

_版本 1.0 · 2026-04-13_

---

## 1. 设计原则

### 1.1 RESTful 原则
- **资源导向**：API围绕资源设计，而非操作
- **统一接口**：使用标准HTTP方法
- **无状态**：每个请求包含所有必要信息
- **可缓存**：响应应指示是否可缓存
- **分层系统**：客户端无需了解底层实现

### 1.2 核心准则
- **简洁性**：API简单易用，易于理解
- **一致性**：遵循一致的命名和结构
- **可预测性**：用户能预测API的行为
- **灵活性**：支持未来扩展，不破坏现有客户端
- **安全性**：默认安全，最小权限原则

---

## 2. 接口规范

### 2.1 基础格式
```http
# 请求
GET /api/v1/users/123
Authorization: Bearer <token>
Accept: application/json
Content-Type: application/json

# 响应
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: abc123-def456

{
  "data": {
    "id": "123",
    "name": "张三",
    "email": "zhangsan@example.com"
  },
  "meta": {
    "timestamp": "2026-04-13T22:55:00Z"
  }
}
```

### 2.2 HTTP方法映射
| 操作 | HTTP方法 | 路径 | 描述 |
|------|----------|------|------|
| 创建资源 | POST | `/resource` | 创建新资源 |
| 读取资源 | GET | `/resource/{id}` | 获取单个资源 |
| 读取列表 | GET | `/resource` | 获取资源列表 |
| 更新资源 | PUT/PATCH | `/resource/{id}` | 更新整个/部分资源 |
| 删除资源 | DELETE | `/resource/{id}` | 删除资源 |
| 自定义操作 | POST | `/resource/{id}/action` | 执行特定操作 |

### 2.3 状态码使用
| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | OK | 成功请求，返回数据 |
| 201 | Created | 资源创建成功 |
| 204 | No Content | 成功请求，无返回数据 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或认证失败 |
| 403 | Forbidden | 认证成功但无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复创建） |
| 422 | Unprocessable Entity | 业务逻辑错误 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 3. 资源设计

### 3.1 资源命名
| 资源类型 | 命名规则 | 示例 |
|----------|----------|------|
| 单一资源 | 单数名词 | `/user/{id}` |
| 集合资源 | 复数名词 | `/users` |
| 子资源 | 父资源+子资源 | `/users/{id}/orders` |
| 操作资源 | 资源+动作 | `/users/{id}/activate` |

### 3.2 URL结构
```
/api/{version}/{resource}/{id}/{sub-resource}
```

**版本控制**：
- 路径版本：`/api/v1/resource`
- 头信息版本：`Accept: application/vnd.api.v1+json`
- 默认策略：路径版本，强制显式版本

**最佳实践**：
- 使用小写字母和连字符：`/api/v1/user-profiles`
- 避免动词：使用名词表示资源
- 保持简洁：URL不超过3层嵌套

### 3.3 资源标识
- 使用UUID或自增ID
- URL中传递ID：`/users/550e8400-e29b-41d4-a716-446655440000`
- 不建议使用业务字段作为ID

---

## 4. 请求规范

### 4.1 请求头
| 头信息 | 必选 | 说明 |
|--------|------|------|
| `Authorization` | 是 | 认证令牌 `Bearer <token>` |
| `Content-Type` | 是 | 请求体类型 `application/json` |
| `Accept` | 是 | 期望响应类型 `application/json` |
| `User-Agent` | 是 | 客户端标识 |
| `X-Request-ID` | 否 | 请求追踪ID |

### 4.2 查询参数
```http
GET /api/v1/users?page=1&limit=20&sort=-created_at&filter[name]=张*
```

| 参数类型 | 格式 | 示例 |
|----------|------|------|
| 分页 | `page`, `limit`, `offset` | `?page=1&limit=20` |
| 排序 | `sort=+field1,-field2` | `?sort=-created_at,+name` |
| 过滤 | `filter[field]=value` | `?filter[name]=张*` |
| 字段选择 | `fields=id,name,email` | `?fields=id,name` |
| 包含关联 | `include=orders,profile` | `?include=orders` |

### 4.3 请求体
```json
{
  "data": {
    "type": "users",
    "attributes": {
      "name": "张三",
      "email": "zhangsan@example.com",
      "password": "secure_password"
    },
    "relationships": {
      "roles": {
        "data": [
          { "type": "roles", "id": "1" }
        ]
      }
    }
  }
}
```

---

## 5. 响应规范

### 5.1 成功响应
```json
{
  "data": {
    "type": "users",
    "id": "123",
    "attributes": {
      "name": "张三",
      "email": "zhangsan@example.com",
      "created_at": "2026-04-13T22:55:00Z",
      "updated_at": "2026-04-13T22:55:00Z"
    },
    "relationships": {
      "roles": {
        "links": {
          "self": "/api/v1/users/123/relationships/roles",
          "related": "/api/v1/users/123/roles"
        }
      }
    },
    "links": {
      "self": "/api/v1/users/123"
    }
  },
  "included": [
    {
      "type": "roles",
      "id": "1",
      "attributes": {
        "name": "管理员"
      }
    }
  ],
  "meta": {
    "timestamp": "2026-04-13T22:55:00Z",
    "total_count": 1,
    "page": 1,
    "limit": 20
  },
  "links": {
    "self": "/api/v1/users?page=1&limit=20",
    "first": "/api/v1/users?page=1&limit=20",
    "prev": null,
    "next": "/api/v1/users?page=2&limit=20",
    "last": "/api/v1/users?page=5&limit=20"
  }
}
```

### 5.2 错误响应
```json
{
  "errors": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "400",
      "code": "VALIDATION_ERROR",
      "title": "参数验证失败",
      "detail": "邮箱格式不正确",
      "source": {
        "pointer": "/data/attributes/email"
      },
      "meta": {
        "field": "email",
        "constraint": "必须是有效的邮箱地址"
      }
    }
  ],
  "meta": {
    "timestamp": "2026-04-13T22:55:00Z",
    "request_id": "abc123-def456"
  }
}
```

### 5.3 分页响应
```json
{
  "data": [...],
  "meta": {
    "total_count": 100,
    "page": 1,
    "limit": 20,
    "total_pages": 5
  },
  "links": {
    "self": "/api/v1/users?page=1&limit=20",
    "first": "/api/v1/users?page=1&limit=20",
    "prev": null,
    "next": "/api/v1/users?page=2&limit=20",
    "last": "/api/v1/users?page=5&limit=20"
  }
}
```

---

## 6. 数据格式

### 6.1 时间格式
- **ISO 8601**：`YYYY-MM-DDTHH:mm:ss.sssZ`
- 示例：`2026-04-13T22:55:00.000Z`
- 时区：统一使用UTC

### 6.2 数字格式
- 整数：无小数位
- 浮点数：保留2位小数
- 大数字：使用字符串避免精度丢失

### 6.3 布尔值
- 使用 `true`/`false`，避免 `1`/`0`

### 6.4 枚举值
```json
{
  "status": "active",  // active/inactive/pending
  "type": "user"       // user/admin/guest
}
```

---

## 7. 安全规范

### 7.1 认证机制
| 认证方式 | 适用场景 | 实现 |
|----------|----------|------|
| Bearer Token | 移动端、Web端 | OAuth 2.0 |
| API Key | 服务间调用 | 自定义头 `X-API-Key` |
| JWT | 无状态认证 | HS256/RS256签名 |
| Session | 传统Web应用 | Cookie + Session |

### 7.2 授权控制
- **RBAC**：基于角色的访问控制
- **ABAC**：基于属性的访问控制
- **Scope**：OAuth 2.0权限范围
- 默认拒绝：未明确允许即拒绝

### 7.3 速率限制
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1614556800
Retry-After: 60
```

### 7.4 数据保护
- 敏感字段脱敏（密码、token、密钥）
- HTTPS强制使用
- 输入验证和过滤
- 输出编码防止XSS

---

## 8. 版本管理

### 8.1 版本策略
- **主版本**：不兼容的重大变更
- **次版本**：向后兼容的功能增加
- **修订版本**：向后兼容的错误修复

### 8.2 版本演进
1. 发布新版本时，旧版本至少维护6个月
2. 提供版本迁移指南
3. 监控旧版本使用情况
4. 提前通知版本废弃

### 8.3 多版本支持
```nginx
# Nginx配置示例
location ~ ^/api/v1/ {
    proxy_pass http://backend-v1;
}

location ~ ^/api/v2/ {
    proxy_pass http://backend-v2;
}
```

---

## 9. 文档规范

### 9.1 OpenAPI规范
```yaml
openapi: 3.0.0
info:
  title: 用户服务API
  version: 1.0.0
paths:
  /users:
    get:
      summary: 获取用户列表
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
```

### 9.2 文档生成工具
- **Swagger UI**：交互式API文档
- **ReDoc**：可读性强的文档
- **Postman**：API测试和文档

### 9.3 文档内容要求
- 接口描述和用途
- 请求/响应示例
- 参数说明和约束
- 错误码和解决方案
- 认证和授权要求

---

## 10. 测试规范

### 10.1 测试类型
| 测试类型 | 覆盖范围 | 工具 |
|----------|----------|------|
| 单元测试 | 单个API端点 | pytest, Jest |
| 集成测试 | 完整业务流程 | Postman, Newman |
| 性能测试 | 并发和响应时间 | k6, JMeter |
| 安全测试 | 认证和授权 | OWASP ZAP |

### 10.2 测试数据
- 使用测试数据库或内存数据库
- 每个测试用例独立数据
- 测试后清理数据
- 使用工厂模式生成测试数据

### 10.3 自动化测试
```yaml
# GitHub Actions示例
name: API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run API Tests
        run: |
          npm test
          npm run test:integration
```

---

## 11. 监控与日志

### 11.1 监控指标
| 指标 | 说明 | 阈值 |
|------|------|------|
| 请求成功率 | 成功请求比例 | >99.5% |
| 平均响应时间 | API响应时间 | <200ms |
| P95响应时间 | 95%请求响应时间 | <500ms |
| 错误率 | 错误请求比例 | <0.5% |

### 11.2 日志格式
```json
{
  "timestamp": "2026-04-13T22:55:00.000Z",
  "level": "INFO",
  "request_id": "abc123-def456",
  "method": "GET",
  "path": "/api/v1/users/123",
  "status": 200,
  "duration_ms": 45,
  "user_id": "user_123",
  "client_ip": "192.168.1.100"
}
```

### 11.3 告警规则
- 错误率 > 1% 持续5分钟
- 平均响应时间 > 500ms 持续10分钟
- P95响应时间 > 1000ms 持续5分钟

---

## 12. 最佳实践

### 12.1 设计最佳实践
- **单一职责**：每个API端点职责明确
- **幂等性**：PUT/DELETE操作幂等
- **渐进增强**：支持可选参数和功能
- **向后兼容**：避免破坏性变更

### 12.2 开发最佳实践
- **API优先**：先定义接口，再实现
- **契约测试**：确保客户端-服务端契约
- **版本管理**：明确版本生命周期
- **文档驱动**：文档与代码同步更新

### 12.3 运维最佳实践
- **健康检查**：`GET /health` 端点
- **优雅降级**：依赖服务失败时提供基础功能
- **限流熔断**：防止雪崩效应
- **监控告警**：实时监控API状态

---

## 附录

### A. 常用HTTP头
| 头信息 | 示例 | 说明 |
|--------|------|------|
| `Accept` | `application/json` | 期望响应格式 |
| `Content-Type` | `application/json` | 请求体格式 |
| `Authorization` | `Bearer token123` | 认证令牌 |
| `User-Agent` | `MyApp/1.0` | 客户端标识 |
| `X-Request-ID` | `req-123456` | 请求追踪ID |

### B. 常用状态码
| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | OK | 成功 |
| 201 | Created | 创建成功 |
| 204 | No Content | 成功无内容 |
| 400 | Bad Request | 参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 422 | Unprocessable | 业务逻辑错误 |
| 429 | Too Many | 请求过多 |
| 500 | Internal | 服务器错误 |

### C. 参考标准
- [REST API Design Guide](https://restfulapi.net/)
- [JSON API Specification](https://jsonapi.org/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines)

---

_本规范由工程团队 @Architect 编写，团队全员遵守执行_