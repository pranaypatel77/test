import { useCallback, useEffect, useState } from 'react';
import CategoryBarChart from '../components/CategoryBarChart.js';
import { fetchCategories, fetchSummary } from '../api.js';
import { formatCurrency } from '../format.js';
import type { Category, Summary } from '../types.js';

/** Returns the current calendar month as a `yyyy-mm` string. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns the `yyyy-mm` month that is `delta` months away from `month`. */
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Renders a human-friendly label for a `yyyy-mm` month, e.g. `March 2024`. */
function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (targetMonth: string) => {
    try {
      const data = await fetchSummary(targetMonth);
      setSummary(data);
      setError(null);
    } catch {
      setError('Failed to load summary.');
    }
  }, []);

  useEffect(() => {
    void fetchCategories()
      .then(setCategories)
      .catch(() => setError('Failed to load categories.'));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary(month);
  }, [month, loadSummary]);

  const categoryColors = Object.fromEntries(categories.map((category) => [category.name, category.color]));
  const hasTransactions = summary !== null && (summary.totalIncome !== 0 || summary.totalExpenses !== 0);

  return (
    <section>
      <h2>Dashboard</h2>
      <div className="month-nav">
        <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => shiftMonth(current, -1))}>
          &lt;
        </button>
        <label>
          Month
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
              }
            }}
          />
        </label>
        <button type="button" aria-label="Next month" onClick={() => setMonth((current) => shiftMonth(current, 1))}>
          &gt;
        </button>
        <span>{formatMonthLabel(month)}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}

      {summary && hasTransactions ? (
        <>
          <div className="stat-tiles">
            <div className="stat-tile stat-tile--neutral">
              <span className="stat-tile-label">Income</span>
              <span className="stat-tile-value">{formatCurrency(summary.totalIncome)}</span>
            </div>
            <div className="stat-tile stat-tile--expense">
              <span className="stat-tile-label">Expenses</span>
              <span className="stat-tile-value">{formatCurrency(summary.totalExpenses)}</span>
            </div>
            <div className={`stat-tile ${summary.net >= 0 ? 'stat-tile--positive' : 'stat-tile--negative'}`}>
              <span className="stat-tile-label">Net</span>
              <span className="stat-tile-value">{formatCurrency(summary.net)}</span>
            </div>
          </div>
          <CategoryBarChart categoryTotals={summary.categoryTotals} categoryColors={categoryColors} />
        </>
      ) : summary ? (
        <p>No transactions for this month.</p>
      ) : null}
    </section>
  );
}
