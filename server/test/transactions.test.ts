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

const validTransaction = {
  date: '2024-03-15',
  amount_cents: -1500,
  payee: 'Coffee Shop',
  category_id: 2,
  note: 'Morning latte',
};

describe('/api/transactions', () => {
  describe('GET /api/transactions', () => {
    it('returns all transactions sorted by date descending', async () => {
      const app = createApp(tempDbPath());

      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-01-01', payee: 'Oldest' });
      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-06-01', payee: 'Newest' });
      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-03-01', payee: 'Middle' });

      const response = await request(app).get('/api/transactions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      expect(response.body.map((t: { payee: string }) => t.payee)).toEqual([
        'Newest',
        'Middle',
        'Oldest',
      ]);

      const [first] = response.body;
      expect(first).toMatchObject({
        date: '2024-06-01',
        amount_cents: -1500,
        payee: 'Newest',
        category_id: 2,
        note: 'Morning latte',
      });
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('created_at');
    });

    it('returns an empty array when there are no transactions', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).get('/api/transactions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('filters by from and to date range', async () => {
      const app = createApp(tempDbPath());

      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-01-01', payee: 'Too Early' });
      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-03-10', payee: 'In Range' });
      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-12-31', payee: 'Too Late' });

      const response = await request(app)
        .get('/api/transactions')
        .query({ from: '2024-02-01', to: '2024-06-01' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].payee).toBe('In Range');
    });

    it('includes joined category name and color for each transaction', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const groceries = categories.body.find((c: { name: string }) => c.name === 'Groceries');

      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, category_id: groceries.id, payee: 'Corner Store' });

      const response = await request(app).get('/api/transactions');

      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({
        category_id: groceries.id,
        category_name: groceries.name,
        category_color: groceries.color,
      });
    });

    it('filters by category_id', async () => {
      const app = createApp(tempDbPath());

      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, category_id: 1, payee: 'Category One' });
      await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, category_id: 2, payee: 'Category Two' });

      const response = await request(app).get('/api/transactions').query({ category_id: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].payee).toBe('Category Two');
    });
  });

  describe('POST /api/transactions', () => {
    it('creates a new transaction and returns 201 with the created record', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).post('/api/transactions').send(validTransaction);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(validTransaction);
      expect(typeof response.body.id).toBe('number');
      expect(typeof response.body.created_at).toBe('string');
    });

    it('includes the joined category name and color', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const rent = categories.body.find((c: { name: string }) => c.name === 'Rent');

      const response = await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, category_id: rent.id });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        category_id: rent.id,
        category_name: rent.name,
        category_color: rent.color,
      });
    });

    it('returns null category name and color when category_id is null', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).post('/api/transactions').send({
        date: '2024-03-15',
        amount_cents: 500,
        payee: 'No Category',
      });

      expect(response.status).toBe(201);
      expect(response.body.category_name).toBeNull();
      expect(response.body.category_color).toBeNull();
    });

    it('returns 400 with a JSON error body when date is not yyyy-mm-dd', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '03/15/2024' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when date does not represent a real calendar date', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, date: '2024-02-30' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 with a JSON error body when amount_cents is not an integer', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/transactions')
        .send({ ...validTransaction, amount_cents: 15.5 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('allows category_id and note to be omitted', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).post('/api/transactions').send({
        date: '2024-03-15',
        amount_cents: 500,
        payee: 'No Category',
      });

      expect(response.status).toBe(201);
      expect(response.body.category_id).toBeNull();
      expect(response.body.note).toBeNull();
    });
  });

  describe('PUT /api/transactions/:id', () => {
    it('updates the transaction and returns the updated record', async () => {
      const app = createApp(tempDbPath());
      const created = await request(app).post('/api/transactions').send(validTransaction);

      const response = await request(app)
        .put(`/api/transactions/${created.body.id}`)
        .send({ ...validTransaction, payee: 'Updated Payee', amount_cents: -2000 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        payee: 'Updated Payee',
        amount_cents: -2000,
      });
    });

    it('includes the joined category name and color after an update', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const utilities = categories.body.find((c: { name: string }) => c.name === 'Utilities');
      const created = await request(app).post('/api/transactions').send(validTransaction);

      const response = await request(app)
        .put(`/api/transactions/${created.body.id}`)
        .send({ ...validTransaction, category_id: utilities.id });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        category_id: utilities.id,
        category_name: utilities.name,
        category_color: utilities.color,
      });
    });

    it('returns 404 if the transaction does not exist', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).put('/api/transactions/999').send(validTransaction);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when the update payload is invalid', async () => {
      const app = createApp(tempDbPath());
      const created = await request(app).post('/api/transactions').send(validTransaction);

      const response = await request(app)
        .put(`/api/transactions/${created.body.id}`)
        .send({ ...validTransaction, amount_cents: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    it('removes the transaction and returns 204', async () => {
      const app = createApp(tempDbPath());
      const created = await request(app).post('/api/transactions').send(validTransaction);

      const response = await request(app).delete(`/api/transactions/${created.body.id}`);

      expect(response.status).toBe(204);

      const listResponse = await request(app).get('/api/transactions');
      expect(listResponse.body).toEqual([]);
    });

    it('returns 404 if the transaction does not exist', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).delete('/api/transactions/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
