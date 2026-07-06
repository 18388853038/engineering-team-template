---
name: core-code-review
description: 在代码提交前或任务完成后使用，进行代码审查
---

# Code Review - 代码审查

## 概述

系统性地审查代码变更，确保质量、可维护性和正确性。适用于所有 Pull Request 和代码提交。

## 审查清单

### 1. 功能正确性
- [ ] 代码逻辑是否完全实现了需求？
- [ ] 边界条件是否处理（空值、越界、异常输入）？
- [ ] 错误处理是否完整（try/catch、错误码返回）？
- [ ] 异步操作是否有竞态条件风险？

### 2. 安全性
- [ ] 用户输入是否经过校验/转义？（防 XSS/SQL 注入）
- [ ] API Key、密码等敏感信息是否硬编码？
- [ ] 路径拼接是否有目录遍历风险？（path.resolve 检查）
- [ ] 是否有权限校验缺失？

### 3. 性能
- [ ] 是否有不必要的重复计算或 API 调用？
- [ ] 大数据集操作是否有分页/流式处理？
- [ ] 是否有内存泄漏风险？（事件监听未移除、定时器未清理）
- [ ] 数据库查询是否已加索引？

### 4. 可维护性
- [ ] 命名是否清晰、自解释？
- [ ] 是否有足够注释解释复杂逻辑？
- [ ] 函数是否过长？（建议 < 50 行）
- [ ] 是否有重复代码可提取复用？
- [ ] 配置是否硬编码而非使用环境变量？

### 5. 一致性
- [ ] 代码风格是否与项目现有代码一致？
- [ ] 错误消息格式是否统一？
- [ ] 日志级别使用是否正确（error/warn/info/debug）？
- [ ] API 响应格式是否统一（{ ok, data, error } 结构）？

### 6. 兼容性
- [ ] 新增依赖是否必要？（优先使用内置 API）
- [ ] 是否有破坏性变更影响其他模块？
- [ ] 前端改动是否兼容现有后端 API？

## 常见问题模式

```
// ❌ 未处理异步错误
const data = await fetch(url)  // 缺少 try/catch

// ✅ 正确
try { const data = await fetch(url) } catch(e) { log(e); return fallback }
```

```
// ❌ 硬编码路径
fs.readFileSync('/app/data/file.json')

// ✅ 使用相对路径
fs.readFileSync(path.join(__dirname, 'file.json'))
```

```
// ❌ 没有边界检查
function getItem(arr, idx) { return arr[idx] }

// ✅ 有边界检查
function getItem(arr, idx) {
  if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return null
  return arr[idx]
}
```

## 审查流程

1. **前提**：代码能正常构建/编译（`npm run build` 通过）
2. **通读**：先整体理解改动意图
3. **逐行检查**：按上述清单逐项过
4. **测试覆盖**：检查是否有单元测试覆盖新逻辑
5. **输出**：列出 P0/P1/P2 级别的问题和建议
   - P0: 必须修复（功能性/安全性 Bug）
   - P1: 建议修复（性能/可维护性问题）
   - P2: 可做可不做（风格/优化建议）
