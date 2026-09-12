import type { Category, Transaction } from './types.js';

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
