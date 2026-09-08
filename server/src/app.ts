import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { createDatabase, DB_PATH } from './db.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface TransactionRow {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
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

  app.get('/api/transactions', (req: Request, res: Response) => {
    const { from, to, category_id: categoryId } = req.query;

    const clauses: string[] = [];
    const params: Record<string, string | number> = {};

    if (typeof from === 'string') {
      if (!isValidDate(from)) {
        res.status(400).json({ error: 'from must be a valid date string in yyyy-mm-dd format.' });
        return;
      }
      clauses.push('date >= @from');
      params.from = from;
    }

    if (typeof to === 'string') {
      if (!isValidDate(to)) {
        res.status(400).json({ error: 'to must be a valid date string in yyyy-mm-dd format.' });
        return;
      }
      clauses.push('date <= @to');
      params.to = to;
    }

    if (typeof categoryId === 'string') {
      const parsedCategoryId = Number(categoryId);
      if (!Number.isInteger(parsedCategoryId)) {
        res.status(400).json({ error: 'category_id must be an integer.' });
        return;
      }
      clauses.push('category_id = @categoryId');
      params.categoryId = parsedCategoryId;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT id, date, amount_cents, payee, category_id, note, created_at
         FROM transactions
         ${where}
         ORDER BY date DESC, id DESC`,
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
      .prepare(
        `SELECT id, date, amount_cents, payee, category_id, note, created_at
         FROM transactions WHERE id = ?`,
      )
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

    const updated = db
      .prepare(
        `SELECT id, date, amount_cents, payee, category_id, note, created_at
         FROM transactions WHERE id = ?`,
      )
      .get(id) as TransactionRow;

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
