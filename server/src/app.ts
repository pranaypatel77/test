import cors from 'cors';
import type Database from 'better-sqlite3';
import express, { type Express, type Request, type Response } from 'express';
import { createDatabase, DB_PATH } from './db.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CATEGORY_KINDS = ['expense', 'income'] as const;
const ACCOUNT_KINDS = ['checking', 'credit', 'cash'] as const;

type CategoryKind = (typeof CATEGORY_KINDS)[number];
type AccountKind = (typeof ACCOUNT_KINDS)[number];

interface TransactionRow {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  account_id: number | null;
  note: string | null;
  created_at: string;
}

interface TransactionInput {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  account_id: number | null;
  note: string | null;
}

interface AccountRow {
  id: number;
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
}

interface AccountInput {
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
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

interface BudgetStatusRow {
  category_id: number;
  category_name: string;
  category_color: string;
  month: string;
  limit_cents: number | null;
  amount_spent_cents: number;
}

interface BudgetInput {
  limit_cents: number;
}

const TRANSACTION_SELECT = `
  SELECT t.id, t.date, t.amount_cents, t.payee, t.category_id,
         c.name AS category_name, c.color AS category_color,
         t.account_id, t.note, t.created_at
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

function isValidCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === 'string' && (CATEGORY_KINDS as readonly string[]).includes(value);
}

function isValidAccountKind(value: unknown): value is AccountKind {
  return typeof value === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(value);
}

/**
 * Validates an account create payload, requiring name and kind.
 * `opening_balance_cents` is optional and defaults to 0.
 */
function parseAccountInput(
  body: unknown,
): { ok: true; value: AccountInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { name, kind, opening_balance_cents: openingBalanceCents } = body as Record<
    string,
    unknown
  >;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, error: 'name must be a non-empty string.' };
  }

  if (!isValidAccountKind(kind)) {
    return { ok: false, error: "kind must be one of 'checking', 'credit', or 'cash'." };
  }

  if (
    openingBalanceCents !== undefined &&
    (typeof openingBalanceCents !== 'number' || !Number.isInteger(openingBalanceCents))
  ) {
    return { ok: false, error: 'opening_balance_cents must be an integer.' };
  }

  return {
    ok: true,
    value: {
      name,
      kind,
      opening_balance_cents: openingBalanceCents === undefined ? 0 : openingBalanceCents,
    },
  };
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
 * Validates a budget upsert payload, requiring a positive integer
 * `limit_cents`.
 */
function parseBudgetInput(
  body: unknown,
): { ok: true; value: BudgetInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { limit_cents } = body as Record<string, unknown>;

  if (typeof limit_cents !== 'number' || !Number.isInteger(limit_cents) || limit_cents <= 0) {
    return { ok: false, error: 'limit_cents must be a positive integer.' };
  }

  return { ok: true, value: { limit_cents } };
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

  const { date, amount_cents, payee, category_id, account_id: accountId, note } = body as Record<
    string,
    unknown
  >;

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

  if (
    accountId !== undefined &&
    accountId !== null &&
    (typeof accountId !== 'number' || !Number.isInteger(accountId))
  ) {
    return { ok: false, error: 'account_id must be an integer or null.' };
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
      account_id: accountId === undefined ? null : (accountId as number | null),
      note: note === undefined ? null : (note as string | null),
    },
  };
}

/**
 * Returns true when `accountId` names a row in the accounts table.
 *
 * `transactions.account_id` carries a `REFERENCES accounts(id)` constraint, so
 * inserting an unknown id makes SQLite raise a FOREIGN KEY error, which Express
 * surfaces as a 500 with a stack trace — a client mistake reported as a server
 * fault, leaking internal paths. Both write handlers check this first and
 * return 400 instead.
 */
function accountExists(db: Database.Database, accountId: number): boolean {
  const row = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(accountId);
  return row !== undefined;
}

/** Returns the id of the default account (the earliest created account). */
function getDefaultAccountId(db: Database.Database): number | null {
  const row = db.prepare(`SELECT id FROM accounts ORDER BY id ASC LIMIT 1`).get() as
    | { id: number }
    | undefined;
  return row ? row.id : null;
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

  app.get('/api/accounts', (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT id, name, kind, opening_balance_cents FROM accounts ORDER BY id ASC')
      .all() as AccountRow[];

    res.json(rows);
  });

  app.post('/api/accounts', (req: Request, res: Response) => {
    const parsed = parseAccountInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { name, kind, opening_balance_cents: openingBalanceCents } = parsed.value;

    const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(name);
    if (existing) {
      res.status(409).json({ error: 'An account with that name already exists.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO accounts (name, kind, opening_balance_cents)
         VALUES (@name, @kind, @opening_balance_cents)`,
      )
      .run({ name, kind, opening_balance_cents: openingBalanceCents });

    const created = db
      .prepare('SELECT id, name, kind, opening_balance_cents FROM accounts WHERE id = ?')
      .get(result.lastInsertRowid) as AccountRow;

    res.status(201).json(created);
  });

  app.get('/api/summary', (req: Request, res: Response) => {
    const { month, account_id: accountId } = req.query;
    const requestedMonth = typeof month === 'string' ? month : currentMonth();

    if (!isValidMonth(requestedMonth)) {
      res.status(400).json({ error: 'month must be a valid date string in yyyy-mm format.' });
      return;
    }

    const params: Record<string, string | number> = { month: requestedMonth };
    let accountClause = '';

    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || !Number.isInteger(Number(accountId))) {
        res.status(400).json({ error: 'account_id must be an integer.' });
        return;
      }
      accountClause = 'AND t.account_id = @accountId';
      params.accountId = Number(accountId);
    }

    const rows = db
      .prepare(
        `SELECT t.amount_cents, c.name AS category_name
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE substr(t.date, 1, 7) = @month ${accountClause}`,
      )
      .all(params) as { amount_cents: number; category_name: string | null }[];

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

  app.get('/api/budgets', (req: Request, res: Response) => {
    const { month } = req.query;
    const requestedMonth = typeof month === 'string' ? month : currentMonth();

    if (!isValidMonth(requestedMonth)) {
      res.status(400).json({ error: 'month must be a valid date string in yyyy-mm format.' });
      return;
    }

    const categories = db
      .prepare(`SELECT id, name, color FROM categories WHERE kind = 'expense' ORDER BY name ASC`)
      .all() as { id: number; name: string; color: string }[];

    const budgetRows = db
      .prepare('SELECT category_id, limit_cents FROM budgets WHERE month = @month')
      .all({ month: requestedMonth }) as { category_id: number; limit_cents: number }[];
    const limitsByCategory = new Map(budgetRows.map((row) => [row.category_id, row.limit_cents]));

    const spentRows = db
      .prepare(
        `SELECT category_id, SUM(-amount_cents) AS amount_spent_cents
         FROM transactions
         WHERE amount_cents < 0 AND category_id IS NOT NULL AND substr(date, 1, 7) = @month
         GROUP BY category_id`,
      )
      .all({ month: requestedMonth }) as { category_id: number; amount_spent_cents: number }[];
    const spentByCategory = new Map(spentRows.map((row) => [row.category_id, row.amount_spent_cents]));

    const result: BudgetStatusRow[] = categories.map((category) => ({
      category_id: category.id,
      category_name: category.name,
      category_color: category.color,
      month: requestedMonth,
      limit_cents: limitsByCategory.get(category.id) ?? null,
      amount_spent_cents: spentByCategory.get(category.id) ?? 0,
    }));

    res.json(result);
  });

  app.put('/api/budgets/:categoryId', (req: Request, res: Response) => {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId)) {
      res.status(400).json({ error: 'categoryId must be an integer.' });
      return;
    }

    const { month } = req.query;
    const requestedMonth = typeof month === 'string' ? month : currentMonth();
    if (!isValidMonth(requestedMonth)) {
      res.status(400).json({ error: 'month must be a valid date string in yyyy-mm format.' });
      return;
    }

    const category = db
      .prepare('SELECT id, name, color FROM categories WHERE id = ?')
      .get(categoryId) as { id: number; name: string; color: string } | undefined;
    if (!category) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const parsed = parseBudgetInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { limit_cents } = parsed.value;

    db.prepare(
      `INSERT INTO budgets (category_id, month, limit_cents)
       VALUES (@category_id, @month, @limit_cents)
       ON CONFLICT (category_id, month) DO UPDATE SET limit_cents = @limit_cents`,
    ).run({ category_id: categoryId, month: requestedMonth, limit_cents });

    const { amount_spent_cents: amountSpentCents } = db
      .prepare(
        `SELECT COALESCE(SUM(-amount_cents), 0) AS amount_spent_cents
         FROM transactions
         WHERE amount_cents < 0 AND category_id = @category_id AND substr(date, 1, 7) = @month`,
      )
      .get({ category_id: categoryId, month: requestedMonth }) as { amount_spent_cents: number };

    const result: BudgetStatusRow = {
      category_id: category.id,
      category_name: category.name,
      category_color: category.color,
      month: requestedMonth,
      limit_cents,
      amount_spent_cents: amountSpentCents,
    };

    res.json(result);
  });

  app.get('/api/transactions', (req: Request, res: Response) => {
    const { from, to, category_id: categoryId, account_id: accountId, q } = req.query;

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

    if (categoryId !== undefined) {
      // `category_id` may be repeated in the query string (e.g.
      // `?category_id=1&category_id=2`) to support multi-category filtering.
      const categoryIdValues = Array.isArray(categoryId) ? categoryId : [categoryId];
      const parsedCategoryIds: number[] = [];

      for (const value of categoryIdValues) {
        if (typeof value !== 'string') {
          res.status(400).json({ error: 'category_id must be an integer.' });
          return;
        }
        const parsedCategoryId = Number(value);
        if (!Number.isInteger(parsedCategoryId)) {
          res.status(400).json({ error: 'category_id must be an integer.' });
          return;
        }
        parsedCategoryIds.push(parsedCategoryId);
      }

      if (parsedCategoryIds.length > 0) {
        const placeholders = parsedCategoryIds.map((_, index) => `@categoryId${index}`).join(', ');
        clauses.push(`t.category_id IN (${placeholders})`);
        parsedCategoryIds.forEach((value, index) => {
          params[`categoryId${index}`] = value;
        });
      }
    }

    if (accountId !== undefined) {
      // `account_id` may be repeated in the query string, mirroring
      // `category_id`, to support multi-account filtering.
      const accountIdValues = Array.isArray(accountId) ? accountId : [accountId];
      const parsedAccountIds: number[] = [];

      for (const value of accountIdValues) {
        if (typeof value !== 'string') {
          res.status(400).json({ error: 'account_id must be an integer.' });
          return;
        }
        const parsedAccountId = Number(value);
        if (!Number.isInteger(parsedAccountId)) {
          res.status(400).json({ error: 'account_id must be an integer.' });
          return;
        }
        parsedAccountIds.push(parsedAccountId);
      }

      if (parsedAccountIds.length > 0) {
        const placeholders = parsedAccountIds.map((_, index) => `@accountId${index}`).join(', ');
        clauses.push(`t.account_id IN (${placeholders})`);
        parsedAccountIds.forEach((value, index) => {
          params[`accountId${index}`] = value;
        });
      }
    }

    if (typeof q === 'string' && q.trim().length > 0) {
      clauses.push('(LOWER(t.payee) LIKE @q OR LOWER(t.note) LIKE @q)');
      params.q = `%${q.trim().toLowerCase()}%`;
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

    const { date, amount_cents, payee, category_id, account_id, note } = parsed.value;
    if (account_id !== undefined && account_id !== null && !accountExists(db, account_id)) {
      res.status(400).json({ error: 'account_id must reference an existing account.' });
      return;
    }
    const resolvedAccountId = account_id ?? getDefaultAccountId(db);

    const result = db
      .prepare(
        `INSERT INTO transactions (date, amount_cents, payee, category_id, account_id, note)
         VALUES (@date, @amount_cents, @payee, @category_id, @account_id, @note)`,
      )
      .run({ date, amount_cents, payee, category_id, account_id: resolvedAccountId, note });

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

    const { date, amount_cents, payee, category_id, account_id, note } = parsed.value;
    if (account_id !== undefined && account_id !== null && !accountExists(db, account_id)) {
      res.status(400).json({ error: 'account_id must reference an existing account.' });
      return;
    }
    const resolvedAccountId = account_id ?? getDefaultAccountId(db);

    db.prepare(
      `UPDATE transactions
       SET date = @date, amount_cents = @amount_cents, payee = @payee,
           category_id = @category_id, account_id = @account_id, note = @note
       WHERE id = @id`,
    ).run({ id, date, amount_cents, payee, category_id, account_id: resolvedAccountId, note });

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
