// git-integration — 兼容存根
'use strict';
module.exports = {
  checkRepo: function() { return { ok: false, error: 'Git integration not installed' }; },
  cloneRepo: function() { return { ok: false, error: 'Git integration not installed' }; },
  pullRepo: function() { return { ok: false, error: 'Git integration not installed' }; },
  status: function() { return { ok: false, error: 'Git integration not installed' }; }
};
