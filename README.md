# Ledger

A personal expense tracker. Built on causal.stream.

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
- npm 10+

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

`ci/github-workflows/e2e.yml` runs lint, the vitest unit tests, and the
Playwright e2e suite, in that order, on every push, failing the build if any
step fails. It currently lives outside `.github/workflows/` because the
automation that authored it isn't permitted to write there; a maintainer
needs to move it into place once, e.g.:

```
git mv ci/github-workflows/e2e.yml .github/workflows/e2e.yml
```

## Notes

- On first boot, the server creates `server/data/ledger.db` (and the
  `server/data` directory) if it does not already exist.
- Each script above can also be run for a single package with npm's
  workspace flag, e.g. `npm run dev -w server` or `npm run test -w client`.
