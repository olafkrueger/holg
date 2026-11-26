import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations(name,applied_at) VALUES (?,?)').run(name, Date.now());
    })();
  }
  return db;
}
