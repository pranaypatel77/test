import { useCallback, useEffect, useState } from 'react';
import AccountSelect from '../components/AccountSelect.js';
import CategoryBarChart from '../components/CategoryBarChart.js';
import MonthPicker from '../components/MonthPicker.js';
import { fetchAccounts, fetchCategories, fetchSummary } from '../api.js';
import { currentMonth } from '../dateUtils.js';
import { formatCurrency } from '../format.js';
import type { Account, Category, Summary } from '../types.js';

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (targetMonth: string, targetAccountId: number | null) => {
    try {
      const data = await fetchSummary(targetMonth, targetAccountId ?? undefined);
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
    void fetchAccounts()
      .then(setAccounts)
      .catch(() => setError('Failed to load accounts.'));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary(month, accountId);
  }, [month, accountId, loadSummary]);

  const categoryColors = Object.fromEntries(categories.map((category) => [category.name, category.color]));
  const hasTransactions = summary !== null && (summary.totalIncome !== 0 || summary.totalExpenses !== 0);

  return (
    <section>
      <h2>Dashboard</h2>
      <MonthPicker month={month} onChange={setMonth} />

      <div>
        <label htmlFor="dashboard-account">Account</label>
        <AccountSelect
          id="dashboard-account"
          accounts={accounts}
          value={accountId}
          onChange={setAccountId}
          allLabel="All Accounts"
        />
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
