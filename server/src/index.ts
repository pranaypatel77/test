import { createApp } from './app.js';
import { DB_PATH } from './db.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Allows tooling (e.g. the e2e test runner) to point the server at a
// temporary, disposable database instead of the tracked `server/data`
// file.
const dbPath = process.env.LEDGER_DB_PATH ?? DB_PATH;

const app = createApp(dbPath);

app.listen(PORT, () => {
  console.log(`Ledger server listening on http://localhost:${PORT}`);
});
