import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createTransaction, fetchCategories, fetchTransactions } from '../api.js';
import CategoryMultiSelect from '../components/CategoryMultiSelect.js';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm.js';
import TransactionTable from '../components/TransactionTable.js';
import { formatCurrency } from '../format.js';
import type { Category, Transaction } from '../types.js';

const SEARCH_DEBOUNCE_MS = 300;

/** Parses a comma-separated list of category ids from the URL, ignoring invalid entries. */
function parseCategoryIds(raw: string | null): number[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id));
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const q = searchParams.get('q') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const categoryIds = useMemo(
    () => parseCategoryIds(searchParams.get('categories')),
    [searchParams],
  );

  // The search box is debounced locally before it is written to the URL, so
  // typing doesn't trigger a request (and a history entry) per keystroke.
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    // Keeps the input in sync when the URL changes from outside this
    // component (e.g. back/forward navigation).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput === q) {
      return;
    }
    const timeout = setTimeout(() => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (searchInput.trim()) {
            next.set('q', searchInput);
          } else {
            next.delete('q');
          }
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, q, setSearchParams]);

  function updateParam(key: string, value: string) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function handleCategoryIdsChange(ids: number[]) {
    updateParam('categories', ids.length > 0 ? ids.join(',') : '');
  }

  const loadCategories = useCallback(async () => {
    try {
      const categoryList = await fetchCategories();
      setCategories(categoryList);
    } catch {
      setError('Failed to load transactions.');
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const transactionList = await fetchTransactions({
        q: q || undefined,
        from: from || undefined,
        to: to || undefined,
        categoryIds,
      });
      setTransactions(transactionList);
      setError(null);
    } catch {
      setError('Failed to load transactions.');
    }
  }, [q, from, to, categoryIds]);

  useEffect(() => {
    // Fetches categories once on mount to populate the filter and form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    // Reloads transactions whenever any active filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions();
  }, [loadTransactions]);

  async function handleSubmit(values: TransactionFormValues) {
    try {
      await createTransaction(values);
      await Promise.all([loadCategories(), loadTransactions()]);
    } catch {
      setError('Failed to create transaction.');
    }
  }

  const totalCents = transactions.reduce((sum, transaction) => sum + transaction.amount_cents, 0);

  return (
    <section>
      <h2>Transactions</h2>
      {error ? <p role="alert">{error}</p> : null}
      <TransactionForm categories={categories} onSubmit={handleSubmit} />

      <div className="transactions-filters">
        <div>
          <label htmlFor="transactions-search">Search</label>
          <input
            id="transactions-search"
            type="text"
            placeholder="Search payee or note"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="transactions-from">From</label>
          <input
            id="transactions-from"
            type="date"
            value={from}
            onChange={(event) => updateParam('from', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="transactions-to">To</label>
          <input
            id="transactions-to"
            type="date"
            value={to}
            onChange={(event) => updateParam('to', event.target.value)}
          />
        </div>
        <CategoryMultiSelect
          categories={categories}
          value={categoryIds}
          onChange={handleCategoryIdsChange}
        />
      </div>

      <p className="transactions-total">
        Total: <strong>{formatCurrency(totalCents)}</strong>
      </p>

      <TransactionTable transactions={transactions} />
    </section>
  );
}
