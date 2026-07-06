/**
 * eCompany SQLite 数据库模块
 * 替代 JSON 文件存储，支持并发、事务、查询
 */
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'ecompany.db');
let db;
var hasSQLite = false;

function getDB() {
  if (!db) {
    try {
      var Database = require('better-sqlite3');
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      hasSQLite = true;
    } catch(e) {
      console.log('[DB] SQLite unavailable: ' + e.message + '. Using JSON fallback.');
      hasSQLite = false;
      // Return a stub that prevents crashes on .prepare() calls
      db = { prepare: function() { return { all: function() { return []; }, get: function() { return null; }, run: function() { return { changes: 0 }; }, bind: function() { return { run: function() { return {}; }, all: function() { return []; } }; } }; }, exec: function() {}, pragma: function() {} };
      return db;
    }
    db.pragma('foreign_keys = ON');
    initTables();
    migrateFromJSON();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT, name_cn TEXT, title TEXT,
      category TEXT, icon TEXT, role TEXT,
      reports_to TEXT, status TEXT DEFAULT 'online',
      description TEXT,
      skills TEXT,  -- JSON array
      skill_levels TEXT,  -- JSON array
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      assignee_id TEXT,
      creator TEXT DEFAULT 'system',
      deadline TEXT,
      tags TEXT,  -- JSON array
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      assigned_at TEXT,
      completed_at TEXT,
      skipped_by TEXT,
      recycled_at TEXT,
      escalated_at TEXT,
      escalated_by TEXT,
      escalation_reason TEXT,
      FOREIGN KEY (assignee_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      role TEXT,
      content TEXT,
      tool_calls TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS skills (
      id Integer PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      emoji TEXT,
      instructions TEXT,
      metadata TEXT,
      user_invocable INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier TEXT NOT NULL DEFAULT 'free',
      license_key TEXT,
      activated_at INTEGER,
      valid_until INTEGER,
      features TEXT  -- JSON
    );

    CREATE TABLE IF NOT EXISTS resource_locks (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      resource_type TEXT DEFAULT 'task',
      agent_id TEXT,
      reason TEXT,
      active INTEGER DEFAULT 1,
      locked_at TEXT DEFAULT (datetime('now')),
      unlocked_at TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_memory_project ON memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

    -- Evaluation tables
    CREATE TABLE IF NOT EXISTS evaluation_scores (
      agent_id TEXT PRIMARY KEY,
      score REAL DEFAULT 50,
      keep_rate REAL DEFAULT 0,
      completion_rate REAL DEFAULT 0,
      task_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      task_bonus REAL DEFAULT 0,
      last_updated INTEGER,
      history TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS evaluation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      task_id TEXT,
      agent_id TEXT,
      status TEXT,
      feedback TEXT DEFAULT '',
      keep_rate REAL
    );

    -- Metrics tables
    CREATE TABLE IF NOT EXISTS metrics_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      type TEXT,
      agent_id TEXT DEFAULT 'unknown',
      tool_name TEXT,
      latency INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      tokens_used INTEGER DEFAULT 0,
      error TEXT,
      provider TEXT,
      model TEXT,
      rounds INTEGER DEFAULT 0,
      task_id TEXT,
      status TEXT,
      keep_rate REAL
    );

    CREATE TABLE IF NOT EXISTS metrics_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      type TEXT,
      data TEXT,
      acknowledged INTEGER DEFAULT 0
    );

    -- Error tables
    CREATE TABLE IF NOT EXISTS error_cases (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT,
      severity INTEGER,
      patterns TEXT,
      description TEXT,
      hit_count INTEGER DEFAULT 0,
      created_at INTEGER,
      last_hit INTEGER
    );

    CREATE TABLE IF NOT EXISTS error_pending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      message TEXT,
      tool_name TEXT,
      provider TEXT,
      stack TEXT
    );
  `);
}

// Migrate existing JSON data to SQLite
function migrateFromJSON() {
  const fs = require('fs');
  const BASE = __dirname + '/..';

  // Sync agents - always update from agents.json (overwrites existing)
  const agentsFile = path.join(BASE, 'agents.json');
  try {
    if (fs.existsSync(agentsFile)) {
      const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'));
      const upsert = db.prepare('INSERT OR REPLACE INTO agents (id, name, name_cn, title, category, icon, role, reports_to, status, description, skills, skill_levels) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      const tx = db.transaction((list) => {
        for (const a of list) {
          upsert.run(a.id, a.name, a.name_cn, a.title, a.category, a.icon, a.role, a.reports_to || '', a.status || 'online', a.description || '', JSON.stringify(a.skills || []), JSON.stringify(a.skill_levels || []));
        }
      });
      tx(agents);
      console.log('[DB] Synced', agents.length, 'agents from agents.json');
    }
  } catch(e) { console.error('[DB] Agent migration error:', e.message); }

  // Migrate tasks
  const tasksFile = path.join(BASE, 'tasks.json');
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM tasks').get();
    if (count.c === 0 && fs.existsSync(tasksFile)) {
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      const insert = db.prepare('INSERT OR REPLACE INTO tasks (id, title, description, status, priority, assignee_id, creator, deadline, tags, created_at, updated_at, assigned_at, skipped_by, recycled_at, escalated_at, escalated_by, escalation_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const tx = db.transaction((list) => {
        for (const t of list) {
          insert.run(
            t.id, t.title, t.description || '', t.status || 'todo', t.priority || 'medium',
            t.assigneeId || null, t.creator || 'system', t.deadline || null,
            JSON.stringify(t.tags || []), t.createdAt || new Date().toISOString(),
            t.updatedAt || new Date().toISOString(), t.assignedAt || null, t.skippedBy || null,
            t.recycledAt || null, t.escalatedAt || null, t.escalatedBy || null, t.escalationReason || null
          );
        }
      });
      tx(tasks);
      console.log('[DB] Migrated', tasks.length, 'tasks');
    }
  } catch(e) { console.error('[DB] Task migration error:', e.message); }

  // Migrate license
  const licFile = path.join(BASE, 'license.json');
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM licenses').get();
    if (count.c === 0 && fs.existsSync(licFile)) {
      const lic = JSON.parse(fs.readFileSync(licFile, 'utf-8'));
      db.prepare('INSERT INTO licenses (tier, license_key, activated_at, valid_until, features) VALUES (?,?,?,?,?)').run(
        lic.tier || 'free', lic.licenseKey || '', lic.activatedAt || null, lic.validUntil || null, JSON.stringify(lic.features || {})
      );
      console.log('[DB] Migrated license');
    }
  } catch(e) { console.error('[DB] License migration error:', e.message); }

  // Migrate evaluation data (if exists)
  const evalFile = path.join(BASE, 'evaluation.json');
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM evaluation_scores').get();
    if (count.c === 0 && fs.existsSync(evalFile)) {
      const data = JSON.parse(fs.readFileSync(evalFile, 'utf-8'));
      if (data.scores) {
        const upsert = db.prepare('INSERT OR REPLACE INTO evaluation_scores (agent_id, score, keep_rate, completion_rate, task_count, failed_count, task_bonus, last_updated, history) VALUES (?,?,?,?,?,?,?,?,?)');
        for (const [agentId, s] of Object.entries(data.scores)) {
          upsert.run(agentId, s.lastScore || 50, 0, 0, s.totalTasks || 0, 0, 0, s.lastUpdated || Date.now(), JSON.stringify(s.history || []));
        }
      }
      if (data.records) {
        const ins = db.prepare('INSERT OR REPLACE INTO evaluation_records (id, ts, task_id, agent_id, status, feedback, keep_rate) VALUES (?,?,?,?,?,?,?)');
        data.records.forEach((r, i) => {
          ins.run(i + 1, r.ts || Date.now(), r.taskId || '', r.agentId || '', r.status || '', r.feedback || '', r.keepRate || null);
        });
      }
      console.log('[DB] Migrated evaluation data');
    }
  } catch(e) { console.error('[DB] Evaluation migration error:', e.message); }

  // Migrate metrics data
  const metricsFile = path.join(BASE, 'metrics.json');
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM metrics_samples').get();
    if (count.c === 0 && fs.existsSync(metricsFile)) {
      const data = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
      if (data.samples) {
        const ins = db.prepare('INSERT INTO metrics_samples (ts, type, agent_id, tool_name, latency, success, tokens_used, error, provider, model, rounds, task_id, status, keep_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        for (const s of data.samples) {
          ins.run(s.ts || Date.now(), s.type || 'unknown', s.agentId || 'unknown', s.toolName || null, s.latency || 0, s.success ? 1 : 0, s.tokensUsed || 0, s.error || null, s.provider || null, s.model || null, s.rounds || 0, s.taskId || null, s.status || null, s.keepRate || null);
        }
      }
      if (data.alerts) {
        const ins = db.prepare('INSERT INTO metrics_alerts (ts, type, data, acknowledged) VALUES (?,?,?,?)');
        for (const a of data.alerts) {
          ins.run(a.ts || Date.now(), a.type || '', JSON.stringify(a.data || {}), a.acknowledged ? 1 : 0);
        }
      }
      console.log('[DB] Migrated metrics data');
    }
  } catch(e) { console.error('[DB] Metrics migration error:', e.message); }

  // Migrate error data
  const errFile = path.join(BASE, 'error-cases.json');
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM error_cases').get();
    if (count.c === 0 && fs.existsSync(errFile)) {
      const data = JSON.parse(fs.readFileSync(errFile, 'utf-8'));
      if (data.cases) {
        const ins = db.prepare('INSERT OR REPLACE INTO error_cases (id, code, name, severity, patterns, description, hit_count, created_at, last_hit) VALUES (?,?,?,?,?,?,?,?,?)');
        for (const c of data.cases) {
          ins.run(c.id || 'case_' + Date.now(), c.code || 'E9', c.name || '', c.severity || 0, JSON.stringify(c.patterns || []), c.description || '', c.hitCount || 0, c.createdAt || Date.now(), c.lastHit || null);
        }
      }
      if (data.pending) {
        const ins = db.prepare('INSERT INTO error_pending (ts, message, tool_name, provider, stack) VALUES (?,?,?,?,?)');
        for (const p of data.pending) {
          ins.run(p.ts || Date.now(), (p.error && p.error.message) || p.message || '', (p.error && p.error.toolName) || p.toolName || '', (p.error && p.error.provider) || p.provider || '', (p.error && p.error.stack) || p.stack || '');
        }
      }
      console.log('[DB] Migrated error-case data');
    }
  } catch(e) { console.error('[DB] Error-case migration error:', e.message); }
}

// ========== Helper: parse agent row ==========
function _parseAgent(row) {
  if (!row) return row;
  return { ...row, skills: JSON.parse(row.skills || '[]'), skill_levels: JSON.parse(row.skill_levels || '[]') };
}

// ========== Agent CRUD ==========
const agentOps = {
  all: () => db.prepare("SELECT * FROM agents ORDER BY CASE category WHEN 'ceo' THEN 0 WHEN 'c_suite' THEN 1 WHEN 'director' THEN 2 WHEN 'senior' THEN 3 WHEN 'staff' THEN 4 ELSE 5 END, name_cn").all().map(_parseAgent),
  get: (id) => _parseAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(id)),
  map: () => { const map = {}; agentOps.all().forEach(a => { map[a.id] = a; }); return map; },
  getAll: () => agentOps.all(),
  getById: (id) => agentOps.get(id),
  update: (id, fields) => {
    const allowed = new Set(['name', 'name_cn', 'title', 'category', 'icon', 'role', 'reports_to', 'status', 'description', 'skills', 'skill_levels']);
    fields.updated_at = new Date().toISOString();
    const keys = Object.keys(fields).filter(k => allowed.has(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const vals = keys.map(k => {
      if (k === 'skills' || k === 'skill_levels') return JSON.stringify(fields[k] || []);
      return fields[k];
    });
    db.prepare(`UPDATE agents SET ${sets} WHERE id = ?`).run(...vals, id);
    return agentOps.get(id);
  },
  updateStatus: (id, status) => {
    db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  },
  getBySkill: (skill) => {
    const all = agentOps.all();
    const sk = skill.toLowerCase();
    return all.filter(a => (a.skills || []).some(s => s.toLowerCase().includes(sk)));
  }
};

// ========== Task CRUD ==========
const ALLOWED_TASK_FIELDS = new Set([
  'title', 'description', 'status', 'priority', 'assignee_id',
  'creator', 'deadline', 'tags', 'updated_at', 'assigned_at',
  'completed_at', 'skipped_by', 'recycled_at', 'escalated_at',
  'escalated_by', 'escalation_reason'
]);

const taskOps = {
  all: () => db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all(),
  get: (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id),
  create: (t) => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO tasks (id, title, description, status, priority, assignee_id, creator, deadline, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      t.id, t.title, t.description || '', t.status || 'todo', t.priority || 'medium',
      t.assignee_id || t.assigneeId || null, t.creator || 'system', t.deadline || null,
      JSON.stringify(t.tags || []), t.createdAt || now, t.updatedAt || now
    );
    return taskOps.get(t.id);
  },
  update: (id, fields) => {
    fields.updated_at = new Date().toISOString();
    const keys = Object.keys(fields).filter(k => ALLOWED_TASK_FIELDS.has(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const vals = keys.map(k => {
      if (k === 'tags') return JSON.stringify(fields[k] || []);
      return fields[k];
    });
    db.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...vals, id);
    return taskOps.get(id);
  },
  delete: (id) => { db.prepare('DELETE FROM tasks WHERE id = ?').run(id); },
  pool: () => db.prepare("SELECT * FROM tasks WHERE status IN ('todo','pending') ORDER BY created_at DESC").all(),
  claim: (taskId, agentId) => {
    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = 'assigned', assignee_id = ?, assigned_at = ?, updated_at = ? WHERE id = ? AND status IN ('todo','pending')").run(agentId, now, now, taskId);
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  },
  getAll: (filter = {}) => {
    const conditions = [];
    const vals = [];
    if (filter.status) { conditions.push('status = ?'); vals.push(filter.status); }
    if (filter.assignee_id || filter.assigneeId) { conditions.push('assignee_id = ?'); vals.push(filter.assignee_id || filter.assigneeId); }
    if (filter.priority) { conditions.push('priority = ?'); vals.push(filter.priority); }
    if (filter.creator) { conditions.push('creator = ?'); vals.push(filter.creator); }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limitClause = filter.limit ? ' LIMIT ?' : '';
    const allVals = filter.limit ? vals.concat([filter.limit]) : vals;
    return db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC${limitClause}`).all(...allVals);
  },
  getByStatus: (status) => db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status),
  getByAssignee: (assigneeId) => db.prepare('SELECT * FROM tasks WHERE assignee_id = ? ORDER BY created_at DESC').all(assigneeId)
};

