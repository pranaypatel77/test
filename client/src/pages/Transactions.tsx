import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createTransaction,
  fetchAccounts,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
} from '../api.js';
import CategoryMultiSelect from '../components/CategoryMultiSelect.js';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm.js';
import TransactionTable from '../components/TransactionTable.js';
import { formatCurrency } from '../format.js';
import type { Account, Category, Transaction } from '../types.js';

const SEARCH_DEBOUNCE_MS = 300;
const ALL_ACCOUNTS_PARAM = 'account';

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const q = searchParams.get('q') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const categoryIds = useMemo(
    () => parseCategoryIds(searchParams.get('categories')),
    [searchParams],
  );

  // `null` represents the "All Accounts" tab.
  const rawAccountParam = searchParams.get(ALL_ACCOUNTS_PARAM);
  const selectedAccountId =
    rawAccountParam && Number.isInteger(Number(rawAccountParam)) ? Number(rawAccountParam) : null;

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

  function handleSelectAccountTab(accountId: number | null) {
    updateParam(ALL_ACCOUNTS_PARAM, accountId === null ? '' : String(accountId));
  }

  const loadCategories = useCallback(async () => {
    try {
      const categoryList = await fetchCategories();
      setCategories(categoryList);
    } catch {
      setError('Failed to load transactions.');
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const accountList = await fetchAccounts();
      setAccounts(accountList);
    } catch {
      setError('Failed to load accounts.');
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const transactionList = await fetchTransactions({
        q: q || undefined,
        from: from || undefined,
        to: to || undefined,
        categoryIds,
        accountId: selectedAccountId ?? undefined,
      });
      setTransactions(transactionList);
      setError(null);
    } catch {
      setError('Failed to load transactions.');
    }
  }, [q, from, to, categoryIds, selectedAccountId]);

  useEffect(() => {
    // Fetches categories once on mount to populate the filter and form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    // Fetches accounts once on mount to populate the tabs, form, and table.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    // Reloads transactions whenever any active filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions();
  }, [loadTransactions]);

  async function handleSubmit(values: TransactionFormValues) {
    try {
      await createTransaction(values);
      await Promise.all([loadCategories(), loadAccounts(), loadTransactions()]);
    } catch {
      setError('Failed to create transaction.');
    }
  }

  async function handleUpdate(values: TransactionFormValues) {
    if (!editingTransaction) {
      return;
    }
    try {
      await updateTransaction(editingTransaction.id, values);
      setEditingTransaction(null);
      await Promise.all([loadCategories(), loadAccounts(), loadTransactions()]);
    } catch {
      setError('Failed to update transaction.');
    }
  }

  const totalCents = transactions.reduce((sum, transaction) => sum + transaction.amount_cents, 0);

  // The opening balance to accumulate the running balance from: a single
  // account's opening balance when a specific tab is selected, or the sum of
  // every account's opening balance for "All Accounts".
  const openingBalanceCents =
    selectedAccountId === null
      ? accounts.reduce((sum, account) => sum + account.opening_balance_cents, 0)
      : (accounts.find((account) => account.id === selectedAccountId)?.opening_balance_cents ?? 0);

  return (
    <section>
      <h2>Transactions</h2>
      {error ? <p role="alert">{error}</p> : null}
      <TransactionForm categories={categories} accounts={accounts} onSubmit={handleSubmit} />

      {editingTransaction ? (
        <div className="transaction-edit">
          <h3>Edit transaction</h3>
          <TransactionForm
            categories={categories}
            accounts={accounts}
            submitLabel="Save transaction"
            initialValues={{
              date: editingTransaction.date,
              amount_cents: editingTransaction.amount_cents,
              payee: editingTransaction.payee,
              category_id: editingTransaction.category_id,
              account_id: editingTransaction.account_id,
              note: editingTransaction.note,
            }}
            onSubmit={handleUpdate}
          />
          <button type="button" onClick={() => setEditingTransaction(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className="account-tabs" role="tablist" aria-label="Accounts">
        <button
          type="button"
          role="tab"
          aria-selected={selectedAccountId === null}
          className={selectedAccountId === null ? 'account-tab account-tab--active' : 'account-tab'}
          onClick={() => handleSelectAccountTab(null)}
        >
          All Accounts
        </button>
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            role="tab"
            aria-selected={selectedAccountId === account.id}
            className={
              selectedAccountId === account.id ? 'account-tab account-tab--active' : 'account-tab'
            }
            onClick={() => handleSelectAccountTab(account.id)}
          >
            {account.name}
          </button>
        ))}
      </div>

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

      <TransactionTable
        transactions={transactions}
        openingBalanceCents={openingBalanceCents}
        onEdit={setEditingTransaction}
      />
    </section>
  );
}
