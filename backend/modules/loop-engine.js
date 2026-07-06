/**
 * loop-engine.js — Loop 模块（精简实现）
 */
var loops = {};
var loopCounter = 0;

function createLoopConfig(opts) {
  return {
    goal: opts.goal || '',
    module: opts.module || 'unknown',
    targetCoverage: opts.targetCoverage || null,
    maxIterations: opts.maxIterations || 20,
    created: new Date().toISOString()
  };
}

function createLoop(config) {
  var loop = {
    loopId: 'loop_' + (++loopCounter) + '_' + Date.now(),
    config: config || {},
    status: 'created',
    results: [],
    error: null,
    startedAt: null,
    completedAt: null,
    run: async function() {
      this.status = 'running';
      this.startedAt = new Date().toISOString();
      try {
        var result = { passed: true, results: [] };
        this.results = result.results;
        this.status = 'completed';
        this.completedAt = new Date().toISOString();
        return result;
      } catch (e) {
        this.status = 'failed';
        this.error = e.message;
        return { passed: false, error: e.message };
      }
    },
    stop: function() {
      this.status = 'stopped';
    }
  };
  loops[loop.loopId] = loop;
  return loop;
}

function listLoops() {
  return Object.keys(loops).map(function(id) { return loops[id]; });
}

function loadLoopState(loopId) {
  return loops[loopId] || null;
}

function runLoop(loop) {
  return loop.run();
}

function executeLoop(steps, ctx) {
  return Promise.resolve({ results: steps || [], status: 'completed' });
}

module.exports = {
  createLoop: createLoop,
  createLoopConfig: createLoopConfig,
  listLoops: listLoops,
  loadLoopState: loadLoopState,
  runLoop: runLoop,
  executeLoop: executeLoop
};
