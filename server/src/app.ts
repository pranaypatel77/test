import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { createDatabase, DB_PATH } from './db.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
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
 * Returns true if `value` is a string in `yyyy-mm` format.
 */
function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

/**
 * Returns the current UTC month as a `yyyy-mm` string.
 */
function currentMonth(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
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

  app.get('/api/summary', (req: Request, res: Response) => {
    const { month } = req.query;
    const requestedMonth = typeof month === 'string' ? month : currentMonth();

    if (!isValidMonth(requestedMonth)) {
      res.status(400).json({ error: 'month must be a valid date string in yyyy-mm format.' });
      return;
    }

    const rows = db
      .prepare(
        `SELECT t.amount_cents, c.name AS category_name
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE substr(t.date, 1, 7) = @month`,
      )
      .all({ month: requestedMonth }) as { amount_cents: number; category_name: string | null }[];

    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryTotals: Record<string, number> = {};

    for (const row of rows) {
      if (row.amount_cents >= 0) {
        totalIncome += row.amount_cents;
        continue;
      }

      const expenseAmount = -row.amount_cents;
      totalExpenses += expenseAmount;

      if (row.category_name) {
        categoryTotals[row.category_name] = (categoryTotals[row.category_name] ?? 0) + expenseAmount;
      }
    }

    res.json({
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      categoryTotals,
    });
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

  return app;
}