// ========== Conversation CRUD ==========
const convOps = {
  add: (id, agentId, role, content, toolCalls) => db.prepare('INSERT INTO conversations (id, agent_id, role, content, tool_calls) VALUES (?,?,?,?,?)').run(id, agentId, role, content, JSON.stringify(toolCalls || [])),
  getByAgent: (agentId, limit = 50) => db.prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').all(agentId, limit)
};

// ========== Skill CRUD ==========
const skillOps = {
  all: () => db.prepare('SELECT * FROM skills').all(),
  get: (name) => db.prepare('SELECT * FROM skills WHERE name = ?').get(name),
  create: (name, description, instructions, metadata) => db.prepare('INSERT OR REPLACE INTO skills (name, description, instructions, metadata) VALUES (?,?,?,?)').run(name, description, instructions, JSON.stringify(metadata || {})),
  delete: (name) => db.prepare('DELETE FROM skills WHERE name = ?').run(name)
};

// ========== License ==========
const licenseOps = {
  get: () => { const r = db.prepare('SELECT * FROM licenses ORDER BY id DESC LIMIT 1').get(); if (r) r.features = JSON.parse(r.features || '{}'); return r; },
  save: (tier, key, validUntil, features) => db.prepare('INSERT INTO licenses (tier, license_key, activated_at, valid_until, features) VALUES (?,?,?,?,?)').run(tier, key, Date.now(), validUntil, JSON.stringify(features || {}))
};

