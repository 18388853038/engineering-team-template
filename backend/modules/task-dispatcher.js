/**
 * Task Dispatcher - 任务分发引擎
 * 
 * 根据任务描述和员工技能进行语义匹配分发
 * 替代 10 组 hardcode 模板
 */

class TaskDispatcher {
  constructor() {
    this.dispatches = [];
    this.skillMap = {
      frontend: ['前端', 'vue', 'react', 'html', 'css', 'javascript', 'ui', 'web', '界面', '页面'],
      backend: ['后端', 'api', '数据库', 'server', 'node.js', 'python', 'java', 'go', '服务端'],
      ai: ['ai', '人工智能', '模型', '训练', '推理', 'llm', 'gpt', 'deepseek', '机器学习'],
      devops: ['devops', '部署', 'ci/cd', 'docker', 'kubernetes', '运维', '监控', '发布'],
      security: ['安全', 'security', '审计', '漏洞', '权限', '加密', '防火墙'],
      mobile: ['移动', 'app', 'ios', 'android', '手机', 'react native', 'flutter'],
      data: ['数据', '分析', '报表', 'sql', '数据库', 'etl', '数据仓库', 'bi'],
      design: ['设计', 'ui', 'ux', '视觉', '交互', '图标', 'logo', 'figma'],
      qa: ['测试', 'qa', '质量', '自动化测试', '回归', 'bug', '缺陷'],
      docs: ['文档', '文档', 'wiki', 'readme', '手册', '指南', '教程']
    };
  }

  /**
   * 根据任务描述匹配最佳员工
   */
  matchTask(task, teamAgents) {
    if (!task || !teamAgents || teamAgents.length === 0) return null;
    
    var text = (task.title || task.description || task.task || '');
    text = text.toLowerCase();
    
    // 提取需要的技能
    var requiredSkills = this._extractSkills(text);
    
    // 打分匹配
    var scored = teamAgents.map(function(agent) {
      var score = 0;
      var agentSkills = (agent.skills || []).map(function(s) { return s.toLowerCase(); });
      var agentTitle = (agent.title || '').toLowerCase();
      var agentName = (agent.name_cn || agent.name || '').toLowerCase();
      
      // 技能匹配
      for (var i = 0; i < requiredSkills.length; i++) {
        var skillKeywords = this.skillMap[requiredSkills[i]] || [];
        for (var k = 0; k < skillKeywords.length; k++) {
          if (agentSkills.some(function(as) { return as.includes(skillKeywords[k]); })) {
            score += 10;
            break;
          }
          if (agentTitle.includes(skillKeywords[k])) {
            score += 5;
          }
        }
      }
      
      // 标题匹配
      for (var i = 0; i < requiredSkills.length; i++) {
        var skillKeywords = this.skillMap[requiredSkills[i]] || [];
        for (var k = 0; k < skillKeywords.length; k++) {
          if (agentTitle.includes(skillKeywords[k])) score += 3;
        }
      }
      
      // 在线优先
      if (agent.status === 'online') score += 2;
      
      return { agent: agent, score: score };
    }.bind(this));
    
    // 排序取最高分
    scored.sort(function(a, b) { return b.score - a.score; });
    
    if (scored.length > 0 && scored[0].score > 0) {
      return scored[0].agent;
    }
    
    // 没有匹配到，返回在线员工中得分最高的
    var online = scored.filter(function(s) { return s.agent.status === 'online'; });
    if (online.length > 0) return online[0].agent;
    return scored[0] ? scored[0].agent : null;
  }

  /**
   * 从任务文本中提取需要的技能
   */
  _extractSkills(text) {
    var found = [];
    for (var skill in this.skillMap) {
      var keywords = this.skillMap[skill];
      for (var k = 0; k < keywords.length; k++) {
        if (text.includes(keywords[k])) {
          found.push(skill);
          break;
        }
      }
    }
    return found.length > 0 ? found : ['fullstack']; // 默认全栈
  }

  /**
   * 分发任务
   */
  dispatch(task, teamAgents) {
    var matched = this.matchTask(task, teamAgents);
    
    var result = {
      id: 'dispatch_' + Date.now().toString(36),
      task: task,
      matchedAgent: matched ? { id: matched.id, name: matched.name_cn, title: matched.title } : null,
      status: matched ? 'dispatched' : 'unassigned',
      dispatchedAt: new Date().toISOString()
    };
    
    this.dispatches.push(result);
    if (this.dispatches.length > 200) this.dispatches = this.dispatches.slice(-200);
    
    return result;
  }

  /**
   * 获取统计
   */
  getStats() {
    var bySkill = {};
    this.dispatches.forEach(function(d) {
      if (d.matchedAgent) {
        var cat = d.matchedAgent.title || 'unknown';
        bySkill[cat] = (bySkill[cat] || 0) + 1;
      }
    });
    
    var recentMatches = this.dispatches.filter(function(d) { return d.status === 'dispatched'; }).length;
    var total = this.dispatches.length;
    
    return {
      totalDispatch: total,
      recentMatches: recentMatches,
      bySkill: bySkill,
      avgMatchScore: total > 0 ? Math.round(recentMatches / total * 100) : 0
    };
  }

  /**
   * 获取分发历史
   */
  getHistory(limit) {
    limit = limit || 20;
    return this.dispatches.slice(-limit);
  }
}

module.exports = TaskDispatcher;
