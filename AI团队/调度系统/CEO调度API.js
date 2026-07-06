# CEO调度系统 · 任务分发API

> 集成到 eCompany server，让所有员工Agent化后可通过统一接口调度
> 小龙(CEO) 通过此系统 + OpenClaw sessions_spawn 进行任务分发

## API 端点

将以下路由注入 eCompany server-modern.js

```javascript
// ================ CEO 调度系统 v4 ================

/**
 * 1. 智能拆解任务
 * POST /api/v4/decompose
 * 接收高级任务描述 → AI拆解为可执行的子任务列表
 */
app.post('/api/v4/decompose', async (req, res) => {
  const { mission } = req.body;
  // 调用 AI 进行任务拆解,参考员工技能库匹配合适人选
  const subtasks = await decomposeMission(mission);
  res.json({ ok: true, subtasks });
});

/**
 * 2. 创建任务批次
 * POST /api/v4/dispatch
 * 将拆解后的子任务批量分发
 */
app.post('/api/v4/dispatch', async (req, res) => {
  const { batch, mission } = req.body;
  // 写入数据库,生成批次ID
  const batchId = uuid();
  // 为每个子任务分配员工
  const assignments = await assignSubtasks(batch, batchId);
  res.json({ ok: true, batchId, assignments });
});

/**
 * 3. 查询任务状态
 * GET /api/v4/status/:batchId
 */
app.get('/api/v4/status/:batchId', (req, res) => {
  const tasks = db.getTasksByBatch(req.params.batchId);
  res.json({ ok: true, tasks });
});

/**
 * 4. 提交子任务成果
 * POST /api/v4/submit
 * 员工完成工作后提交成果
 */
app.post('/api/v4/submit', async (req, res) => {
  const { taskId, result, employeeId } = req.body;
  // 记录成果,更新状态
  db.updateTask(taskId, { status: 'completed', result, completedAt: new Date() });
  res.json({ ok: true });
});

/**
 * 5. CEO验收
 * POST /api/v4/review
 * 汇总所有子任务成果,生成验收报告
 */
app.post('/api/v4/review', async (req, res) => {
  const { batchId } = req.body;
  const tasks = db.getTasksByBatch(batchId);
  const report = await generateReviewReport(tasks);
  res.json({ ok: true, report });
});

/**
 * 6. 员工能力查询
 * GET /api/v4/employees?skill=xxx&role=xxx
 * 按技能/角色筛选可调用的员工
 */
app.get('/api/v4/employees', (req, res) => {
  const { skill, role } = req.query;
  let result = [...allEmployees];
  if (skill) result = result.filter(e => e.skills.some(s => s.includes(skill)));
  if (role) result = result.filter(e => e.role === role);
  res.json({ ok: true, employees: result.map(e => ({
    id: e.id, name: e.name_cn, title: e.title,
    skills: e.skills.slice(0, 5), status: e.status
  }))});
});
```
