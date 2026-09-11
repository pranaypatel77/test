import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tmpDbPaths: string[] = [];

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  const dbPath = path.join(dir, 'ledger.db');
  tmpDbPaths.push(dbPath);
  return dbPath;
}

afterEach(() => {
  for (const dbPath of tmpDbPaths.splice(0)) {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

async function getCategoryId(app: import('express').Express, name: string): Promise<number> {
  const response = await request(app).get('/api/categories');
  const category = response.body.find((c: { name: string }) => c.name === name);
  return category.id;
}

describe('GET /api/summary', () => {
  it('returns zeroed totals and an empty categoryTotals for a month with no transactions', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 0,
      totalExpenses: 0,
      net: 0,
      categoryTotals: {},
    });
  });

  it('sums a single expense transaction into totalExpenses and categoryTotals', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -4200,
      payee: 'Corner Store',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 0,
      totalExpenses: 4200,
      net: -4200,
      categoryTotals: { Groceries: 4200 },
    });
  });

  it('sums a single income transaction into totalIncome without affecting categoryTotals', async () => {
    const app = createApp(tempDbPath());
    const salaryId = await getCategoryId(app, 'Salary');

    await request(app).post('/api/transactions').send({
      date: '2024-03-01',
      amount_cents: 250000,
      payee: 'Employer',
      category_id: salaryId,
      note: null,
    });

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 250000,
      totalExpenses: 0,
      net: 250000,
      categoryTotals: {},
    });
  });

  it('aggregates multiple categories and computes net income minus expenses', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');
    const rentId = await getCategoryId(app, 'Rent');
    const salaryId = await getCategoryId(app, 'Salary');

    await request(app).post('/api/transactions').send({
      date: '2024-03-01',
      amount_cents: 300000,
      payee: 'Employer',
      category_id: salaryId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-03',
      amount_cents: -150000,
      payee: 'Landlord',
      category_id: rentId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-10',
      amount_cents: -5000,
      payee: 'Grocery Run 1',
      category_id: groceriesId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-20',
      amount_cents: -3000,
      payee: 'Grocery Run 2',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 300000,
      totalExpenses: 158000,
      net: 142000,
      categoryTotals: { Rent: 150000, Groceries: 8000 },
    });
  });

  it('excludes transactions from adjacent months at the boundary', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).post('/api/transactions').send({
      date: '2024-02-29',
      amount_cents: -1000,
      payee: 'Last Day Of February',
      category_id: groceriesId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-01',
      amount_cents: -2000,
      payee: 'First Day Of March',
      category_id: groceriesId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-31',
      amount_cents: -3000,
      payee: 'Last Day Of March',
      category_id: groceriesId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-04-01',
      amount_cents: -4000,
      payee: 'First Day Of April',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 0,
      totalExpenses: 5000,
      net: -5000,
      categoryTotals: { Groceries: 5000 },
    });
  });

  it('excludes uncategorized expenses from categoryTotals but still counts them in totalExpenses', async () => {
    const app = createApp(tempDbPath());

    await request(app).post('/api/transactions').send({
      date: '2024-03-05',
      amount_cents: -750,
      payee: 'No Category',
      category_id: null,
      note: null,
    });

    const response = await request(app).get('/api/summary').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 0,
      totalExpenses: 750,
      net: -750,
      categoryTotals: {},
    });
  });

  it('returns 400 when month is not in yyyy-mm format', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/summary').query({ month: '03-2024' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('defaults to the current month when month is omitted', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/summary');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalIncome: 0,
      totalExpenses: 0,
      net: 0,
      categoryTotals: {},
    });
  });
});
