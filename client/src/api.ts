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

export interface ImportSkippedRow {
  line: number;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: ImportSkippedRow[];
}

/**
 * Reads a File's contents as text. Uses `FileReader` rather than the
 * `File#text()` method for broader compatibility across environments.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/** Uploads a CSV file to bulk-import transactions. */
export async function importTransactionsCsv(file: File): Promise<ImportResult> {
  const csvText = await readFileAsText(file);
  const response = await fetch('/api/transactions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  if (!response.ok) {
    throw new Error('Failed to import transactions.');
  }
  return response.json() as Promise<ImportResult>;
}
