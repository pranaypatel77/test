import { useCallback, useEffect, useState } from 'react';
import {
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
} from '../api.js';
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
      const created = await createTransaction(values);
      setTransactions((prev) => [created, ...prev]);
      setError(null);
    } catch {
      setError('Failed to create transaction.');
    }
  }

  async function handleUpdate(id: number, values: TransactionFormValues) {
    try {
      const updated = await updateTransaction(id, values);
      setTransactions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setError(null);
    } catch {
      setError('Failed to update transaction.');
    }
  }

  async function handleDelete(transaction: Transaction) {
    const confirmed = window.confirm(
      `Delete the transaction "${transaction.payee}" on ${transaction.date}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteTransaction(transaction.id);
      setTransactions((prev) => prev.filter((item) => item.id !== transaction.id));
      setError(null);
    } catch {
      // Leave the row in place on network failure so the user can retry.
    }
  }

  return (
    <section>
      <h2>Transactions</h2>
      {error ? <p role="alert">{error}</p> : null}
      <TransactionForm categories={categories} onSubmit={handleSubmit} />
      <TransactionTable
        transactions={transactions}
        categories={categories}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </section>
  );
}
