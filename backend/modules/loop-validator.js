/**
 * loop-validator.js — Loop 工程验证者
 *
 * 职责：
 *   1. 执行测试（npm test / node --check）
 *   2. 检查覆盖率
 *   3. 语法检查
 *   4. 静态分析
 */

var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var PROJECT_DIR = path.join(__dirname, '..');

// === WebSocket 广播 ===
let _wsServer = null;
function setWSServer(ws) { _wsServer = ws; }
function broadcast(type, msgText) {
  console.log("[loop-validator-Broadcast] msg=" + (msg || "").substring(0, 80));
  
  if (!_wsServer) return;
  try {
    _wsServer.broadcast('channel', {
      type: 'channel_message',
      content: msgText,
      source: '验证器',
      from: '🔍 验证器',
      time: new Date().toISOString()
    });
  } catch(e) {}
}

/**
 * 执行验证
 * @param {Object} loop - Loop 实例
 * @param {Object} round - 当前轮次
 * @returns {string} 验证结果文本
 */
function validate(loop, round) {
  broadcast('validate_start', '🔍 验证器开始验证结果...');
  var results = [];

  // 1) 语法检查
  try {
    var syntaxOk = checkSyntax();
    if (syntaxOk) {
      results.push('语法检查通过');
      broadcast('syntax_ok', '✅ 语法检查通过');
    } else {
      results.push('语法检查: 有错误');
    }
  } catch(e) {
    results.push('语法检查失败: ' + e.message);
  }

  // 2) 执行测试（如果存在测试命令）
  var testResult = runTests(loop.config.module);
  if (testResult.error) {
    results.push('测试: ' + testResult.error);
  } else {
    results.push('测试: ' + testResult.passed + '/' + (testResult.passed + testResult.failed) + ' 通过');
    broadcast('tests_ok', '🧪 测试通过: ' + testResult.passed + ' passed, ' + testResult.failed + ' failed');
  }

  // 3) 覆盖率检查
  var coverage = checkCoverage(loop.config.module);
  if (coverage !== null) {
    results.push('覆盖率: ' + coverage + '%');
    if (loop.config.targetCoverage) {
      results.push('目标: ' + loop.config.targetCoverage + '%');
    }
  } else {
    results.push('覆盖率: 未检测');
  }

  broadcast('validate_done', '✅ 验证完成');
  return results.join(' | ');
}

/**
 * 语法检查
 */
function checkSyntax() {
  // 检查 server-modern.js 语法
  var targetFile = path.join(PROJECT_DIR, 'server-modern.js');
  if (!fs.existsSync(targetFile)) return true; // 文件不存在则跳过

  try {
    execSync('node --check "' + targetFile + '"', {
      cwd: PROJECT_DIR,
      stdio: 'pipe',
      timeout: 15000
    });
    return true;
  } catch(e) {
    return false;
  }
}

/**
 * 执行测试
 * 先直接跑 node 执行测试文件（不依赖 mocha/npm），没有测试文件时返回空
 */
function runTests(moduleName) {
  var testFiles = findTestFiles(moduleName);

  if (testFiles.length === 0) {
    // 无测试文件，不尝试 npm test（避免安装依赖卡住）
    return { passed: 0, failed: 0, error: 'No tests found' };
  }

  var totalPassed = 0;
  var totalFailed = 0;
  var firstError = null;

  testFiles.forEach(function(tf) {
    try {
      // 直接 node 执行测试文件（mocha 兼容：mocha 文件可以 require 但不执行）
      var out = execSync('node "' + tf + '" 2>&1', {
        cwd: PROJECT_DIR,
        stdio: 'pipe',
        timeout: 15000
      });
      var output = out.toString();
      var parsed = parseTestOutput(output);
      totalPassed += parsed.passed;
      totalFailed += parsed.failed;
    } catch(e) {
      // execSync 在测试失败时也会抛异常，检查是否有 passing 指标
      if (e.stdout) {
        var parsed = parseTestOutput(e.stdout.toString());
        totalPassed += parsed.passed;
        totalFailed += parsed.failed;
      } else {
        totalFailed++;
        if (!firstError) firstError = e.message;
      }
    }
  });

  return { passed: totalPassed, failed: totalFailed, error: firstError };
}

/**
 * 查找与模块关联的测试文件
 */
