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

describe('POST /api/transactions/import', () => {
  it('inserts every valid row and reports counts', async () => {
    const app = createApp(tempDbPath());

    const csv = [
      'date,amount,description,category',
      '2024-03-15,-15.00,Coffee Shop,Dining',
      '2024-03-16,2500.50,Paycheck,Salary',
      '2024-03-17,-42.10,New Vendor,Widgets',
    ].join('\n');

    const response = await request(app)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ inserted: 3, skipped: 0, errors: [] });

    const transactionsResponse = await request(app).get('/api/transactions');
    expect(transactionsResponse.body).toHaveLength(3);
    const payees = transactionsResponse.body.map((t: { payee: string }) => t.payee);
    expect(payees).toEqual(expect.arrayContaining(['Coffee Shop', 'Paycheck', 'New Vendor']));

    // Unknown category name creates the category.
    const categoriesResponse = await request(app).get('/api/categories');
    expect(
      categoriesResponse.body.some((c: { name: string }) => c.name === 'Widgets'),
    ).toBe(true);
  });

  it('skips malformed rows and reports them by line number without failing the whole import', async () => {
    const app = createApp(tempDbPath());

    const csv = [
      'date,amount,description,category',
      '2024-03-15,-15.00,Coffee Shop,Dining',
      'not-a-date,-10.00,Bad Row,Dining',
      '2024-03-17,not-a-number,Another Bad Row,Dining',
      '2024-03-18,-5.00,,Dining',
      '2024-03-19,-20.00,Valid Row,Dining',
    ].join('\n');

    const response = await request(app)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(response.status).toBe(200);
    expect(response.body.inserted).toBe(2);
    expect(response.body.skipped).toBe(3);
    expect(response.body.errors).toHaveLength(3);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ line: 3 }),
      expect.objectContaining({ line: 4 }),
      expect.objectContaining({ line: 5 }),
    ]);

    const transactionsResponse = await request(app).get('/api/transactions');
    expect(transactionsResponse.body).toHaveLength(2);
  });

  it('responds 400 and inserts nothing when the header is missing or wrong', async () => {
    const app = createApp(tempDbPath());

    const csv = [
      'date,amount,notes,category',
      '2024-03-15,-15.00,Coffee Shop,Dining',
    ].join('\n');

    const response = await request(app)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(response.status).toBe(400);

    const transactionsResponse = await request(app).get('/api/transactions');
    expect(transactionsResponse.body).toHaveLength(0);
  });
});
