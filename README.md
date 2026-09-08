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

- Node.js 18+
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

## Notes

- On first boot, the server creates `server/data/ledger.db` (and the
  `server/data` directory) if it does not already exist.
- Each script above can also be run for a single package with npm's
  workspace flag, e.g. `npm run dev -w server` or `npm run test -w client`.
