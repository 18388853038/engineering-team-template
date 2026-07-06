/**
 * eCompany DAG 依赖引擎
 * 功能：
 *   1. 任务依赖声明（dependsOn）
 *   2. 拓扑排序 / 环路检测
 *   3. 任务阻塞/解阻塞自动管理
 *   4. 依赖链可视化数据
 */

class DAGEngine {
  /**
   * 计算任务状态（是否被依赖阻塞）
   */
  static computeTaskStatus(task, allTasks) {
    if (!task.dependsOn || (Array.isArray(task.dependsOn) && task.dependsOn.length === 0) || (!Array.isArray(task.dependsOn) && typeof task.dependsOn !== 'string')) {
      if (task.status === 'blocked') return 'pending';
      return task.status;
    }

    const deps = typeof task.dependsOn === 'string' ? [task.dependsOn] : task.dependsOn;
    const blockedBy = [];
    for (const depId of deps) {
      const dep = allTasks.find(t => t.id === depId);
      if (!dep) {
        blockedBy.push({ id: depId, reason: '任务不存在' });
        continue;
      }
      const doneStatuses = ['done', 'completed', 'approved', 'closed'];
      if (!doneStatuses.includes(dep.status)) {
        blockedBy.push({ id: depId, title: dep.title, status: dep.status });
      }
    }

    if (blockedBy.length > 0) {
      return { status: 'blocked', blockedBy };
    }
    return task.status;
  }

  /**
   * 环路检测（DFS）
   */
  static detectCycle(tasks) {
    const adj = {};
    for (const t of tasks) {
      const deps = typeof t.dependsOn === 'string' ? [t.dependsOn] : (t.dependsOn || []);
      adj[t.id] = deps.filter(id => tasks.some(tt => tt.id === id));
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    for (const id of Object.keys(adj)) color[id] = WHITE;

    const cyclePath = [];
    let found = false;

    function dfs(node, path) {
      if (found) return;
      color[node] = GRAY;
      path.push(node);

      for (const next of (adj[node] || [])) {
        if (color[next] === GRAY) {
          const cycleStart = path.indexOf(next);
          found = true;
          cyclePath.push(...path.slice(cycleStart), next);
          return;
        }
        if (color[next] === WHITE) {
          dfs(next, path);
        }
      }

      path.pop();
      color[node] = BLACK;
    }

    for (const id of Object.keys(adj)) {
      if (color[id] === WHITE) {
        dfs(id, []);
        if (found) break;
      }
    }

    return { hasCycle: found, cyclePath };
  }

  /**
   * 拓扑排序（Kahn's algorithm）
   */
  static topologicalSort(tasks) {
    const taskMap = {};
    for (const t of tasks) taskMap[t.id] = t;

    const inDegree = {};
    const adj = {};
    for (const t of tasks) {
      inDegree[t.id] = 0;
      adj[t.id] = [];
    }
    for (const t of tasks) {
      const deps = typeof t.dependsOn === 'string' ? [t.dependsOn] : (t.dependsOn || []);
      for (const depId of deps) {
        if (taskMap[depId]) {
          adj[depId].push(t.id);
          inDegree[t.id] = (inDegree[t.id] || 0) + 1;
        }
      }
    }

    const queue = [];
    for (const id of Object.keys(inDegree)) {
      if (inDegree[id] === 0) queue.push(id);
    }

    const sorted = [];
    while (queue.length > 0) {
      const node = queue.shift();
      sorted.push(node);
      for (const next of (adj[node] || [])) {
        inDegree[next]--;
        if (inDegree[next] === 0) queue.push(next);
      }
    }

    return sorted;
  }

  /**
   * 为前端生成依赖图数据（nodes + edges）
   */
  static buildGraphData(tasks) {
    const nodes = [];
    const edges = [];
    const taskMap = {};

    for (const t of tasks) {
      taskMap[t.id] = true;
      nodes.push({
        id: t.id,
        label: (t.title || '').substring(0, 30),
        status: t.status || 'pending',
        assignee: t.assigneeId || '',
        priority: t.priority || 'medium'
      });
    }

    for (const t of tasks) {
      // 防御性修复：dependsOn 可能是字符串而非数组（CEO 写入脏数据导致的）
      var deps = t.dependsOn;
      if (!deps) continue;
      if (typeof deps === 'string') deps = [deps];
      if (deps.length > 0) {
        for (const depId of deps) {
          if (taskMap[depId]) {
            edges.push({
              from: depId,
              to: t.id,
              type: 'depends_on'
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 获取被阻塞的任务列表
   */
  static getBlockedTasks(tasks) {
    const result = [];
    for (const t of tasks) {
      const computed = DAGEngine.computeTaskStatus(t, tasks);
      if (typeof computed === 'object' && computed.status === 'blocked') {
        result.push({
          id: t.id,
          title: t.title,
          assigneeId: t.assigneeId,
          blockedBy: computed.blockedBy
        });
      }
    }
    return result;
  }

  /**
   * 批量重新计算所有任务的状态
   */
  static recalculateAll(tasks) {
    const updates = [];
    for (const t of tasks) {
      const oldStatus = t.status;
      const computed = DAGEngine.computeTaskStatus(t, tasks);
      const newStatus = typeof computed === 'object' ? computed.status : computed;
      if (oldStatus !== newStatus) {
        updates.push({ id: t.id, title: t.title, oldStatus, newStatus });
      }
    }
    return updates;
  }
}

module.exports = DAGEngine;
