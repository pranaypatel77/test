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

/**
 * Builds the JSON-serializable request body for a create/update request,
 * omitting `category_id` entirely when no category is selected so the
 * server falls back to its default of `null`.
 */
function buildTransactionBody(input: TransactionInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: input.date,
    amount_cents: input.amount_cents,
    payee: input.payee,
    note: input.note,
  };
  if (input.category_id !== null) {
    body.category_id = input.category_id;
  }
  return body;
}

/** Creates a new transaction. */
export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const response = await fetch('/api/transactions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(buildTransactionBody(input)),
  });
  if (!response.ok) {
    throw new Error('Failed to create transaction.');
  }
  return response.json() as Promise<Transaction>;
}

/** Updates an existing transaction. */
export async function updateTransaction(
  id: number,
  input: TransactionInput,
): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(buildTransactionBody(input)),
  });
  if (!response.ok) {
    throw new Error('Failed to update transaction.');
  }
  return response.json() as Promise<Transaction>;
}

/** Deletes a transaction. */
export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Failed to delete transaction.');
  }
}