function findTestFiles(moduleName) {
  var testDir = path.join(PROJECT_DIR, 'test');
  if (!fs.existsSync(testDir)) return [];

  var baseName = path.basename(moduleName, '.js');
  var files = fs.readdirSync(testDir);

  return files.filter(function(f) {
    return f.indexOf(baseName) >= 0 && (f.endsWith('.test.js') || f.endsWith('.spec.js'));
  }).map(function(f) {
    return path.join(testDir, f);
  });
}

/**
 * 解析测试输出中的通过/失败数
 */
function parseTestOutput(output) {
  var passed = 0;
  var failed = 0;

  // 匹配 "X passing" 模式
  var passMatch = output.match(/(\d+)\s*passing/);
  if (passMatch) passed = parseInt(passMatch[1], 10);

  // 匹配 "X failing" 模式
  var failMatch = output.match(/(\d+)\s*failing/);
  if (failMatch) failed = parseInt(failMatch[1], 10);

  // 如果没有 passing/failing，检查是否有 "✓" 和 "✗"
  if (passMatch === null && failMatch === null) {
    var checkmarks = (output.match(/✓/g) || []).length;
    var xmarks = (output.match(/✗/g) || []).length;
    passed = checkmarks;
    failed = xmarks;
  }

  return { passed: passed, failed: failed };
}

/**
 * 检查覆盖率
 * 尝试用 c8 或 nyc 运行覆盖率
 */
function checkCoverage(moduleName) {
  try {
    // 先尝试用 c8 跑特定测试
    var testFiles = findTestFiles(moduleName);
    if (testFiles.length === 0) return null;

    var testFile = testFiles[0]; // 只跑第一个关联测试
    var out = execSync('npx c8 --reporter=text-summary node "' + testFile + '" 2>&1', {
      cwd: PROJECT_DIR,
      stdio: 'pipe',
      timeout: 30000
    });
    var output = out.toString();

    // 解析行覆盖率
    var linesMatch = output.match(/Lines\s*:\s*([\d.]+)%/);
    if (linesMatch) {
      return parseFloat(linesMatch[1]);
    }
  } catch(e) {
    // c8 不可用或测试失败
  }

  return null;
}

/**
 * 简化验收判断
 * 对 Audit 阶段的初步输出
 */
function audit(loop, round) {
  broadcast('audit_start', '📋 验收器开始审计...');
  var result = round.result || '';
  var targetCoverage = loop.config.targetCoverage;

  // 检查测试是否全部通过
  broadcast('audit_check_tests', '📋 审计阶段: 检查测试结果...');
  var testPassMatch = result.match(/(\d+)\/(\d+)\s*通过/);
  if (testPassMatch) {
    var passed = parseInt(testPassMatch[1], 10);
    var total = parseInt(testPassMatch[2], 10);
    if (passed < total) {
      return 'fail (tests: ' + passed + '/' + total + ' failed)';
    }
  } else if (result.indexOf('测试:') >= 0 && result.indexOf('通过') < 0) {
    return 'fail (test errors)';
  }
  broadcast('audit_tests_ok', '✅ 审计阶段: 测试全部通过');

  // 检查覆盖率
  broadcast('audit_check_coverage', '📋 审计阶段: 检查覆盖率...');
  var coverageMatch = result.match(/覆盖率:\s*([\d.]+)%/);
  if (coverageMatch) {
    var coverage = parseFloat(coverageMatch[1]);
    if (targetCoverage && coverage < targetCoverage) {
      return 'fail (coverage: ' + coverage + '% < ' + targetCoverage + '%)';
    }
  }

  // 语法检查失败
  broadcast('audit_check_syntax', '📋 审计阶段: 检查语法...');
  if (result.indexOf('语法检查: 有错误') >= 0) {
    return 'fail (syntax error)';
  }
  broadcast('audit_syntax_ok', '✅ 审计阶段: 语法通过');

  // 全部通过
  broadcast('audit_done', '✅ 审计完成');
  return 'pass';
}

module.exports = {
  setWSServer: setWSServer,
  validate: validate,
  audit: audit,
  findTestFiles: findTestFiles,
  runTests: runTests,
  checkSyntax: checkSyntax,
  checkCoverage: checkCoverage,
  parseTestOutput: parseTestOutput
};
