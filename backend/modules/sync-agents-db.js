// This module updates the SQLite agents table with agents.json data
// It is loaded by server-modern.js during init
const path = require('path');
const fs = require('fs');
const BASE = __dirname + '/..';

module.exports = function updateAgentsFromJSON(db) {
  const agentsFile = path.join(BASE, 'agents.json');
  try {
    const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'));
    const update = db.prepare('UPDATE agents SET name = ?, name_cn = ?, title = ? WHERE id = ?');
    const insert = db.prepare('INSERT OR REPLACE INTO agents (id, name, name_cn, title, status, icon, role) VALUES (?,?,?,?,?,?,?)');
    
    const tx = db.transaction((list) => {
      for (const a of list) {
        const result = update.run(a.name, a.name_cn, a.title, a.id);
        if (result.changes === 0) {
          // Agent not in DB, insert it
          insert.run(a.id, a.name, a.name_cn, a.title, 'online', a.icon || '', a.role || 'staff');
        }
      }
    });
    tx(agents);
    console.log('[DB Agent Update] Updated ' + agents.length + ' agents from agents.json');
    
    // Verify
    const dbAgents = db.prepare('SELECT id, name, name_cn, title FROM agents ORDER BY id LIMIT 5').all();
    console.log('[DB Agent Update] Sample:');
    dbAgents.forEach(a => console.log('  ' + a.id + ': ' + a.name + ' / ' + a.name_cn));
  } catch(e) {
    console.error('[DB Agent Update] Error:', e.message);
  }
};
