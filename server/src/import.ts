import type Database from 'better-sqlite3';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXPECTED_HEADER = ['date', 'amount', 'description', 'category'];

export interface ImportError {
  line: number;
  reason: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: ImportError[];
}

interface CategoryRow {
  id: number;
  name: string;
}

/**
 * Returns true if `value` is a string in `yyyy-mm-dd` format representing a
 * real calendar date (e.g. rejects `2024-02-30`).
 */
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Splits a single CSV line into fields, honoring double-quoted values that
 * may contain commas. Does not support escaped quotes within a quoted field
 * beyond the standard `""` doubling convention.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

/**
 * Finds or creates a category by name, returning its id. Category lookups
 * are case-insensitive so `Groceries` and `groceries` resolve to the same
 * category.
 */
function findOrCreateCategory(db: Database.Database, name: string): number {
  const existing = db
    .prepare('SELECT id, name FROM categories WHERE LOWER(name) = LOWER(?)')
    .get(name) as CategoryRow | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare(`INSERT INTO categories (name, color, kind) VALUES (@name, @color, @kind)`)
    .run({ name, color: '#9e9e9e', kind: 'expense' });

  return Number(result.lastInsertRowid);
}

/** Returns the id of the default account (the earliest created account). */
function getDefaultAccountId(db: Database.Database): number | null {
  const row = db.prepare(`SELECT id FROM accounts ORDER BY id ASC LIMIT 1`).get() as
    | { id: number }
    | undefined;
  return row ? row.id : null;
}

/**
 * Parses a CSV body of transactions (header: date,amount,description,category)
 * and inserts each valid row as a transaction, creating any unknown category
 * by name. Returns `null` if the header is missing or does not match the
 * expected columns, in which case nothing is inserted.
 */
export function importTransactionsCsv(db: Database.Database, csv: string): ImportResult | null {
  // Normalize line endings and drop a trailing blank line.
  const lines = csv.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return null;
  }

  const header = splitCsvLine(lines[0]).map((field) => field.toLowerCase());
  const headerMatches =
    header.length === EXPECTED_HEADER.length &&
    header.every((field, index) => field === EXPECTED_HEADER[index]);

  if (!headerMatches) {
    return null;
  }

  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };
  const defaultAccountId = getDefaultAccountId(db);

  const insertTransaction = db.prepare(
    `INSERT INTO transactions (date, amount_cents, payee, category_id, account_id, note)
     VALUES (@date, @amount_cents, @payee, @category_id, @account_id, @note)`,
  );

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (line.trim() === '') {
      continue;
    }

    const fields = splitCsvLine(line);
    if (fields.length !== EXPECTED_HEADER.length) {
      result.skipped += 1;
      result.errors.push({ line: lineNumber, reason: 'Expected 4 columns: date,amount,description,category.' });
      continue;
    }

    const [date, amountRaw, description, category] = fields;

    if (!isValidDate(date)) {
      result.skipped += 1;
      result.errors.push({ line: lineNumber, reason: 'date must be a valid date string in yyyy-mm-dd format.' });
      continue;
    }

    const amount = Number(amountRaw);
    if (amountRaw.trim() === '' || Number.isNaN(amount)) {
      result.skipped += 1;
      result.errors.push({ line: lineNumber, reason: 'amount must be numeric.' });
      continue;
    }

    if (description.trim().length === 0) {
      result.skipped += 1;
      result.errors.push({ line: lineNumber, reason: 'description must be a non-empty string.' });
      continue;
    }

    const amountCents = Math.round(amount * 100);
    const categoryId = category.trim().length > 0 ? findOrCreateCategory(db, category.trim()) : null;

    insertTransaction.run({
      date,
      amount_cents: amountCents,
      payee: description,
      category_id: categoryId,
      account_id: defaultAccountId,
      note: null,
    });

    result.inserted += 1;
  }

  return result;
}
