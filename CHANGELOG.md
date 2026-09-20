# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-20

First stable release of Ledger, a personal expense tracker.

### Added

- Transactions API and page, with inline edit and delete of individual transactions.
- Categories system with colored chips for at-a-glance categorization.
- Monthly summary dashboard with an SVG spending chart.
- Budgets table and UI with per-category progress bars.
- Light/dark theming with a persistent toggle and system-preference detection.
- Playwright end-to-end smoke test covering the create-transaction → set-budget → dashboard journey.

### Planned

- CSV transaction import is deferred to a future 1.1 release; it is not part of 1.0.0.
