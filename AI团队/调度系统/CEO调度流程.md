# 🐉 CEO调度核心流程

> 小龙作为CEO，如何将老板的任务分解、分派、追踪、验收

---

## 一、任务流转核心（5步闭环）

```
                     老板需求
                        │
                    [1. 拆解]
                  小龙分析任务
                  输出子任务列表
                        │
                    [2. 分发]
                  按技能匹配员工
                  sessions_spawn
                        │
              ┌─────────┼─────────┐
              │         │         │
          张明远(CTO) 陈志远(前端) 周泽宇(后端)
          架构方案     登录页面   JWT API
              │         │         │
              └─────────┼─────────┘
                        │
                    [3. 收集]
                  等待各员工完成
                  处理异常/阻塞
                        │
                    [4. 验收]
                  小龙整合审查
                  质量把关
                        │
                    [5. 汇报]
                  提交老板确认
                  记录任务到DB
```

---

## 二、员工调度方法

### 2.1 单个员工调用

```javascript
// 调 CTO 张明远评审架构
const ctoSession = await sessions_spawn({
  task: `你叫张明远，eCompany的CTO兼首席架构师。
你的技术栈：系统架构、技术选型、团队建设、研发流程。
请评审以下架构方案并给出改进建议：
...方案内容...`,
  runtime: "subagent",
  context: "isolated",
});
```

### 2.2 批量并行调用（核心模式）

```javascript
// 老板说"做个用户登录系统"
// 1. 拆解为子任务
const subtasks = [
  { employee: "ai_cto",      name: "张明远", title: "登录系统架构设计" },
  { employee: "ai_sr_sec",   name: "段志强", title: "认证安全方案审计" },
  { employee: "ai_fe_vue",   name: "苏雨晴", title: "登录页面Vue实现" },
  { employee: "ai_be_python", name: "曹振宇", title: "JWT登录API实现" },
  { employee: "ai_test_auto", name: "沈嘉文", title: "登录流程自动化测试" },
];

// 2. 并行分发
const sessions = subtasks.map(st => sessions_spawn({
  task: `你是${st.name}，eCompany的${st.title}。
请根据任务要求完成工作，完成后提交自查结果。
任务：${st.title}
详细需求：...`,
  runtime: "subagent",
  context: "isolated",
}));

// 3. 等待所有完成
const results = await Promise.all(sessions);

// 4. 汇总验收
const report = "【CEO验收报告】...";
```

---

## 三、员工技能匹配规则

| 任务类型 | 首选员工 | 备选 |
|----------|---------|------|
| 前端页面 (Vue) | 苏雨晴 (ai_fe_vue) | 陈志远(总监) |
| 前端页面 (React) | 唐雅文 (ai_fe_react) | 刘思远(专家) |
| 后端API (Python) | 曹振宇 (ai_be_python) | 黄国栋(专家) |
| 后端API (Java) | 顾明杰 (ai_be_java) | 周泽宇(总监) |
| 后端API (Go) | 吕海川 (ai_be_go) | — |
| 架构评审 | 张明远 (ai_cto) | 孙立新(架构师) |
| 安全审计 | 段志强 (ai_sr_sec) | 王浩然(总监) |
| AI/LLM | 何晓峰 (ai_sr_ai) | — |
| 数据库 | 邓志远 (ai_db_admin) | 马思远(数据) |
| 自动化测试 | 沈嘉文 (ai_test_auto) | 吴文斌(总监) |
| 手工QA | 邱晓琳 (ai_test_manual) | 吴文斌(总监) |
| UI设计 | 朱一鸣 (ai_ui_design) | 陈志远(前端) |
| DevOps/部署 | 高天翔 (ai_sr_devops) | 白明宇(SRE) |
| 技术文档 | 欧阳明月 (ai_doc_dev) | — |
| iOS开发 | 韩旭东 (ai_mobile_ios) | 宋明辉(专家) |
| Android开发 | 陆子轩 (ai_mobile_android) | 宋明辉(专家) |
---

## 四、任务升级机制

```
员工工作
  │
  ├── 正常完成 → 提交小龙验收
  │
  ├── 遇到困难
  │     ├── 技术难点 → 升级到 张明远(CTO) 或 孙立新(架构师)
  │     └── 资源不足 → 升级到 李思源(COO)
  │
  └── 超过期限 → 小龙介入分析原因
                  重新分配或调整方案
```

---

## 五、CEO日常工作流

### 5.1 任务驱动模式

```
老板说"做个XX" 
  → 小龙拆解
  → 查询员工技能表匹配人选
  → sessions_spawn 并行分发
  → 等待结果（同时可处理其他事务）
  → 汇总验收
  → 汇报老板
```

### 5.2 定期巡检模式

```
每天早8点：
  → 检查所有进行中任务的进度
  → 对超时任务进行干预
  
每天晚8点：
  → 汇总当日完成情况
  → 生成工作简报
```

### 5.3 异常响应模式

```
员工上报阻塞
  → 立即分析问题等级
  → P0: 暂停当前工作，全力解决
  → P1: 24小时内解决
  → P2: 记录到待办列表
```
