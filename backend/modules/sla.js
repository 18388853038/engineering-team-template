/**
 * SLA 统计 — 响应时间 p50/p75/p90/p95/p99
 * 完全独立模块，不依赖 metrics.js 内部结构
 */

const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join(__dirname, '..', 'metrics.json');

function getSLA() {
  var data = { samples: [] };
  try {
    data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
  } catch(e) {}

  var samples = data.samples || [];
  var toolCalls = samples.filter(function(s) { return s.type === 'tool_call' && s.latency; });
  var latencies = toolCalls.map(function(s) { return s.latency; }).sort(function(a, b) { return a - b; });
  var len = latencies.length;

  if (len === 0) {
    return {
      totalCalls: 0, avgLatency: 0, minLatency: 0, maxLatency: 0,
      p50: 0, p75: 0, p90: 0, p95: 0, p99: 0,
      latencyDistribution: { '<100ms': 0, '100-500ms': 0, '500-1s': 0, '1-3s': 0, '3s+': 0 },
      byTool: {}
    };
  }

  function ptile(arr, p) {
    var idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  }

  var sla = {
    totalCalls: len,
    avgLatency: Math.round(latencies.reduce(function(a, b) { return a + b; }, 0) / len),
    minLatency: latencies[0],
    maxLatency: latencies[len - 1],
    p50: ptile(latencies, 0.5),
    p75: ptile(latencies, 0.75),
    p90: ptile(latencies, 0.9),
    p95: ptile(latencies, 0.95),
    p99: ptile(latencies, 0.99),
    latencyDistribution: {
      '<100ms': latencies.filter(function(l) { return l < 100; }).length,
      '100-500ms': latencies.filter(function(l) { return l >= 100 && l < 500; }).length,
      '500-1s': latencies.filter(function(l) { return l >= 500 && l < 1000; }).length,
      '1-3s': latencies.filter(function(l) { return l >= 1000 && l < 3000; }).length,
      '3s+': latencies.filter(function(l) { return l >= 3000; }).length
    },
    byTool: {}
  };

  // Per-tool breakdown
  var toolMap = {};
  for (var s of toolCalls) {
    if (!toolMap[s.toolName]) toolMap[s.toolName] = [];
    toolMap[s.toolName].push(s.latency);
  }
  for (var tool of Object.keys(toolMap)) {
    var tl = toolMap[tool].sort(function(a, b) { return a - b; });
    sla.byTool[tool] = {
      calls: tl.length,
      avg: Math.round(tl.reduce(function(a, b) { return a + b; }, 0) / tl.length),
      p50: ptile(tl, 0.5),
      p75: ptile(tl, 0.75),
      p90: ptile(tl, 0.9),
      p95: ptile(tl, 0.95)
    };
  }

  return sla;
}

function getSLASummary() {
  var sla = getSLA();
  if (sla.totalCalls === 0) return '暂无数据';
  var ms = function(v) { return v + 'ms'; };
  return {
    calls: sla.totalCalls,
    avg: ms(sla.avgLatency),
    p50: ms(sla.p50),
    p95: ms(sla.p95),
    p99: ms(sla.p99),
    fast: sla.latencyDistribution['<100ms'],
    slow: sla.latencyDistribution['1-3s'] + sla.latencyDistribution['3s+']
  };
}

module.exports = { getSLA: getSLA, getSLASummary: getSLASummary };
