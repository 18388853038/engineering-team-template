/**
 * skill-mapper.js — eCompany Agent技能 → OpenClaw工具 映射引擎
 * 
 * 让每个Agent根据自身技能自动绑定可用的OpenClaw工具
 * 打通eCompany Agent能力与OpenClaw成熟生态
 */

const fs = require('fs');
const path = require('path');
const BASE = __dirname;

function loadMapping() {
  try {
    var filePath = path.join(BASE, '..', 'skill-mapper.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch(e) {}
  return { mapping: {}, version: '0', updatedAt: null };
}

/**
 * 获取Agent可用的OpenClaw工具列表
 * @param {string} agentId - Agent ID
 * @param {object} agentData - Agent完整数据（可选，如果不传从agents.json读取）
 * @returns {string[]} OpenClaw工具ID列表
 */
function getToolsForAgent(agentId, agentData) {
  var mapper = loadMapping();
  var mapping = mapper.mapping || {};
  var tools = [];
  var seen = {};
  
  // 如果没有传agentData，从文件加载
  if (!agentData) {
    try {
      var agents = JSON.parse(fs.readFileSync(path.join(BASE, '..', 'agents.json'), 'utf8'));
      agentData = agents.find(function(a) { return a.id === agentId; });
    } catch(e) { return []; }
  }
  
  if (!agentData || !agentData.skills) return [];
  
  // 遍历Agent的所有技能，收集对应工具
  agentData.skills.forEach(function(skill) {
    var matchedTools = mapping[skill];
    if (matchedTools) {
      matchedTools.forEach(function(tool) {
        if (!seen[tool]) {
          seen[tool] = true;
          tools.push(tool);
        }
      });
    }
  });
  
  return tools;
}

/**
 * 获取所有Agent的工具映射概览
 */
function getAllAgentsTools(agentIds) {
  var mapper = loadMapping();
  var mapping = mapper.mapping || {};
  var result = {};
  
  try {
    var agents = JSON.parse(fs.readFileSync(path.join(BASE, 'agents.json'), 'utf8'));
    var target = agentIds ? agents.filter(function(a) { return agentIds.indexOf(a.id) >= 0; }) : agents;
    
    target.forEach(function(agent) {
      result[agent.id] = {
        name: agent.name_cn || agent.name,
        title: agent.title,
        skills: agent.skills || [],
        openclawTools: getToolsForAgent(agent.id, agent)
      };
    });
  } catch(e) {}
  
  return result;
}

/**
 * 获取映射统计
 */
function getStats() {
  var mapper = loadMapping();
  var mapping = mapper.mapping || {};
  var allTools = {};
  
  Object.keys(mapping).forEach(function(skill) {
    mapping[skill].forEach(function(tool) { allTools[tool] = true; });
  });
  
  return {
    mappedSkills: Object.keys(mapping).length,
    totalTools: Object.keys(allTools).length,
    tools: Object.keys(allTools).sort(),
    version: mapper.version,
    updatedAt: mapper.updatedAt
  };
}

module.exports = {
  getToolsForAgent: getToolsForAgent,
  getAllAgentsTools: getAllAgentsTools,
  getStats: getStats
};
