/**
 * Orchestrator - 多 Agent 工作流编排
 * 
 * 四阶段：Plan → Execute → Review → Merge
 */

class Orchestrator {
  constructor() {
    this.workflows = [];
    this.stages = ['plan', 'execute', 'review', 'merge'];
  }

  /**
   * 创建工作流
   */
  createWorkflow(config) {
    var wf = {
      id: 'wf_' + Date.now().toString(36),
      name: config.name || 'unnamed',
      description: config.description || '',
      status: 'created',
      stage: 'plan',
      subTasks: (config.subTasks || []).map(function(st) {
        return { id: 'st_' + Date.now().toString(36), name: st.name || st, status: 'pending', assignedTo: null };
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null
    };
    
    this.workflows.push(wf);
    if (this.workflows.length > 100) this.workflows = this.workflows.slice(-100);
    return wf;
  }

  /**
   * 执行工作流
   */
  executeWorkflow(workflowId) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;
    
    wf.status = 'running';
    wf.startedAt = new Date().toISOString();
    
    // 执行各个阶段
    return this._advanceStage(wf);
  }

  /**
   * 推进到下一阶段
   */
  _advanceStage(wf) {
    var stages = this.stages;
    var currentIdx = stages.indexOf(wf.stage);
    
    if (currentIdx < stages.length - 1) {
      wf.stage = stages[currentIdx + 1];
    } else {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
    }
    
    wf.updatedAt = new Date().toISOString();
    return wf;
  }

  /**
   * 分配子任务
   */
  assignSubTask(workflowId, subTaskId, agentId, agentName) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;
    
    var st = wf.subTasks.find(function(s) { return s.id === subTaskId; });
    if (!st) return null;
    
    st.assignedTo = agentId;
    st.assignedName = agentName;
    st.status = 'assigned';
    st.assignedAt = new Date().toISOString();
    wf.updatedAt = new Date().toISOString();
    
    return st;
  }

  /**
   * 完成子任务
   */
  completeSubTask(workflowId, subTaskId, result) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;
    
    var st = wf.subTasks.find(function(s) { return s.id === subTaskId; });
    if (!st) return null;
    
    st.status = 'completed';
    st.result = result;
    st.completedAt = new Date().toISOString();
    wf.updatedAt = new Date().toISOString();
    
    // 检查所有子任务是否已完成
    var allDone = wf.subTasks.every(function(s) { return s.status === 'completed'; });
    if (allDone) {
      return this._advanceStage(wf);
    }
    
    return st;
  }

  /**
   * 获取工作流
   */
  getWorkflow(workflowId) {
    return this._findWorkflow(workflowId);
  }

  /**
   * 查找工作流
   */
  _findWorkflow(id) {
    for (var i = 0; i < this.workflows.length; i++) {
      if (this.workflows[i].id === id) return this.workflows[i];
    }
    return null;
  }

  /**
   * 获取统计
   */
  getStats() {
    var active = this.workflows.filter(function(w) { return w.status === 'running'; });
    var completed = this.workflows.filter(function(w) { return w.status === 'completed'; });
    
    return {
      totalWorkflows: this.workflows.length,
      activeWorkflows: active.length,
      completedWorkflows: completed.length,
      byStage: this.stages.map(function(s) {
        var count = this.workflows.filter(function(w) { return w.stage === s; }).length;
        return { stage: s, count: count };
      }.bind(this))
    };
  }

  /**
   * 列出所有工作流
   */
  listWorkflows(limit) {
    limit = limit || 20;
    return this.workflows.slice(-limit).reverse();
  }

  /**
   * 取消工作流
   */
  cancelWorkflow(workflowId) {
    var wf = this._findWorkflow(workflowId);
    if (!wf) return null;
    wf.status = 'cancelled';
    wf.updatedAt = new Date().toISOString();
    return wf;
  }
}

module.exports = Orchestrator;
