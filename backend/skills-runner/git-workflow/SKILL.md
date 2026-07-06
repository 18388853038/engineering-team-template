---
name: git-workflow
description: Git 工作流最佳实践，涵盖分支策略、冲突解决、提交规范、代码合并
---

# Git Workflow - Git 工作流

## 适用场景
- 创建分支与切换
- 提交规范与消息格式
- 合并与变基策略
- 冲突解决
- 回滚与修复

## 分支策略（推荐）

```
main          ← 生产分支，只合并经过测试的代码
  ├ develop   ← 开发主分支，日常开发的基础
  │   ├ feature/xxx  ← 功能分支，从 develop 拉出
  │   ├ bugfix/xxx   ← 修复分支
  │   └ hotfix/xxx   ← 紧急修复，从 main 拉出
```

### 日常工作流
```bash
# 拉取最新代码
git checkout develop
git pull origin develop

# 创建功能分支
git checkout -b feature/add-login

# 开发中多次提交
git add .
git commit -m "feat: add login form component"

# 完成后合并回 develop
git checkout develop
git pull origin develop
git merge feature/add-login
git branch -d feature/add-login  # 删除本地分支
```

## 提交消息规范（Conventional Commits）

```
<type>: <简短描述>

<详细说明（可选）>
```

### 类型
| 类型 | 说明 |
|:---|:---|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构（不新增功能也不修 Bug） |
| style | 代码风格变动（格式化等） |
| docs | 文档更新 |
| test | 测试相关 |
| chore | 构建/工具/依赖相关 |

### 示例
```
feat: add user login API with JWT auth

- POST /api/auth/login endpoint
- JWT token generation and validation
- Password hashing with bcrypt
```

## 合并 vs 变基

```bash
# 合并（保留完整历史）
git merge feature/login     # 产生一个 merge commit

# 变基（线性历史，更干净）
git checkout feature/login
git rebase develop          # 将 feature 的提交放到 develop 最新提交之后
git checkout develop
git merge feature/login     # fast-forward 合并
```

**原则**：公共分支用 merge，私有分支用 rebase

## 冲突解决

```bash
# 发生冲突时
git status                   # 查看冲突文件
# 编辑文件解决冲突（手动合并 <<<<<<< 和 >>>>>>> 之间的代码）
git add <resolved-file>
git commit                   # 或 git rebase --continue
```

## 常用修复命令

```bash
# 修改最后一次提交信息
git commit --amend -m "new message"

# 撤销工作区改动
git checkout -- filename

# 撤销暂存区
git reset HEAD filename

# 回退到某个提交（保留工作区）
git reset --soft HEAD~1

# 回退到某个提交（丢弃工作区）
git reset --hard HEAD~1

# 撤销某次提交（创建反向提交）
git revert <commit-hash>

# 暂存当前工作
git stash
git stash pop
```
