var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var BASE = path.join(__dirname, '..');
var VERSIONS_DIR = path.join(BASE, 'file-versions');
var INDEX_FILE = path.join(VERSIONS_DIR, 'index.json');

try { if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR, { recursive: true }); } catch(e) {}

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch(e) {}
  return {};
}

function saveIndex(index) {
  try { fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8'); } catch(e) {}
}

function createVersion(realPath, author) {
  try {
    if (!fs.existsSync(realPath)) return null;
    var content = fs.readFileSync(realPath, 'utf8');
    var hash = crypto.createHash('md5').update(content).digest('hex');
    var index = loadIndex();
    var fileKey = realPath.replace(/:/g, '_').replace(/\\/g, '/');
    var versions = index[fileKey] || { file: realPath, versions: [] };
    
    if (versions.versions.length > 0 && versions.versions[versions.versions.length - 1].hash === hash) return null;
    
    var version = {
      id: 'v' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      hash: hash, timestamp: new Date().toISOString(),
      author: author || 'system', size: content.length
    };
    
    var vDir = path.join(VERSIONS_DIR, fileKey);
    if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
    fs.writeFileSync(path.join(vDir, version.id + '.txt'), content, 'utf8');
    
    versions.versions.push(version);
    if (versions.versions.length > 50) { var old = versions.versions.shift(); try { fs.unlinkSync(path.join(vDir, old.id + '.txt')); } catch(e) {} }
    
    index[fileKey] = versions;
    saveIndex(index);
    return version;
  } catch(e) { return { error: e.message }; }
}

function getVersions(realPath) {
  var fileKey = realPath.replace(/:/g, '_').replace(/\\/g, '/');
  var index = loadIndex();
  var entry = index[fileKey];
  return entry ? entry.versions.slice().reverse() : [];
}

function getVersionContent(realPath, versionId) {
  var fileKey = realPath.replace(/:/g, '_').replace(/\\/g, '/');
  var vFile = path.join(VERSIONS_DIR, fileKey, versionId + '.txt');
  return fs.existsSync(vFile) ? fs.readFileSync(vFile, 'utf8') : null;
}

function restoreVersion(realPath, versionId) {
  var content = getVersionContent(realPath, versionId);
  if (content === null) return { error: 'Version not found' };
  createVersion(realPath, 'restore');
  fs.writeFileSync(realPath, content, 'utf8');
  return { restored: true, size: content.length };
}

function diffVersions(realPath, v1Id, v2Id) {
  var c1 = getVersionContent(realPath, v1Id);
  var c2 = getVersionContent(realPath, v2Id);
  if (c1 === null || c2 === null) return { error: 'Version not found' };
  var l1 = c1.split('\n'), l2 = c2.split('\n');
  var changes = [];
  for (var i = 0; i < Math.max(l1.length, l2.length); i++) {
    if (l1[i] !== l2[i]) changes.push({ line: i + 1, old: l1[i] || '', new: l2[i] || '' });
  }
  return { total: changes.length, changes: changes.slice(0, 100) };
}

function getStats() {
  var index = loadIndex();
  var trackedFiles = Object.keys(index).length;
  var totalVersions = 0;
  Object.keys(index).forEach(function(k) { totalVersions += (index[k].versions || []).length; });
  return { trackedFiles: trackedFiles, totalVersions: totalVersions, storageDir: VERSIONS_DIR };
}

// Fix: Define regex patterns correctly
var RE_STATS = /^\/api\/file-versions\/stats$/;
var RE_LIST = /^\/api\/file-versions\/list\/(.+)$/;
var RE_RESTORE = /^\/api\/file-versions\/restore$/;
var RE_DIFF = /^\/api\/file-versions\/diff$/;
var RE_SAVE = /^\/api\/file-versions\/save$/;

function registerVersionRoutes(registerRoute, parseBody, json) {
  registerRoute(['GET'], RE_STATS, function(req, res) { json(res, { ok: true, stats: getStats() }); });
  
  registerRoute(['POST'], RE_SAVE, async function(req, res) {
    try {
      var body = await parseBody(req);
      if (!body.path) return json(res, { ok: false, error: 'path required' }, 400);
      var version = createVersion(body.path, body.author);
      json(res, { ok: true, version: version });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  registerRoute(['GET'], RE_LIST, function(req, res, m) {
    try {
      json(res, { ok: true, versions: getVersions(decodeURIComponent(m[1])) });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  registerRoute(['POST'], RE_RESTORE, async function(req, res) {
    try {
      var body = await parseBody(req);
      if (!body.path || !body.versionId) return json(res, { ok: false, error: 'path and versionId required' }, 400);
      var result = restoreVersion(body.path, body.versionId);
      json(res, { ok: !result.error, result: result });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
  
  registerRoute(['POST'], RE_DIFF, async function(req, res) {
    try {
      var body = await parseBody(req);
      if (!body.path || !body.v1 || !body.v2) return json(res, { ok: false, error: 'path, v1, v2 required' }, 400);
      json(res, { ok: true, diff: diffVersions(body.path, body.v1, body.v2) });
    } catch(e) { json(res, { ok: false, error: e.message }, 500); }
  });
}

module.exports = {
  createVersion: createVersion,
  getVersions: getVersions,
  getVersionContent: getVersionContent,
  restoreVersion: restoreVersion,
  diffVersions: diffVersions,
  getStats: getStats,
  registerVersionRoutes: registerVersionRoutes
};
