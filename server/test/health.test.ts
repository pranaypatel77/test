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

describe('GET /api/health', () => {
  it('responds with { ok: true }', async () => {
    const app = createApp(tempDbPath());

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('creates the sqlite database file on first boot', () => {
    const dbPath = tempDbPath();
    expect(fs.existsSync(dbPath)).toBe(false);

    createApp(dbPath);

    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
