import type { Account, AccountKind, BudgetStatus, Category, Summary, Transaction } from './types.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface TransactionInput {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  account_id: number | null;
  note: string | null;
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  opening_balance_cents?: number;
}

/** Fetches all categories from the API. */
export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch('/api/categories');
  if (!response.ok) {
    throw new Error('Failed to load categories.');
  }
  return response.json() as Promise<Category[]>;
}

/** Fetches all accounts from the API. */
export async function fetchAccounts(): Promise<Account[]> {
  const response = await fetch('/api/accounts');
  if (!response.ok) {
    throw new Error('Failed to load accounts.');
  }
  return response.json() as Promise<Account[]>;
}

/** Creates a new account. */
export async function createAccount(input: AccountInput): Promise<Account> {
  const response = await fetch('/api/accounts', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create account.');
  }
  return response.json() as Promise<Account>;
}

export interface TransactionFilters {
  q?: string;
  categoryIds?: number[];
  accountId?: number;
  from?: string;
  to?: string;
}

/**
 * Fetches transactions from the API, optionally narrowed by a search term,
 * one or more category ids, and/or an inclusive date range.
 */
export async function fetchTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.from) {
    params.set('from', filters.from);
  }
  if (filters.to) {
    params.set('to', filters.to);
  }
  for (const categoryId of filters.categoryIds ?? []) {
    params.append('category_id', String(categoryId));
  }
  if (filters.accountId !== undefined) {
    params.set('account_id', String(filters.accountId));
  }

  const query = params.toString();
  const response = await fetch(`/api/transactions${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('Failed to load transactions.');
  }
  return response.json() as Promise<Transaction[]>;
}

/**
 * Fetches the monthly income/expense summary for the given `yyyy-mm` month,
 * optionally scoped to a single account.
 */
export async function fetchSummary(month: string, accountId?: number): Promise<Summary> {
  const params = new URLSearchParams({ month });
  if (accountId !== undefined) {
    params.set('account_id', String(accountId));
  }
  const response = await fetch(`/api/summary?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to load summary.');
  }
  return response.json() as Promise<Summary>;
}

/** Fetches the budget status (limit and amount spent) for every expense category for the given `yyyy-mm` month. */
export async function fetchBudgets(month: string): Promise<BudgetStatus[]> {
  const response = await fetch(`/api/budgets?month=${encodeURIComponent(month)}`);
  if (!response.ok) {
    throw new Error('Failed to load budgets.');
  }
  return response.json() as Promise<BudgetStatus[]>;
}

/** Upserts the spending limit for a category in the given `yyyy-mm` month. */
export async function updateBudget(
  categoryId: number,
  month: string,
  limitCents: number,
): Promise<BudgetStatus> {
  const response = await fetch(`/api/budgets/${categoryId}?month=${encodeURIComponent(month)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ limit_cents: limitCents }),
  });
  if (!response.ok) {
    throw new Error('Failed to update budget.');
  }
  return response.json() as Promise<BudgetStatus>;
}

/** Creates a new transaction. */
export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const response = await fetch('/api/transactions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create transaction.');
  }
  return response.json() as Promise<Transaction>;
}

/** Updates an existing transaction. */
export async function updateTransaction(id: number, input: TransactionInput): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to update transaction.');
  }
  return response.json() as Promise<Transaction>;
}
