# Ledger

A personal expense tracker. Built on causal.stream.

## Features (v1.0.0)

- **Transactions** — a Transactions API and page for recording income and
  expenses, with inline edit and delete directly in the table.
- **Categories** — a categories system with colored chips, so every
  transaction is easy to scan and group at a glance.
- **Dashboard** — a monthly summary dashboard with an SVG spending chart
  showing where money went that month.
- **Budgets** — a budgets table and UI with per-category progress bars that
  show spend against limit.
- **Theming** — light/dark theming with a persistent toggle, plus automatic
  detection of the OS-level color scheme preference on first load.
- **End-to-end coverage** — a Playwright smoke test that exercises the full
  create-transaction → set-budget → dashboard journey.

Not in this release: CSV transaction import is planned for a future 1.1
release and is not available in 1.0.0.

## Monorepo structure

This is an npm-workspaces monorepo with two packages:

```
.
├── server/   Express + TypeScript API backed by an in-file SQLite database
│   ├── src/          application source (app.ts, db.ts, index.ts)
│   ├── test/          vitest tests
│   └── data/          SQLite database file (created on first boot, gitignored)
└── client/   React + TypeScript app (Vite)
    ├── src/          components, pages, app shell
    └── test/          vitest + Testing Library tests
```

The server listens on port `4000` and exposes `GET /api/health`. The client
dev server (Vite) proxies any request to `/api/*` to
`http://localhost:4000/api/*`, so the browser can call the API with relative
URLs during development.

## Requirements

- Node.js 20+
- npm 8+

## Install

Install dependencies for both packages from the repository root:

```
npm install
```

## Develop

Start the server (port 4000) and the client Vite dev server together:

```
npm run dev
```

## Build

Build both packages (server TypeScript compilation + client production
bundle):

```
npm run build
```

## Test

Run the vitest suite for both packages:

```
npm run test
```

## Lint

Run ESLint for both packages:

```
npm run lint
```

## End-to-end tests

A Playwright smoke test at the repo root exercises the full user journey:
create a transaction, verify it shows up on the Transactions page, set a
budget limit for its category on the Budgets page, and confirm the Dashboard
shows the updated expense total and a colored category bar.

Run it locally with:

```
npx playwright install chromium   # one-time browser download
npm run e2e
```

`npm run e2e` (`scripts/e2e-runner.mjs`) takes care of everything without any
manual steps:

1. Creates a temporary SQLite database in the OS temp directory.
2. Starts the API server on port `4000` against that temporary database.
3. Starts the Vite client dev server on port `5173`.
4. Runs the Playwright spec in `e2e/` against Chromium only.
5. Shuts down both dev servers and deletes the temporary database, whether
   the test passed or failed, so the repository is left clean.

The e2e spec runs Chromium only and should complete in well under 30 seconds.

### CI

`.github/workflows/e2e.yml` runs lint, the vitest unit tests, and the
Playwright e2e suite, in that order, failing the build if any step fails. It
is triggered by pushes and pull requests targeting `main` and `builder/**`
branches.

## Notes

- On first boot, the server creates `server/data/ledger.db` (and the
  `server/data` directory) if it does not already exist.
- Each script above can also be run for a single package with npm's
  workspace flag, e.g. `npm run dev -w server` or `npm run test -w client`.

## Release

See [CHANGELOG.md](./CHANGELOG.md) for the full history of shipped changes.

After this release commit merges to `main`, a maintainer still needs to:

1. Cut and push the `v1.0.0` git tag from the merge commit.
2. Capture the three UI screenshots (Transactions, Dashboard, Budgets) and
   add them to the README/docs.

These two steps are intentionally not automated as part of this change.
