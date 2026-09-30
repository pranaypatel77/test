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

async function createMonthlySeries(
  app: import('express').Express,
  payee: string,
  amountCents: number,
  months: number,
): Promise<void> {
  const dates = ['2024-01-05', '2024-02-05', '2024-03-05', '2024-04-05', '2024-05-05'].slice(0, months);
  for (const date of dates) {
    await request(app).post('/api/transactions').send({
      date,
      amount_cents: amountCents,
      payee,
      category_id: null,
      note: null,
    });
  }
}

describe('GET /api/recurring', () => {
  it('returns an empty array when there are no transactions', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/recurring');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('detects a monthly recurring series computed at query time', async () => {
    const app = createApp(tempDbPath());
    await createMonthlySeries(app, 'Netflix', -1599, 4);

    const response = await request(app).get('/api/recurring');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const [series] = response.body;
    expect(series.payee.toLowerCase()).toBe('netflix');
    expect(series.cadence).toBe('monthly');
    expect(series.average_amount_cents).toBe(-1599);
    expect(series.last_seen_date).toBe('2024-04-05');
    expect(series.next_expected_date).toBe('2024-05-05');
    expect(series.transaction_ids).toHaveLength(4);
    expect(series.confidence).toBeGreaterThan(0);
    expect(series).toHaveProperty('category_id');
  });

  it('excludes dismissed series from subsequent requests', async () => {
    const app = createApp(tempDbPath());
    await createMonthlySeries(app, 'Spotify', -999, 4);

    const before = await request(app).get('/api/recurring');
    expect(before.body).toHaveLength(1);

    const dismissResponse = await request(app)
      .post('/api/recurring/dismiss')
      .send({ payee: 'Spotify', cadence: 'monthly' });
    expect(dismissResponse.status).toBe(204);

    const after = await request(app).get('/api/recurring');
    expect(after.body).toEqual([]);
  });

  it('returns 400 when dismissing with an invalid cadence', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app)
      .post('/api/recurring/dismiss')
      .send({ payee: 'Spotify', cadence: 'daily' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when dismissing without a payee', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).post('/api/recurring/dismiss').send({ cadence: 'monthly' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('does not detect a series with fewer than 3 occurrences', async () => {
    const app = createApp(tempDbPath());
    await createMonthlySeries(app, 'Two Timer', -2000, 2);

    const response = await request(app).get('/api/recurring');

    expect(response.body).toEqual([]);
  });
});
