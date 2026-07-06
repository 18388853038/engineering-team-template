/**
 * eCompany 自动化调度模块
 * 
 * 能力注入：Cron 定时任务、TaskFlow 多步工作流、Hooks 事件驱动
 * 让 eCompany 拥有ECompany AI助手的自动化编排能力
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE = __dirname;

// ========== 1. Cron 调度器 ==========
// 类似 OpenClaw cron jobs 的本地实现

class CronScheduler {
  constructor() {
    this.jobs = [];
    this.timers = new Map();
    this.loadJobs();
  }

  loadJobs() {
    try {
      const file = path.join(BASE, '..', 'cron-jobs.json');
      if (fs.existsSync(file)) {
        this.jobs = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch(e) { this.jobs = []; }
  }

  saveJobs() {
    fs.writeFileSync(path.join(BASE, '..', 'cron-jobs.json'), JSON.stringify(this.jobs, null, 2));
  }

  /**
   * 解析简单 cron 表达式
   * 支持: "every Xm" "every Xh" "daily HH:MM" "weekly D HH:MM"
   */
  parseSchedule(expr) {
    const now = new Date();
    let next = new Date(now);

    // "every 30m" "every 2h"
    const everyMatch = expr.match(/^every\s+(\d+)(m|h|s)$/);
    if (everyMatch) {
      const num = parseInt(everyMatch[1]);
      const unit = everyMatch[2];
      const ms = unit === 's' ? num * 1000 : unit === 'm' ? num * 60000 : num * 3600000;
      next.setTime(now.getTime() + ms);
      return { type: 'interval', intervalMs: ms, nextRun: next };
    }

    // "daily 09:00"
    const dailyMatch = expr.match(/^daily\s+(\d{1,2}):(\d{2})$/);
    if (dailyMatch) {
      next.setHours(parseInt(dailyMatch[1]), parseInt(dailyMatch[2]), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return { type: 'daily', nextRun: next };
    }

    return null;
  }

  addJob(name, schedule, action, params = {}) {
    const parsed = this.parseSchedule(schedule);
    if (!parsed) throw new Error(`无法解析调度表达式: ${schedule}`);

    const job = {
      id: `cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      schedule,
      action,
      params,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRun: null,
      nextRun: parsed.nextRun.toISOString(),
      runCount: 0
    };

    this.jobs.push(job);
    this.saveJobs();
    this.scheduleJob(job);
    return job;
  }

  scheduleJob(job) {
    if (!job.enabled) return;
    
    // 兼容旧格式: cronExpr / cron_expression
    var sched = job.schedule || job.cronExpr || job.cron_expression || '';
    if (!sched) return;
    const parsed = this.parseSchedule(sched);
    if (!parsed) return;

    const delay = parsed.nextRun.getTime() - Date.now();
    if (delay < 0) return;

    const timer = setTimeout(async () => {
      await this.executeJob(job);
      
      // 重新调度
      if (parsed.type === 'interval') {
        const newNext = new Date(Date.now() + parsed.intervalMs);
        job.nextRun = newNext.toISOString();
        job.lastRun = new Date().toISOString();
        job.runCount++;
        this.saveJobs();
        this.scheduleJob(job);
      } else if (parsed.type === 'daily') {
        const newParsed = this.parseSchedule(job.schedule);
        job.nextRun = newParsed.nextRun.toISOString();
        job.lastRun = new Date().toISOString();
        job.runCount++;
        this.saveJobs();
        this.scheduleJob(job);
      }
    }, Math.max(delay, 1000));

    this.timers.set(job.id, timer);
  }

  async executeJob(job) {
    console.log(`[Cron] 执行任务: ${job.name} (${job.action})`);
    
    try {
      switch (job.action) {
        case 'http':
          await fetch(job.params.url, {
            method: job.params.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: job.params.body ? JSON.stringify(job.params.body) : undefined
          });
          break;
        case 'command':
          execSync(job.params.command, { timeout: 30000 });
          break;
        case 'report':
          // 自动生成日报/周报
          await fetch('http://127.0.0.1:8002/api/report/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(job.params)
          });
          break;
        case 'workflow':
          // 通过API触发工作流
          var _wfId = job.params.workflowId || job.params.id || '';
          if (_wfId) {
            await fetch('http://127.0.0.1:8002/api/workflows/' + encodeURIComponent(_wfId) + '/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(job.params.input || {})
            });
            console.log('[Cron] 工作流触发: ' + _wfId);
          } else {
            console.log('[Cron] 工作流触发失败: 缺少 workflowId');
          }
          break;
        default:
          console.log(`[Cron] 未知操作: ${job.action}`);
      }
    } catch(e) {
      console.error(`[Cron] 任务执行失败: ${job.name}`, e.message);
    }
  }

  listJobs() {
    return this.jobs;
  }

  removeJob(id) {
    const idx = this.jobs.findIndex(j => j.id === id);
    if (idx !== -1) {
      if (this.timers.has(id)) {
        clearTimeout(this.timers.get(id));
        this.timers.delete(id);
      }
      this.jobs.splice(idx, 1);
      this.saveJobs();
    }
  }

  startAll() {
    this.jobs.forEach(job => this.scheduleJob(job));
    console.log(`[Cron] ${this.jobs.length} 个定时任务已启动`);
  }
}

// ========== 2. TaskFlow 简易工作流 ==========

class TaskFlow {
  constructor() {
    this.flows = [];
  }

  /**
   * 定义多步工作流
   * steps: [{name, handler, depends, timeout}]
   */
  defineFlow(name, steps) {
    const flow = {
      id: `flow_${Date.now()}`,
      name,
      steps: steps.map((s, i) => ({ ...s, index: i, status: 'pending', result: null })),
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    this.flows.push(flow);
    return flow;
  }

  async executeFlow(flowId) {
    const flow = this.flows.find(f => f.id === flowId);
    if (!flow) throw new Error('流程未找到');

    flow.status = 'running';

    for (const step of flow.steps) {
      if (step.status === 'done') continue;

      // 检查依赖
      if (step.depends) {
        const dep = flow.steps.find(s => s.name === step.depends);
        if (dep && dep.status !== 'done') {
          console.log(`[TaskFlow] 跳过 ${step.name}: 依赖 ${step.depends} 未完成`);
          continue;
        }
      }

      step.status = 'running';
      step.startedAt = new Date().toISOString();

      try {
        const timeout = step.timeout || 60000;
        const result = await Promise.race([
          step.handler(step.params || {}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), timeout))
        ]);
        step.status = 'done';
        step.result = result;
        step.completedAt = new Date().toISOString();
      } catch(e) {
        step.status = 'failed';
        step.error = e.message;
        flow.status = 'failed';
        return flow;
      }
    }

    flow.status = 'completed';
    flow.completedAt = new Date().toISOString();
    return flow;
  }

  getFlow(id) {
    return this.flows.find(f => f.id === id);
  }
}

// ========== 单例导出 ==========

const cronScheduler = new CronScheduler();
const taskFlow = new TaskFlow();

// Cron 崩溃恢复：启动时重新调度所有已启用的定时任务
function recoverCronJobs() {
  var jobs = cronScheduler.listJobs();
  var enabled = jobs.filter(function(j) { return j.enabled; });
  var recovered = 0;
  enabled.forEach(function(job) {
    try {
      cronScheduler.scheduleJob(job);
      recovered++;
    } catch(e) {
      console.log('[Cron] 恢复失败:', job.name, e.message);
    }
  });
  if (recovered > 0) {
    console.log('[Cron] ✅ 崩溃恢复: ' + recovered + '/' + enabled.length + ' 个定时任务已重新调度');
  }
  return recovered;
}

module.exports = {
  cronScheduler,
  taskFlow,
  recoverCronJobs
};
