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

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('checking', 'credit', 'cash')),
      opening_balance_cents INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payee TEXT NOT NULL,
      category_id INTEGER,
      account_id INTEGER REFERENCES accounts(id),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      month TEXT NOT NULL,
      limit_cents INTEGER NOT NULL,
      UNIQUE (category_id, month)
    );

    CREATE TABLE IF NOT EXISTS dismissed_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_payee TEXT NOT NULL,
      cadence TEXT NOT NULL,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (normalized_payee, cadence)
    );
  `);

  seedCategories(db);
  const defaultAccountId = seedDefaultAccount(db);
  ensureAccountIdColumn(db, defaultAccountId);
}

/**
 * Seeds the default "Cash" account on first boot, used to hold any
 * transactions that are not explicitly assigned to another account. Uses
 * `INSERT OR IGNORE` against the unique `name` column so it is safe to call
 * on every boot. Returns the id of the default account.
 */
function seedDefaultAccount(db: Database.Database): number {
  db.prepare(
    `INSERT OR IGNORE INTO accounts (name, kind, opening_balance_cents) VALUES ('Cash', 'cash', 0)`,
  ).run();

  const { id } = db.prepare(`SELECT id FROM accounts ORDER BY id ASC LIMIT 1`).get() as {
    id: number;
  };
  return id;
}

/**
 * Older databases created before accounts existed won't have an `account_id`
 * column on `transactions`. This adds the column if it is missing (SQLite
 * has no `ADD COLUMN IF NOT EXISTS`) and backfills any transaction without an
 * account to the default account.
 */
function ensureAccountIdColumn(db: Database.Database, defaultAccountId: number): void {
  const columns = db.prepare(`PRAGMA table_info(transactions)`).all() as { name: string }[];
  const hasAccountId = columns.some((column) => column.name === 'account_id');

  if (!hasAccountId) {
    db.exec(`ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)`);
  }

  db.prepare(`UPDATE transactions SET account_id = @accountId WHERE account_id IS NULL`).run({
    accountId: defaultAccountId,
  });
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
