import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { createDatabase, DB_PATH } from './db.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CATEGORY_KINDS = ['expense', 'income'] as const;

type CategoryKind = (typeof CATEGORY_KINDS)[number];

interface TransactionRow {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  note: string | null;
  created_at: string;
}

interface TransactionInput {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  note: string | null;
}

interface CategoryRow {
  id: number;
  name: string;
  color: string;
  kind: CategoryKind;
}

interface CategoryInput {
  name: string;
  color: string;
  kind: CategoryKind;
}

const TRANSACTION_SELECT = `
  SELECT t.id, t.date, t.amount_cents, t.payee, t.category_id,
         c.name AS category_name, c.color AS category_color,
         t.note, t.created_at
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

function isValidCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === 'string' && (CATEGORY_KINDS as readonly string[]).includes(value);
}

/**
 * Validates a category create payload, requiring name, color, and kind.
 */
function parseCategoryInput(
  body: unknown,
): { ok: true; value: CategoryInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { name, color, kind } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, error: 'name must be a non-empty string.' };
  }

  if (!isValidHexColor(color)) {
    return { ok: false, error: 'color must be a hex color string, e.g. #4caf50.' };
  }

  if (!isValidCategoryKind(kind)) {
    return { ok: false, error: "kind must be either 'expense' or 'income'." };
  }

  return { ok: true, value: { name, color, kind } };
}

/**
 * Validates a category update payload. Unlike create, all fields are
 * optional, but any field that is present must be valid.
 */
function parseCategoryUpdate(
  body: unknown,
): { ok: true; value: Partial<CategoryInput> } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { name, color, kind } = body as Record<string, unknown>;
  const value: Partial<CategoryInput> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false, error: 'name must be a non-empty string.' };
    }
    value.name = name;
  }

  if (color !== undefined) {
    if (!isValidHexColor(color)) {
      return { ok: false, error: 'color must be a hex color string, e.g. #4caf50.' };
    }
    value.color = color;
  }

  if (kind !== undefined) {
    if (!isValidCategoryKind(kind)) {
      return { ok: false, error: "kind must be either 'expense' or 'income'." };
    }
    value.kind = kind;
  }

  return { ok: true, value };
}

/**
 * Returns true if `value` is a string in `yyyy-mm-dd` format representing a
 * real calendar date (e.g. rejects `2024-02-30`).
 */
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
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
 * Validates the shared shape of a transaction create/update payload,
 * returning either the normalized fields or a validation error message.
 */
function parseTransactionInput(
  body: unknown,
): { ok: true; value: TransactionInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { date, amount_cents, payee, category_id, note } = body as Record<string, unknown>;

  if (!isValidDate(date)) {
    return { ok: false, error: 'date must be a valid date string in yyyy-mm-dd format.' };
  }

  if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents)) {
    return { ok: false, error: 'amount_cents must be an integer.' };
  }

  if (typeof payee !== 'string' || payee.trim().length === 0) {
    return { ok: false, error: 'payee must be a non-empty string.' };
  }

  if (
    category_id !== undefined &&
    category_id !== null &&
    (typeof category_id !== 'number' || !Number.isInteger(category_id))
  ) {
    return { ok: false, error: 'category_id must be an integer or null.' };
  }

  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { ok: false, error: 'note must be a string or null.' };
  }

  return {
    ok: true,
    value: {
      date,
      amount_cents,
      payee,
      category_id: category_id === undefined ? null : (category_id as number | null),
      note: note === undefined ? null : (note as string | null),
    },
  };
}

const CSV_COLUMNS = ['date', 'amount', 'payee', 'note'] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];

const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

interface CsvImportSkip {
  line: number;
  reason: string;
}

/**
 * Splits a single CSV line into fields, honoring double-quoted values that
 * may themselves contain commas and escaped (`""`) quotes. Returns `null`
 * if the line has an unterminated quoted field.
 */
function splitCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
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
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (inQuotes) {
    return null;
  }

  fields.push(current);
  return fields;
}

/**
 * Validates and normalizes the raw string values of a single CSV row into
 * transaction input, returning either the normalized fields or a
 * human-readable reason the row should be skipped.
 */
function parseCsvRow(
  values: Record<CsvColumn, string>,
): { ok: true; value: TransactionInput } | { ok: false; error: string } {
  const date = values.date.trim();
  const amountText = values.amount.trim();
  const payee = values.payee.trim();
  const note = values.note.trim();

  if (!isValidDate(date)) {
    return { ok: false, error: `Invalid date "${values.date}"; expected yyyy-mm-dd.` };
  }

  if (!AMOUNT_PATTERN.test(amountText)) {
    return { ok: false, error: `Invalid amount "${values.amount}".` };
  }

  if (payee.length === 0) {
    return { ok: false, error: 'payee must not be empty.' };
  }

  if (note.length === 0) {
    return { ok: false, error: 'note must not be empty.' };
  }

  const amount_cents = Math.round(Number(amountText) * 100);

  return {
    ok: true,
    value: { date, amount_cents, payee, category_id: null, note },
  };
}

/**
 * Parses a raw CSV document into valid transaction inputs and a list of
 * skipped rows with their 1-indexed line numbers and reasons. Blank lines
 * are ignored. If the first non-blank line's fields match the expected
 * column names (case-insensitively, in any order) it is treated as a
 * header and used to determine column order; otherwise columns are assumed
 * to be in `date, amount, payee, note` order. No external CSV library is
 * used.
 */
function parseTransactionsCsv(text: string): {
  rows: TransactionInput[];
  skipped: CsvImportSkip[];
} {
  const lines = text.split(/\r\n|\r|\n/);
  const rows: TransactionInput[] = [];
  const skipped: CsvImportSkip[] = [];

  let columnOrder: CsvColumn[] = [...CSV_COLUMNS];
  let headerChecked = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = lines[i];

    if (rawLine.trim().length === 0) {
      continue;
    }

    const fields = splitCsvLine(rawLine);
    if (fields === null) {
      skipped.push({ line: lineNumber, reason: 'Malformed row: unterminated quoted field.' });
      continue;
    }

    if (!headerChecked) {
      headerChecked = true;
      const normalized = fields.map((field) => field.trim().toLowerCase());
      const isHeader =
        normalized.length === CSV_COLUMNS.length &&
        CSV_COLUMNS.every((column) => normalized.includes(column));
      if (isHeader) {
        columnOrder = normalized as CsvColumn[];
        continue;
      }
    }

    if (fields.length !== columnOrder.length) {
      skipped.push({
        line: lineNumber,
        reason: `Malformed row: expected ${columnOrder.length} columns, found ${fields.length}.`,
      });
      continue;
    }

    const values = {} as Record<CsvColumn, string>;
    columnOrder.forEach((column, index) => {
      values[column] = fields[index];
    });

    const parsed = parseCsvRow(values);
    if (!parsed.ok) {
      skipped.push({ line: lineNumber, reason: parsed.error });
      continue;
    }

    rows.push(parsed.value);
  }

  return { rows, skipped };
}

/**
 * Builds an Express application instance. Kept separate from `index.ts` so
 * tests can exercise the app without binding to a network port.
 */
export function createApp(dbPath: string = DB_PATH): Express {
  const app = express();
  const db = createDatabase(dbPath);

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    // A cheap query confirms the database connection is alive.
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  app.get('/api/categories', (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT id, name, color, kind FROM categories ORDER BY name ASC')
      .all() as CategoryRow[];

    res.json(rows);
  });

  app.post('/api/categories', (req: Request, res: Response) => {
    const parsed = parseCategoryInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { name, color, kind } = parsed.value;

    const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
    if (existing) {
      res.status(409).json({ error: 'A category with that name already exists.' });
      return;
    }

    const result = db
      .prepare('INSERT INTO categories (name, color, kind) VALUES (@name, @color, @kind)')
      .run({ name, color, kind });

    const created = db
      .prepare('SELECT id, name, color, kind FROM categories WHERE id = ?')
      .get(result.lastInsertRowid) as CategoryRow;

    res.status(201).json(created);
  });

  app.put('/api/categories/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id must be an integer.' });
      return;
    }

    const existing = db.prepare('SELECT id, name, color, kind FROM categories WHERE id = ?').get(id) as
      | CategoryRow
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const parsed = parseCategoryUpdate(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const name = parsed.value.name ?? existing.name;
    const color = parsed.value.color ?? existing.color;
    const kind = parsed.value.kind ?? existing.kind;

    if (name !== existing.name) {
      const duplicate = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, id);
      if (duplicate) {
        res.status(409).json({ error: 'A category with that name already exists.' });
        return;
      }
    }

    db.prepare('UPDATE categories SET name = @name, color = @color, kind = @kind WHERE id = @id').run({
      id,
      name,
      color,
      kind,
    });

    const updated = db
      .prepare('SELECT id, name, color, kind FROM categories WHERE id = ?')
      .get(id) as CategoryRow;

    res.json(updated);
  });

  app.delete('/api/categories/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id must be an integer.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?')
      .get(id) as { count: number };

    if (count > 0) {
      res.status(409).json({ error: 'Cannot delete a category referenced by transactions.' });
      return;
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);

    res.status(204).send();
  });

  app.get('/api/transactions', (req: Request, res: Response) => {
    const { from, to, category_id: categoryId } = req.query;

    const clauses: string[] = [];
    const params: Record<string, string | number> = {};

    if (typeof from === 'string') {
      if (!isValidDate(from)) {
        res.status(400).json({ error: 'from must be a valid date string in yyyy-mm-dd format.' });
        return;
      }
      clauses.push('t.date >= @from');
      params.from = from;
    }

    if (typeof to === 'string') {
      if (!isValidDate(to)) {
        res.status(400).json({ error: 'to must be a valid date string in yyyy-mm-dd format.' });
        return;
      }
      clauses.push('t.date <= @to');
      params.to = to;
    }

    if (typeof categoryId === 'string') {
      const parsedCategoryId = Number(categoryId);
      if (!Number.isInteger(parsedCategoryId)) {
        res.status(400).json({ error: 'category_id must be an integer.' });
        return;
      }
      clauses.push('t.category_id = @categoryId');
      params.categoryId = parsedCategoryId;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `${TRANSACTION_SELECT}
         ${where}
         ORDER BY t.date DESC, t.id DESC`,
      )
      .all(params) as TransactionRow[];

    res.json(rows);
  });

  app.post('/api/transactions', (req: Request, res: Response) => {
    const parsed = parseTransactionInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { date, amount_cents, payee, category_id, note } = parsed.value;

    const result = db
      .prepare(
        `INSERT INTO transactions (date, amount_cents, payee, category_id, note)
         VALUES (@date, @amount_cents, @payee, @category_id, @note)`,
      )
      .run({ date, amount_cents, payee, category_id, note });

    const created = db
      .prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`)
      .get(result.lastInsertRowid) as TransactionRow;

    res.status(201).json(created);
  });

  app.put('/api/transactions/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id must be an integer.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    const parsed = parseTransactionInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { date, amount_cents, payee, category_id, note } = parsed.value;

    db.prepare(
      `UPDATE transactions
       SET date = @date, amount_cents = @amount_cents, payee = @payee,
           category_id = @category_id, note = @note
       WHERE id = @id`,
    ).run({ id, date, amount_cents, payee, category_id, note });

    const updated = db.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).get(id) as TransactionRow;

    res.json(updated);
  });

  app.delete('/api/transactions/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id must be an integer.' });
      return;
    }

    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    res.status(204).send();
  });

  app.post(
    '/api/transactions/import',
    express.text({ type: '*/*', limit: '5mb' }),
    (req: Request, res: Response) => {
      const csvText = typeof req.body === 'string' ? req.body : '';
      const { rows, skipped } = parseTransactionsCsv(csvText);

      let imported = 0;

      if (rows.length > 0) {
        const insert = db.prepare(
          `INSERT INTO transactions (date, amount_cents, payee, category_id, note)
           VALUES (@date, @amount_cents, @payee, @category_id, @note)`,
        );

        // Insert every valid row inside a single transaction so that a
        // failure partway through leaves the database untouched.
        const insertAll = db.transaction((transactionsToInsert: TransactionInput[]) => {
          for (const transaction of transactionsToInsert) {
            insert.run(transaction);
          }
        });

        try {
          insertAll(rows);
          imported = rows.length;
        } catch {
          res.status(500).json({ error: 'Failed to import transactions.' });
          return;
        }
      }

      res.json({ imported, skipped });
    },
  );

  return app;
}
