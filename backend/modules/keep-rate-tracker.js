/**
 * Keep Rate Tracker - 用户留存与任务完成率跟踪
 * 
 * 核心指标：
 * 1. Keep Rate = 用户留存率（重复使用率）
 * 2. Task Completion Rate = 任务完成率
 * 3. Redo Rate = 重做率（用户不满意重新分配的比例）
 * 4. Feature Usage = 功能使用频率
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'keep-rate-data.json');

class KeepRateTracker {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch(e) { return this._default(); }
  }

  _save() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(this.data), 'utf-8'); } catch(e) {}
  }

  _default() {
    return {
      sessions: [],        // 用户会话记录
      tasks: [],           // 任务记录
      features: {},        // 功能使用计数
      daily: {},           // 每日统计 { '2026-05-09': { tasks: 10, completed: 8, failed: 2 } }
      weekly: {},          // 每周统计
      createdAt: new Date().toISOString()
    };
  }

  // ====== 会话跟踪 ======

  /**
   * 记录用户会话
   */
  recordSession(data) {
    var session = {
      id: 'sess_' + Date.now().toString(36),
      userId: data.userId || 'anonymous',
      action: data.action || 'chat',
      duration: data.duration || 0,
      success: data.success !== false,
      timestamp: new Date().toISOString()
    };
    this.data.sessions.push(session);
    if (this.data.sessions.length > 1000) this.data.sessions = this.data.sessions.slice(-1000);
    this._updateDaily('sessions', 1);
    this._save();
    return session;
  }

  // ====== 任务跟踪 ======

  /**
   * 记录任务
   */
  recordTask(data) {
    var task = {
      id: 'kt_' + Date.now().toString(36),
      title: data.title || 'unnamed',
      assigneeId: data.assigneeId || '',
      status: data.status || 'assigned',
      priority: data.priority || 'medium',
      duration: data.duration || 0,
      redoCount: data.redoCount || 0,
      createdBy: data.createdBy || 'system',
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    this.data.tasks.push(task);
    if (this.data.tasks.length > 500) this.data.tasks = this.data.tasks.slice(-500);
    this._updateDaily('tasks', 1);
    this._save();
    return task;
  }

  /**
   * 完成任务
   */
  completeTask(taskId, duration) {
    var task = this._findTask(taskId);
    if (!task) return null;
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    if (duration !== undefined) task.duration = duration;
    this._updateDaily('completed', 1);
    this._save();
    return task;
  }

  /**
   * 标记任务需要重做
   */
  redoTask(taskId) {
    var task = this._findTask(taskId);
    if (!task) return null;
    task.redoCount = (task.redoCount || 0) + 1;
    task.status = 'redoing';
    this._updateDaily('redone', 1);
    this._save();
    return task;
  }

  // ====== 功能使用 ======

  /**
   * 记录功能使用
   */
  recordFeature(feature) {
    if (!feature) return;
    this.data.features[feature] = (this.data.features[feature] || 0) + 1;
    this._save();
  }

  // ====== 统计 ======

  /**
   * 获取 Keep Rate 报告
   */
  getReport() {
    var tasks = this.data.tasks;
    var sessions = this.data.sessions;
    
    var totalTasks = tasks.length;
    var completedTasks = tasks.filter(function(t) { return t.status === 'completed'; }).length;
    var failedTasks = tasks.filter(function(t) { return t.status === 'failed' || t.status === 'escalated'; }).length;
    var redoneTasks = tasks.filter(function(t) { return (t.redoCount || 0) > 0; }).length;
    var pendingTasks = tasks.filter(function(t) { return t.status !== 'completed' && t.status !== 'failed'; }).length;
    
    var completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
    var redoRate = totalTasks > 0 ? Math.round(redoneTasks / totalTasks * 100) : 0;
    var failRate = totalTasks > 0 ? Math.round(failedTasks / totalTasks * 100) : 0;
    
    // Keep Rate = 会话中成功比例
    var totalSessions = sessions.length;
    var successfulSessions = sessions.filter(function(s) { return s.success; }).length;
    var keepRate = totalSessions > 0 ? Math.round(successfulSessions / totalSessions * 100) : 0;
    
    // 功能使用排行
    var features = Object.keys(this.data.features).map(function(k) {
      return { feature: k, count: this.data.features[k] };
    }.bind(this)).sort(function(a, b) { return b.count - a.count; });
    
    // 每日趋势
    var dailyTrend = Object.keys(this.data.daily).sort().slice(-14).map(function(d) {
      var day = this.data.daily[d];
      return { date: d, tasks: day.tasks || 0, completed: day.completed || 0, failed: day.failed || 0, sessions: day.sessions || 0 };
    }.bind(this));
    
    return {
      summary: {
        totalTasks: totalTasks,
        completedTasks: completedTasks,
        pendingTasks: pendingTasks,
        failedTasks: failedTasks,
        completionRate: completionRate + '%',
        redoRate: redoRate + '%',
        failRate: failRate + '%',
        keepRate: keepRate + '%',
        totalSessions: totalSessions
      },
      features: features.slice(0, 10),
      dailyTrend: dailyTrend,
      weeklyTrend: this._getWeeklyTrend()
    };
  }

  /**
   * 获取每周趋势
   */
  _getWeeklyTrend() {
    var weeks = Object.keys(this.data.weekly).sort().slice(-8);
    return weeks.map(function(w) {
      var week = this.data.weekly[w];
      return { week: w, tasks: week.tasks || 0, completed: week.completed || 0 };
    }.bind(this));
  }

  /**
   * 更新每日统计
   */
  _updateDaily(field, count) {
    var today = new Date().toISOString().substring(0, 10);
    if (!this.data.daily[today]) this.data.daily[today] = { tasks: 0, completed: 0, failed: 0, sessions: 0, redone: 0 };
    this.data.daily[today][field] = (this.data.daily[today][field] || 0) + count;
    
    // 每周
    var weekKey = this._getWeekKey();
    if (!this.data.weekly[weekKey]) this.data.weekly[weekKey] = { tasks: 0, completed: 0 };
    this.data.weekly[weekKey][field] = (this.data.weekly[weekKey][field] || 0) + count;
    
    // 清理旧数据（保留90天）
    var keys = Object.keys(this.data.daily);
    if (keys.length > 90) {
      keys.sort().slice(0, keys.length - 90).forEach(function(k) { delete this.data.daily[k]; }.bind(this));
    }
  }

  _getWeekKey() {
    var d = new Date();
    var startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    return startOfWeek.toISOString().substring(0, 10);
  }

  _findTask(id) {
    for (var i = 0; i < this.data.tasks.length; i++) {
      if (this.data.tasks[i].id === id) return this.data.tasks[i];
    }
    return null;
  }
}

module.exports = KeepRateTracker;
