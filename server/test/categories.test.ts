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

const SEED_NAMES = ['Groceries', 'Rent', 'Utilities', 'Dining', 'Transport', 'Salary'];

describe('/api/categories', () => {
  describe('GET /api/categories', () => {
    it('returns the seeded categories on first boot', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(6);
      expect(response.body.map((c: { name: string }) => c.name).sort()).toEqual(
        [...SEED_NAMES].sort(),
      );

      for (const category of response.body) {
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('color');
        expect(category).toHaveProperty('kind');
      }

      const salary = response.body.find((c: { name: string }) => c.name === 'Salary');
      expect(salary.kind).toBe('income');

      const groceries = response.body.find((c: { name: string }) => c.name === 'Groceries');
      expect(groceries.kind).toBe('expense');
    });
  });

  describe('POST /api/categories', () => {
    it('creates a new category and returns 201 with the created record', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Entertainment', color: '#123abc', kind: 'expense' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Entertainment',
        color: '#123abc',
        kind: 'expense',
      });
      expect(typeof response.body.id).toBe('number');
    });

    it('returns 400 when name is missing', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/categories')
        .send({ color: '#123abc', kind: 'expense' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when color is not a hex string', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Entertainment', color: 'blue', kind: 'expense' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when kind is not expense or income', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Entertainment', color: '#123abc', kind: 'other' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 409 when the name already exists', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Groceries', color: '#123abc', kind: 'expense' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('updates the name and returns 200 with the updated record', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const groceries = categories.body.find((c: { name: string }) => c.name === 'Groceries');

      const response = await request(app)
        .put(`/api/categories/${groceries.id}`)
        .send({ name: 'Grocery Store' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: groceries.id,
        name: 'Grocery Store',
        color: groceries.color,
        kind: groceries.kind,
      });
    });

    it('updates the color and returns 200 with the updated record', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const rent = categories.body.find((c: { name: string }) => c.name === 'Rent');

      const response = await request(app)
        .put(`/api/categories/${rent.id}`)
        .send({ color: '#000000' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: rent.id, name: 'Rent', color: '#000000' });
    });

    it('returns 404 if the category does not exist', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).put('/api/categories/999').send({ name: 'New Name' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when color is invalid', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const rent = categories.body.find((c: { name: string }) => c.name === 'Rent');

      const response = await request(app)
        .put(`/api/categories/${rent.id}`)
        .send({ color: 'not-a-color' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 409 when renaming to an existing category name', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const rent = categories.body.find((c: { name: string }) => c.name === 'Rent');

      const response = await request(app)
        .put(`/api/categories/${rent.id}`)
        .send({ name: 'Groceries' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('deletes an unreferenced category and returns 204', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const transport = categories.body.find((c: { name: string }) => c.name === 'Transport');

      const response = await request(app).delete(`/api/categories/${transport.id}`);

      expect(response.status).toBe(204);

      const listResponse = await request(app).get('/api/categories');
      expect(listResponse.body.find((c: { name: string }) => c.name === 'Transport')).toBeUndefined();
    });

    it('returns 409 when a transaction references the category', async () => {
      const app = createApp(tempDbPath());
      const categories = await request(app).get('/api/categories');
      const groceries = categories.body.find((c: { name: string }) => c.name === 'Groceries');

      await request(app).post('/api/transactions').send({
        date: '2024-03-15',
        amount_cents: -1500,
        payee: 'Corner Store',
        category_id: groceries.id,
        note: null,
      });

      const response = await request(app).delete(`/api/categories/${groceries.id}`);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');

      const listResponse = await request(app).get('/api/categories');
      expect(listResponse.body.find((c: { name: string }) => c.name === 'Groceries')).toBeDefined();
    });

    it('returns 404 if the category does not exist', async () => {
      const app = createApp(tempDbPath());

      const response = await request(app).delete('/api/categories/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
