import cors from 'cors';
import express, { type Express } from 'express';
import { createDatabase, DB_PATH } from './db.js';

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

  return app;
}
