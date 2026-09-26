import type Database from 'better-sqlite3';

export type Cadence = 'weekly' | 'monthly' | 'annual';

export interface RecurringTransactionRow {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
}

export interface RecurringSeries {
  payee: string;
  category_id: number | null;
  average_amount_cents: number;
  cadence: Cadence;
  last_seen_date: string;
  next_expected_date: string;
  transaction_ids: number[];
  confidence: number;
}

const CADENCE_BUCKETS: { cadence: Cadence; target: number; tolerance: number }[] = [
  { cadence: 'weekly', target: 7, tolerance: 2 },
  { cadence: 'monthly', target: 30, tolerance: 5 },
  { cadence: 'annual', target: 365, tolerance: 10 },
];

const MIN_OCCURRENCES = 3;

/**
 * Normalizes a payee name for grouping: lowercases, trims, collapses
 * whitespace, and strips trailing store codes/punctuation (e.g. trailing
 * numbers, `#1234`, or punctuation such as `-`, `*`, `#`).
 */
export function normalizePayee(payee: string): string {
  let normalized = payee.toLowerCase().trim().replace(/\s+/g, ' ');
  // Strip trailing store codes/punctuation, e.g. "Netflix #1234", "Amazon.com*AB1",
  // "Shell Gas 00123", "Costco Whse-1234".
  normalized = normalized.replace(/[\s#*_-]*\d+$/g, '').trim();
  normalized = normalized.replace(/[\s#*_.,-]+$/g, '').trim();
  return normalized;
}

/** Returns the number of whole days between two `yyyy-mm-dd` date strings. */
function daysBetween(a: string, b: string): number {
  const aDate = new Date(`${a}T00:00:00Z`);
  const bDate = new Date(`${b}T00:00:00Z`);
  return Math.round((bDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24));
}

/** Adds `days` to a `yyyy-mm-dd` date string and returns a new `yyyy-mm-dd` string. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns true if `amount` is within ±10% or ±$2 (200 cents) of `reference`, whichever is larger. */
function amountsMatch(reference: number, amount: number): boolean {
  const diff = Math.abs(reference - amount);
  const tolerance = Math.max(Math.abs(reference) * 0.1, 200);
  return diff <= tolerance;
}

/** Finds the cadence bucket that matches the given interval in days, if any. */
function matchCadence(intervalDays: number): Cadence | null {
  for (const bucket of CADENCE_BUCKETS) {
    if (Math.abs(intervalDays - bucket.target) <= bucket.tolerance) {
      return bucket.cadence;
    }
  }
  return null;
}

/**
 * Detects recurring transaction series from a flat list of transactions.
 * Groups by normalized payee, then looks for runs of transactions with
 * similar amounts and a consistent cadence (weekly/monthly/annual).
 */
export function detectRecurringSeries(transactions: RecurringTransactionRow[]): RecurringSeries[] {
  const groups = new Map<string, RecurringTransactionRow[]>();

  for (const transaction of transactions) {
    const key = normalizePayee(transaction.payee);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const series: RecurringSeries[] = [];

  for (const [, group] of groups) {
    group.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

    // Try each cadence bucket independently, building runs of consistent
    // amount + interval transactions within that cadence.
    for (const bucket of CADENCE_BUCKETS) {
      let run: RecurringTransactionRow[] = [];

      const flush = () => {
        if (run.length >= MIN_OCCURRENCES) {
          series.push(buildSeries(run, bucket.cadence));
        }
        run = [];
      };

      for (const transaction of group) {
        if (run.length === 0) {
          run.push(transaction);
          continue;
        }

        const previous = run[run.length - 1];
        const intervalDays = daysBetween(previous.date, transaction.date);
        const cadence = matchCadence(intervalDays);
        const referenceAmount = run.reduce((sum, t) => sum + t.amount_cents, 0) / run.length;

        if (cadence === bucket.cadence && amountsMatch(referenceAmount, transaction.amount_cents)) {
          run.push(transaction);
        } else {
          flush();
          run.push(transaction);
        }
      }

      flush();
    }
  }

  return series;
}

/** Builds a `RecurringSeries` summary from a confirmed run of transactions. */
function buildSeries(run: RecurringTransactionRow[], cadence: Cadence): RecurringSeries {
  const averageAmount = Math.round(run.reduce((sum, t) => sum + t.amount_cents, 0) / run.length);
  const lastSeen = run[run.length - 1];
  const cadenceDays = CADENCE_BUCKETS.find((b) => b.cadence === cadence)!.target;
  const nextExpectedDate = addDays(lastSeen.date, cadenceDays);

  // Confidence blends occurrence count (more occurrences => more confident,
  // saturating around 8 occurrences) with interval/amount consistency.
  const intervals: number[] = [];
  for (let i = 1; i < run.length; i += 1) {
    intervals.push(daysBetween(run[i - 1].date, run[i].date));
  }
  const cadenceTarget = CADENCE_BUCKETS.find((b) => b.cadence === cadence)!.target;
  const intervalDeviations = intervals.map((interval) => Math.abs(interval - cadenceTarget) / cadenceTarget);
  const averageDeviation =
    intervalDeviations.length > 0
      ? intervalDeviations.reduce((sum, d) => sum + d, 0) / intervalDeviations.length
      : 0;
  const consistencyScore = Math.max(0, 1 - averageDeviation * 2);
  const occurrenceScore = Math.min(1, run.length / 8);
  const confidence = Math.round((0.5 * consistencyScore + 0.5 * occurrenceScore) * 100) / 100;

  // category_id: use the most common category among the run, preferring the
  // most recent transaction's category as tiebreaker.
  const categoryCounts = new Map<number | null, number>();
  for (const t of run) {
    categoryCounts.set(t.category_id, (categoryCounts.get(t.category_id) ?? 0) + 1);
  }
  let bestCategory: number | null = lastSeen.category_id;
  let bestCount = -1;
  for (const t of run) {
    const count = categoryCounts.get(t.category_id) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestCategory = t.category_id;
    }
  }

  return {
    payee: run[run.length - 1].payee,
    category_id: bestCategory,
    average_amount_cents: averageAmount,
    cadence,
    last_seen_date: lastSeen.date,
    next_expected_date: nextExpectedDate,
    transaction_ids: run.map((t) => t.id),
    confidence,
  };
}

/**
 * Computes detected recurring series at query time from the transactions
 * table, excluding any series whose normalized payee + cadence has been
 * dismissed.
 */
export function computeRecurringSeries(db: Database.Database): RecurringSeries[] {
  const rows = db
    .prepare(`SELECT id, date, amount_cents, payee, category_id FROM transactions ORDER BY date ASC, id ASC`)
    .all() as RecurringTransactionRow[];

  const detected = detectRecurringSeries(rows);

  const dismissedRows = db.prepare(`SELECT normalized_payee, cadence FROM dismissed_series`).all() as {
    normalized_payee: string;
    cadence: string;
  }[];
  const dismissed = new Set(dismissedRows.map((row) => `${row.normalized_payee}::${row.cadence}`));

  return detected.filter((series) => {
    const key = `${normalizePayee(series.payee)}::${series.cadence}`;
    return !dismissed.has(key);
  });
}