// ========== Lock CRUD ==========
const lockOps = {
  all: () => db.prepare('SELECT * FROM resource_locks WHERE active = 1').all(),
  acquire: (id, resourceId, type, agentId, reason) => db.prepare('INSERT OR REPLACE INTO resource_locks (id, resource_id, resource_type, agent_id, reason, active) VALUES (?,?,?,?,?,1)').run(id, resourceId, type, agentId, reason || ''),
  release: (id) => { const now = new Date().toISOString(); db.prepare('UPDATE resource_locks SET active = 0, unlocked_at = ? WHERE id = ?').run(now, id); }
};

// ========== Evaluation Ops ==========
const evaluationOps = {
  saveScore: (agentId, scoreData) => {
    const existing = db.prepare('SELECT * FROM evaluation_scores WHERE agent_id = ?').get(agentId);
    const history = existing ? JSON.parse(existing.history || '[]') : [];
    history.push({ score: scoreData.score, keepRate: scoreData.keepRate, ts: Date.now() });
    if (history.length > 50) history.splice(0, history.length - 50);
    db.prepare(`INSERT OR REPLACE INTO evaluation_scores
      (agent_id, score, keep_rate, completion_rate, task_count, failed_count, task_bonus, last_updated, history)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      agentId, scoreData.score, scoreData.keepRate || 0, scoreData.completionRate || 0,
      scoreData.taskCount || 0, scoreData.failedCount || 0, scoreData.taskBonus || 0,
      Date.now(), JSON.stringify(history)
    );
  },
  getScore: (agentId) => {
    const r = db.prepare('SELECT * FROM evaluation_scores WHERE agent_id = ?').get(agentId);
    if (r) { r.history = JSON.parse(r.history || '[]'); return r; }
    return null;
  },
  getLeaderboard: () => db.prepare('SELECT * FROM evaluation_scores ORDER BY score DESC').all().map(r => { r.history = []; return r; }),
  saveRecord: (record) => {
    const ins = db.prepare('INSERT INTO evaluation_records (ts, task_id, agent_id, status, feedback, keep_rate) VALUES (?,?,?,?,?,?)');
    return ins.run(record.ts || Date.now(), record.taskId || '', record.agentId || '', record.status || '', record.feedback || '', record.keepRate || null);
  },
  getRecords: (agentId, limit = 20) => {
    if (agentId) return db.prepare('SELECT * FROM evaluation_records WHERE agent_id = ? ORDER BY id DESC LIMIT ?').all(agentId, limit);
    return db.prepare('SELECT * FROM evaluation_records ORDER BY id DESC LIMIT ?').all(limit);
  },
  getHistory: (agentId) => {
    const r = db.prepare('SELECT * FROM evaluation_scores WHERE agent_id = ?').get(agentId);
    return r ? JSON.parse(r.history || '[]') : [];
  }
};

// ========== Metrics Ops ==========
const metricsOps = {
  saveSample: (sample) => {
    const ins = db.prepare(`INSERT INTO metrics_samples
      (ts, type, agent_id, tool_name, latency, success, tokens_used, error, provider, model, rounds, task_id, status, keep_rate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    return ins.run(
      sample.ts || Date.now(), sample.type || 'unknown', sample.agentId || 'unknown',
      sample.toolName || null, sample.latency || 0, sample.success ? 1 : 0,
      sample.tokensUsed || 0, sample.error || null, sample.provider || null,
      sample.model || null, sample.rounds || 0, sample.taskId || null,
      sample.status || null, sample.keepRate || null
    );
  },
  saveAlert: (alert) => {
    const ins = db.prepare('INSERT INTO metrics_alerts (ts, type, data, acknowledged) VALUES (?,?,?,?)');
    return ins.run(alert.ts || Date.now(), alert.type || '', JSON.stringify(alert.data || {}), alert.acknowledged ? 1 : 0);
  },
  getWindow: (windowMinutes = 60) => {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    return {
      samples: db.prepare('SELECT * FROM metrics_samples WHERE ts > ? ORDER BY ts').all(cutoff),
      alerts: db.prepare('SELECT * FROM metrics_alerts WHERE ts > ? ORDER BY ts').all(cutoff).map(a => ({ ...a, data: JSON.parse(a.data || '{}') }))
    };
  },
  getAlerts: (limit = 20) => {
    return db.prepare('SELECT * FROM metrics_alerts ORDER BY id DESC LIMIT ?').all(limit).map(a => ({ ...a, data: JSON.parse(a.data || '{}') }));
  },
  acknowledgeAlert: (id) => {
    db.prepare('UPDATE metrics_alerts SET acknowledged = 1 WHERE id = ?').run(id);
  }
};

// ========== Error Ops ==========
const errorOps = {
  saveCase: (errCase) => {
    const ins = db.prepare('INSERT OR REPLACE INTO error_cases (id, code, name, severity, patterns, description, hit_count, created_at, last_hit) VALUES (?,?,?,?,?,?,?,?,?)');
    return ins.run(
      errCase.id || 'case_' + Date.now(), errCase.code || 'E9', errCase.name || '',
      errCase.severity || 0, JSON.stringify(errCase.patterns || []),
      errCase.description || '', errCase.hitCount || 0, errCase.createdAt || Date.now(), errCase.lastHit || null
    );
  },
  getCases: () => db.prepare('SELECT * FROM error_cases ORDER BY created_at DESC').all().map(c => ({ ...c, patterns: JSON.parse(c.patterns || '[]') })),
  savePending: (pending) => {
    const ins = db.prepare('INSERT INTO error_pending (ts, message, tool_name, provider, stack) VALUES (?,?,?,?,?)');
    return ins.run(pending.ts || Date.now(), pending.message || '', pending.toolName || '', pending.provider || '', pending.stack || '');
  },
  getPending: () => db.prepare('SELECT * FROM error_pending ORDER BY ts DESC').all(),
  removePending: (id) => { db.prepare('DELETE FROM error_pending WHERE id = ?').run(id); },
  addKnown: (caseData) => errorOps.saveCase(caseData),
  getStats: () => {
    const total = db.prepare('SELECT COUNT(*) as c FROM error_cases').get().c;
    const pending = db.prepare('SELECT COUNT(*) as c FROM error_pending').get().c;
    const byType = {};
    db.prepare('SELECT code, COUNT(*) as c FROM error_cases GROUP BY code').all().forEach(r => { byType[r.code] = r.c; });
    return { total, pending, byType };
  }
};

// Initialize
getDB();

module.exports = {
  db: getDB,
  agentOps,
  taskOps,
  convOps,
  skillOps,
  licenseOps,
  lockOps,
  evaluationOps,
  metricsOps,
  errorOps
};
