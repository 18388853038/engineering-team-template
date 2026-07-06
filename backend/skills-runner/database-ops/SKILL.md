---
name: database-ops
description: 数据库操作指南，涵盖 SQLite、MySQL、PostgreSQL 的常见操作、查询优化、迁移管理
---

# Database Ops - 数据库操作

## 适用场景
- 数据库 CRUD 操作
- SQL 查询编写与优化
- 数据库迁移（migration）
- 索引设计与性能调优
- 数据备份与恢复

## SQLite 常用操作（eCompany 项目使用）

### 连接与查询
```javascript
const Database = require('better-sqlite3');
const db = new Database('path/to/db.sqlite');
db.pragma('journal_mode = WAL');

// 查询单行
const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// 查询多行
const rows = db.prepare('SELECT * FROM users').all();

// 插入并获取 ID
const info = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
console.log(info.lastInsertRowid);

// 更新
db.prepare('UPDATE users SET name = ? WHERE id = ?').run(newName, id);

// 删除
db.prepare('DELETE FROM users WHERE id = ?').run(id);
```

### 事务处理
```javascript
const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
const update = db.prepare('UPDATE counters SET count = count + 1');
const transaction = db.transaction((names) => {
  for (const name of names) insert.run(name);
  update.run();
});
transaction(['Alice', 'Bob', 'Charlie']);
```

### 表结构操作
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 添加列
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
```

## 性能优化原则

1. **索引优先**：WHERE、JOIN、ORDER BY 的列优先建索引
2. **避免 SELECT \***：只查需要的列
3. **分页查询**：大数据量使用 LIMIT + OFFSET
4. **批量操作**：多条插入/更新放在事务里
5. **WAL 模式**：SQLite 开启 WAL 提升并发性能

## 迁移管理

```javascript
// 简单迁移函数
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const version = db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations').get().v;
  if (version < 1) { db.exec('CREATE TABLE ...'); db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run(); }
}
```

## 文档
- SQLite: https://sqlite.org/docs.html
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
