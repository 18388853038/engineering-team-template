# 工程团队 - 代码规范

_版本 1.0 · 2026-04-13_

---

## 1. 通用原则

### 1.1 可读性优先
- 代码是给人读的，其次才是给机器执行
- 命名要有意义，避免缩写（除非广泛接受）
- 一行代码不超过80字符（建议）
- 函数不超过30行，类不超过300行

### 1.2 一致性原则
- 团队内部保持统一的编码风格
- 遵循语言社区的约定
- 新代码遵循规范，旧代码逐步重构

### 1.3 简洁性原则
- DRY (Don't Repeat Yourself)
- KISS (Keep It Simple, Stupid)
- YAGNI (You Aren't Gonna Need It)

---

## 2. 命名规范

### 2.1 文件命名
| 类型 | 规范 | 示例 |
|------|------|------|
| Python模块 | 小写+下划线 | `user_service.py` |
| Java类 | 大驼峰 | `UserService.java` |
| 配置文件 | 小写+连字符 | `config-dev.yaml` |
| 测试文件 | `test_`前缀 | `test_user_service.py` |

### 2.2 变量命名
| 语言 | 变量 | 常量 | 函数 |
|------|------|------|------|
| Python | 小写+下划线 | 大写+下划线 | 小写+下划线 |
| Java | 小驼峰 | 大写+下划线 | 小驼峰 |
| JavaScript | 小驼峰 | 大写+下划线 | 小驼峰 |

### 2.3 数据库命名
- 表名：小写+下划线，复数形式
- 列名：小写+下划线
- 主键：`id`
- 外键：`{table}_id`

---

## 3. 代码结构

### 3.1 文件头部
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模块说明文档

功能描述：
- 功能1
- 功能2

作者：@Architect
创建日期：2026-04-13
"""
```

### 3.2 导入顺序
1. 标准库
2. 第三方库
3. 本地模块
4. 每组用空行分隔

### 3.3 类定义
```python
class UserService:
    """用户服务类"""
    
    def __init__(self, config):
        """初始化
        
        Args:
            config: 配置对象
        """
        self.config = config
    
    def get_user(self, user_id):
        """获取用户信息
        
        Args:
            user_id: 用户ID
            
        Returns:
            User对象或None
            
        Raises:
            ValueError: 参数错误时
        """
        # 实现代码
```

---

## 4. 注释规范

### 4.1 文档注释
- 所有公共API必须有文档注释
- 使用三引号格式
- 包含：功能描述、参数、返回值、异常

### 4.2 行内注释
- 解释"为什么"，而不是"做什么"
- 复杂逻辑需要注释
- 避免废话注释

### 4.3 TODO注释
```python
# TODO(@dev): 优化查询性能，使用缓存
# FIXME: 内存泄漏问题，需要修复
```

---

## 5. 错误处理

### 5.1 异常处理原则
- 捕获具体异常，不要捕获所有异常
- 记录异常信息，包括上下文
- 对外返回友好错误信息

### 5.2 日志记录
- 使用结构化日志
- 日志级别：DEBUG < INFO < WARN < ERROR < FATAL
- 生产环境使用WARN及以上级别

### 5.3 返回值规范
- 成功返回数据对象
- 失败抛出异常或返回错误码对象
- 避免返回None表示错误

---

## 6. 测试规范

### 6.1 测试文件结构
```
tests/
├── unit/           # 单元测试
├── integration/    # 集成测试  
└── fixtures/       # 测试数据
```

### 6.2 测试命名
- 测试类：`Test{被测试类}`
- 测试方法：`test_{场景}_{期望结果}`

### 6.3 测试覆盖率
- 核心业务逻辑：>90%
- 工具类：>80%
- 整体项目：>70%

---

## 7. 安全规范

### 7.1 输入验证
- 所有外部输入必须验证
- 使用白名单验证
- 防御SQL注入、XSS等攻击

### 7.2 敏感信息
- 密码必须加密存储
- API密钥等敏感信息使用环境变量
- 日志中不能记录敏感信息

### 7.3 权限控制
- 最小权限原则
- 用户输入必须进行权限验证
- 敏感操作需要审计日志

---

## 8. 性能规范

### 8.1 数据库访问
- 避免N+1查询问题
- 合理使用索引
- 批量操作优于循环操作

### 8.2 内存使用
- 及时释放资源
- 避免内存泄漏
- 大对象使用流式处理

### 8.3 网络请求
- 设置合理的超时时间
- 使用连接池
- 重试机制要有限制

---

## 9. 工具配置

### 9.1 代码检查工具
- Python: flake8, black, isort
- Java: Checkstyle, PMD
- JavaScript: ESLint, Prettier

### 9.2 配置文件示例
`.flake8`:
```ini
[flake8]
max-line-length = 88
extend-ignore = E203
```

`.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 22.3.0
    hooks:
      - id: black
```

---

## 10. 审查流程

### 10.1 审查要点
- [ ] 功能是否正确实现
- [ ] 代码是否符合规范
- [ ] 是否有安全隐患
- [ ] 性能是否满足要求
- [ ] 测试是否覆盖充分

### 10.2 审查流程
1. 开发者创建Pull Request
2. 至少1位审查者审查
3. 通过审查后合并
4. 拒绝的PR必须修改后重新提交

---

## 附录

### A. 常用缩写表
| 缩写 | 全称 | 说明 |
|------|------|------|
| API | Application Programming Interface | 应用程序接口 |
| DB | Database | 数据库 |
| UI | User Interface | 用户界面 |
| UX | User Experience | 用户体验 |
| HTTP | Hypertext Transfer Protocol | 超文本传输协议 |

### B. 参考资源
- [Google Style Guides](https://google.github.io/styleguide/)
- [PEP 8 -- Python编码规范](https://www.python.org/dev/peps/pep-0008/)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)

---

_本规范由工程团队 @Architect 编写，团队全员遵守执行_