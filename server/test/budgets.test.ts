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

describe('GET /api/budgets', () => {
  it('returns all expense categories with a null limit and zero spend for a month with no data', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(5);
    for (const row of response.body) {
      expect(row.limit_cents).toBeNull();
      expect(row.amount_spent_cents).toBe(0);
    }
    expect(response.body.map((r: { category_name: string }) => r.category_name).sort()).toEqual(
      ['Dining', 'Groceries', 'Rent', 'Transport', 'Utilities'].sort(),
    );
  });

  it('excludes income categories from the result', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });

    expect(response.body.find((r: { category_name: string }) => r.category_name === 'Salary')).toBeUndefined();
  });

  it('includes the limit set for the category and month', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-03' }).send({
      limit_cents: 30000,
    });

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const groceries = response.body.find((r: { category_name: string }) => r.category_name === 'Groceries');

    expect(groceries.limit_cents).toBe(30000);
  });

  it('sums spending for the month, ignoring a category with no transactions', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).post('/api/transactions').send({
      date: '2024-03-05',
      amount_cents: -1500,
      payee: 'Corner Store',
      category_id: groceriesId,
      note: null,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-10',
      amount_cents: -2500,
      payee: 'Supermarket',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const groceries = response.body.find((r: { category_name: string }) => r.category_name === 'Groceries');
    const rent = response.body.find((r: { category_name: string }) => r.category_name === 'Rent');

    expect(groceries.amount_spent_cents).toBe(4000);
    expect(rent.amount_spent_cents).toBe(0);
  });

  it('excludes transactions from other months', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).post('/api/transactions').send({
      date: '2024-02-28',
      amount_cents: -1000,
      payee: 'Corner Store',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const groceries = response.body.find((r: { category_name: string }) => r.category_name === 'Groceries');

    expect(groceries.amount_spent_cents).toBe(0);
  });

  it('defaults to the current month when month is omitted', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/budgets');

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('returns 400 when month is not in yyyy-mm format', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/budgets').query({ month: 'March 2024' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});

describe('PUT /api/budgets/:categoryId', () => {
  it('creates a new budget row and returns the current status', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const response = await request(app)
      .put(`/api/budgets/${groceriesId}`)
      .query({ month: '2024-03' })
      .send({ limit_cents: 20000 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      category_id: groceriesId,
      category_name: 'Groceries',
      month: '2024-03',
      limit_cents: 20000,
      amount_spent_cents: 0,
    });
  });

  it('overwrites the previous limit when upserting the same category and month', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-03' }).send({
      limit_cents: 20000,
    });
    const response = await request(app)
      .put(`/api/budgets/${groceriesId}`)
      .query({ month: '2024-03' })
      .send({ limit_cents: 35000 });

    expect(response.status).toBe(200);
    expect(response.body.limit_cents).toBe(35000);

    const getResponse = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const groceries = getResponse.body.find((r: { category_name: string }) => r.category_name === 'Groceries');
    expect(groceries.limit_cents).toBe(35000);
  });

  it('keeps budgets for different months independent', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-03' }).send({
      limit_cents: 20000,
    });
    await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-04' }).send({
      limit_cents: 40000,
    });

    const marchResponse = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const aprilResponse = await request(app).get('/api/budgets').query({ month: '2024-04' });

    const marchGroceries = marchResponse.body.find(
      (r: { category_name: string }) => r.category_name === 'Groceries',
    );
    const aprilGroceries = aprilResponse.body.find(
      (r: { category_name: string }) => r.category_name === 'Groceries',
    );

    expect(marchGroceries.limit_cents).toBe(20000);
    expect(aprilGroceries.limit_cents).toBe(40000);
  });

  it('defaults month to the current month when omitted', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const putResponse = await request(app).put(`/api/budgets/${groceriesId}`).send({ limit_cents: 15000 });
    expect(putResponse.status).toBe(200);
    expect(putResponse.body.month).toMatch(/^\d{4}-\d{2}$/);

    const getResponse = await request(app).get('/api/budgets');
    const groceries = getResponse.body.find((r: { category_name: string }) => r.category_name === 'Groceries');
    expect(groceries.limit_cents).toBe(15000);
  });

  it('returns 400 when limit_cents is zero', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const response = await request(app)
      .put(`/api/budgets/${groceriesId}`)
      .query({ month: '2024-03' })
      .send({ limit_cents: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when limit_cents is negative', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const response = await request(app)
      .put(`/api/budgets/${groceriesId}`)
      .query({ month: '2024-03' })
      .send({ limit_cents: -500 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when limit_cents is missing', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const response = await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-03' }).send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when month is invalid', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    const response = await request(app)
      .put(`/api/budgets/${groceriesId}`)
      .query({ month: 'not-a-month' })
      .send({ limit_cents: 10000 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 404 when the category does not exist', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app)
      .put('/api/budgets/999')
      .query({ month: '2024-03' })
      .send({ limit_cents: 10000 });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when categoryId is not an integer', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app)
      .put('/api/budgets/abc')
      .query({ month: '2024-03' })
      .send({ limit_cents: 10000 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('reflects overspend in amount_spent_cents relative to the limit', async () => {
    const app = createApp(tempDbPath());
    const groceriesId = await getCategoryId(app, 'Groceries');

    await request(app).put(`/api/budgets/${groceriesId}`).query({ month: '2024-03' }).send({
      limit_cents: 1000,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-05',
      amount_cents: -2500,
      payee: 'Corner Store',
      category_id: groceriesId,
      note: null,
    });

    const response = await request(app).get('/api/budgets').query({ month: '2024-03' });
    const groceries = response.body.find((r: { category_name: string }) => r.category_name === 'Groceries');

    expect(groceries.limit_cents).toBe(1000);
    expect(groceries.amount_spent_cents).toBe(2500);
  });
});
