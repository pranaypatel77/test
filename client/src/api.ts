import type { Category, Summary, Transaction } from './types.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface TransactionInput {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  note: string | null;
}

/** Fetches all categories from the API. */
export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch('/api/categories');
  if (!response.ok) {
    throw new Error('Failed to load categories.');
  }
  return response.json() as Promise<Category[]>;
}

/** Fetches all transactions from the API. */
export async function fetchTransactions(): Promise<Transaction[]> {
  const response = await fetch('/api/transactions');
  if (!response.ok) {
    throw new Error('Failed to load transactions.');
  }
  return response.json() as Promise<Transaction[]>;
}

/** Fetches the monthly income/expense summary for the given `yyyy-mm` month. */
export async function fetchSummary(month: string): Promise<Summary> {
  const response = await fetch(`/api/summary?month=${encodeURIComponent(month)}`);
  if (!response.ok) {
    throw new Error('Failed to load summary.');
  }
  return response.json() as Promise<Summary>;
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
