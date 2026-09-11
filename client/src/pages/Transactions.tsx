import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  createTransaction,
  fetchCategories,
  fetchTransactions,
  importTransactionsCsv,
  type ImportResult,
} from '../api.js';
import TransactionForm, { type TransactionFormValues } from '../components/TransactionForm.js';
import TransactionTable from '../components/TransactionTable.js';
import type { Category, Transaction } from '../types.js';

export default function Transactions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file again later.
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const result = await importTransactionsCsv(file);
      setImportResult(result);
      setError(null);
      await loadAll();
    } catch {
      setError('Failed to import transactions.');
    }
  }

  return (
    <section>
      <h2>Transactions</h2>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={handleImportFile}
          style={{ display: 'none' }}
        />
      </div>
      {importResult ? (
        <div role="status" className="import-result">
          <p>
            {`Imported ${importResult.imported} transaction${importResult.imported === 1 ? '' : 's'}` +
              (importResult.skipped.length > 0
                ? `, skipped ${importResult.skipped.length}.`
                : '.')}
          </p>
          {importResult.skipped.length > 0 ? (
            <ul>
              {importResult.skipped.map((skippedRow) => (
                <li key={skippedRow.line}>{`Line ${skippedRow.line}: ${skippedRow.reason}`}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <TransactionForm categories={categories} onSubmit={handleSubmit} />
      <TransactionTable transactions={transactions} />
    </section>
  );
}
