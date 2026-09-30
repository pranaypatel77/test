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

describe('/api/accounts', () => {
  describe('GET /api/accounts', () => {
    it('returns the default "Cash" account created by migration', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).get('/api/accounts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        name: 'Cash',
        kind: 'cash',
        opening_balance_cents: 0,
      });
    });

    it('returns all accounts including newly created ones', async () => {
      const app = createApp(tempDbPath());

      await request(app)
        .post('/api/accounts')
        .send({ name: 'Checking', kind: 'checking', opening_balance_cents: 10000 });

      const response = await request(app).get('/api/accounts');

      expect(response.status).toBe(200);
      expect(response.body.map((a: { name: string }) => a.name).sort()).toEqual([
        'Cash',
        'Checking',
      ]);
    });
  });

  describe('POST /api/accounts', () => {
    it('creates a new account and returns 201 with the created record', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/accounts')
        .send({ name: 'Credit Card', kind: 'credit', opening_balance_cents: -5000 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Credit Card',
        kind: 'credit',
        opening_balance_cents: -5000,
      });
      expect(typeof response.body.id).toBe('number');
    });

    it('defaults opening_balance_cents to 0 when omitted', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/accounts')
        .send({ name: 'Savings', kind: 'checking' });

      expect(response.status).toBe(201);
      expect(response.body.opening_balance_cents).toBe(0);
    });

    it('returns 400 when kind is invalid', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/accounts')
        .send({ name: 'Mystery', kind: 'crypto' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when name is missing', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).post('/api/accounts').send({ kind: 'cash' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 409 when an account with that name already exists', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).post('/api/accounts').send({ name: 'Cash', kind: 'cash' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });
  });
});

describe('transaction filtering by account', () => {
  it('assigns new transactions to the default account when account_id is omitted', async () => {
    const app = createApp(tempDbPath());
    const accounts = await request(app).get('/api/accounts');
    const cashId = accounts.body[0].id;

    const response = await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Coffee Shop',
      category_id: null,
      note: null,
    });

    expect(response.status).toBe(201);
    expect(response.body.account_id).toBe(cashId);
  });

  it('persists the given account_id on create and update', async () => {
    const app = createApp(tempDbPath());
    const checking = await request(app)
      .post('/api/accounts')
      .send({ name: 'Checking', kind: 'checking', opening_balance_cents: 0 });

    const created = await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Coffee Shop',
      category_id: null,
      account_id: checking.body.id,
      note: null,
    });

    expect(created.status).toBe(201);
    expect(created.body.account_id).toBe(checking.body.id);

    const cash = await request(app).get('/api/accounts');
    const cashId = cash.body.find((a: { name: string }) => a.name === 'Cash').id;

    const updated = await request(app)
      .put(`/api/transactions/${created.body.id}`)
      .send({
        date: '2024-03-15',
        amount_cents: -1500,
        payee: 'Coffee Shop',
        category_id: null,
        account_id: cashId,
        note: null,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.account_id).toBe(cashId);
  });

  it('filters transactions by account_id', async () => {
    const app = createApp(tempDbPath());
    const checking = await request(app)
      .post('/api/accounts')
      .send({ name: 'Checking', kind: 'checking' });
    const cash = await request(app).get('/api/accounts');
    const cashId = cash.body.find((a: { name: string }) => a.name === 'Cash').id;

    await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Checking Purchase',
      account_id: checking.body.id,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-16',
      amount_cents: -1000,
      payee: 'Cash Purchase',
      account_id: cashId,
    });

    const response = await request(app)
      .get('/api/transactions')
      .query({ account_id: checking.body.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].payee).toBe('Checking Purchase');
  });

  it('filters the monthly summary by account_id', async () => {
    const app = createApp(tempDbPath());
    const checking = await request(app)
      .post('/api/accounts')
      .send({ name: 'Checking', kind: 'checking' });
    const cash = await request(app).get('/api/accounts');
    const cashId = cash.body.find((a: { name: string }) => a.name === 'Cash').id;

    await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Checking Purchase',
      account_id: checking.body.id,
    });
    await request(app).post('/api/transactions').send({
      date: '2024-03-16',
      amount_cents: -1000,
      payee: 'Cash Purchase',
      account_id: cashId,
    });

    const response = await request(app)
      .get('/api/summary')
      .query({ month: '2024-03', account_id: checking.body.id });

    expect(response.status).toBe(200);
    expect(response.body.totalExpenses).toBe(1500);
  });

  it('rejects POST /api/transactions with an account_id that does not exist', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Ghost',
      account_id: 999,
    });

    // Without the existence check the REFERENCES constraint raises a
    // SqliteError, which Express renders as a 500 HTML page containing a stack
    // trace — a client mistake reported as a server fault.
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('account_id must reference an existing account.');
  });

  it('rejects PUT /api/transactions/:id with an account_id that does not exist', async () => {
    const app = createApp(tempDbPath());
    const created = await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Corner Store',
    });

    const response = await request(app).put(`/api/transactions/${created.body.id}`).send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Corner Store',
      account_id: 999,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('account_id must reference an existing account.');
  });

  it('still accepts a valid account_id on both POST and PUT', async () => {
    const app = createApp(tempDbPath());
    const checking = await request(app)
      .post('/api/accounts')
      .send({ name: 'Checking', kind: 'checking' });

    const created = await request(app).post('/api/transactions').send({
      date: '2024-03-15',
      amount_cents: -1500,
      payee: 'Corner Store',
      account_id: checking.body.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.account_id).toBe(checking.body.id);

    const updated = await request(app).put(`/api/transactions/${created.body.id}`).send({
      date: '2024-03-16',
      amount_cents: -1600,
      payee: 'Corner Store',
      account_id: checking.body.id,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.account_id).toBe(checking.body.id);
  });
});
