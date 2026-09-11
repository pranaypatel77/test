import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `src` (dev, via tsx) and `dist` (after build, via tsc) both live directly
// under the `server` package root, so `..` from either location resolves to
// `server/data`.
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_PATH = path.join(DATA_DIR, 'ledger.db');

/**
 * Opens (and lazily creates) the in-file SQLite database used by the app.
 * The database file and its parent directory are created on first boot if
 * they do not already exist.
 */
export function createDatabase(dbPath: string = DB_PATH): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  migrate(db);

  return db;
}

/**
 * Runs all schema migrations against the given database connection. Uses
 * `CREATE TABLE IF NOT EXISTS` so it is safe to call on every boot.
 */
function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('expense', 'income'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payee TEXT NOT NULL,
      category_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedCategories(db);
}

/**
 * Seeds the default set of categories on first boot. Uses `INSERT OR
 * IGNORE` against the unique `name` column so it is safe to call on every
 * boot without creating duplicates or overwriting user edits.
 */
function seedCategories(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO categories (name, color, kind) VALUES (@name, @color, @kind)`,
  );

  const defaults = [
    { name: 'Groceries', color: '#4caf50', kind: 'expense' },
    { name: 'Rent', color: '#f44336', kind: 'expense' },
    { name: 'Utilities', color: '#ff9800', kind: 'expense' },
    { name: 'Dining', color: '#9c27b0', kind: 'expense' },
    { name: 'Transport', color: '#2196f3', kind: 'expense' },
    { name: 'Salary', color: '#009688', kind: 'income' },
  ];

  for (const category of defaults) {
    insert.run(category);
  }
}
