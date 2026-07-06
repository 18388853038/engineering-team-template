/**
 * 简易文件锁（进程级）
 * 防止并发写 tasks.json / agents.json 时数据损坏
 */

const locks = {};

function acquire(key) {
  if (locks[key]) return false;
  locks[key] = true;
  return true;
}

function release(key) {
  delete locks[key];
}

function waitAndAcquire(key, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function tryLock() {
      if (acquire(key)) { resolve(true); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(tryLock, 10);
    }
    tryLock();
  });
}

// Safe file write with lock
function safeWriteJSON(filepath, data) {
  var key = filepath;
  if (!acquire(key)) return false;
  try {
    require('fs').writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } finally {
    release(key);
  }
}

// Safe file read
function safeReadJSON(filepath, fallback) {
  try {
    if (require('fs').existsSync(filepath)) {
      return JSON.parse(require('fs').readFileSync(filepath, 'utf-8'));
    }
  } catch(e) {}
  return fallback;
}

module.exports = {
  acquire: acquire,
  release: release,
  waitAndAcquire: waitAndAcquire,
  safeWriteJSON: safeWriteJSON,
  safeReadJSON: safeReadJSON
};
