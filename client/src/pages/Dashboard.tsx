import { useCallback, useEffect, useState } from 'react';
import { fetchTransactions } from '../api.js';
import SpendingChart from '../components/SpendingChart.js';
import type { Transaction } from '../types.js';

function formatAmount(amountCents: number): string {
  return (amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    try {
      const transactionList = await fetchTransactions();
      setTransactions(transactionList);
      setError(null);
    } catch {
      setError('Failed to load dashboard data.');
    }
  }, []);

  useEffect(() => {
    // Fetches transactions on mount so the summary and chart reflect current data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions();
  }, [loadTransactions]);

  const income = transactions
    .filter((transaction) => transaction.amount_cents > 0)
    .reduce((sum, transaction) => sum + transaction.amount_cents, 0);
  const expenses = transactions
    .filter((transaction) => transaction.amount_cents < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount_cents), 0);
  const net = income - expenses;

  return (
    <section>
      <h2>Dashboard</h2>
      {error ? <p role="alert">{error}</p> : null}
      <dl className="dashboard-summary">
        <div>
          <dt>Income</dt>
          <dd className="transactions-amount transactions-amount--income">{formatAmount(income)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd className="transactions-amount transactions-amount--expense">{formatAmount(expenses)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd
            className={`transactions-amount ${
              net >= 0 ? 'transactions-amount--income' : 'transactions-amount--expense'
            }`}
          >
            {formatAmount(net)}
          </dd>
        </div>
      </dl>
      <h3>Spending by category</h3>
      <SpendingChart transactions={transactions} />
    </section>
  );
}
