import { useCallback, useEffect, useState } from 'react';
import { createTransaction, fetchCategories, fetchTransactions } from '../api.js';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm.js';
import TransactionTable from '../components/TransactionTable.js';
import type { Category, Transaction } from '../types.js';

export default function Transactions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [categoryList, transactionList] = await Promise.all([
        fetchCategories(),
        fetchTransactions(),
      ]);
      setCategories(categoryList);
      setTransactions(transactionList);
      setError(null);
    } catch {
      setError('Failed to load transactions.');
    }
  }, []);

  useEffect(() => {
    // Fetches categories and transactions from the server on mount to
    // synchronize local state with external API data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  async function handleSubmit(values: TransactionFormValues) {
    try {
      await createTransaction(values);
      await loadAll();
    } catch {
      setError('Failed to create transaction.');
    }
  }

  return (
    <section>
      <h2>Transactions</h2>
      {error ? <p role="alert">{error}</p> : null}
      <TransactionForm categories={categories} onSubmit={handleSubmit} />
      <TransactionTable transactions={transactions} />
    </section>
  );
}
