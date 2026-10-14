import { useState } from 'react';
import { importTransactionsCsv, type ImportResult } from '../api.js';
import { parseTransactionsCsv } from '../csvImport.js';

interface ImportDialogProps {
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

/** Reads a `File` as text, used instead of `File.prototype.text()` for broader test-environment compatibility. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Lets the user pick a CSV file, previews it with `parseTransactionsCsv`
 * (row count and per-line errors), then posts the raw CSV text to
 * `/api/transactions/import` and shows the inserted/skipped result.
 */
export default function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [fileText, setFileText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof parseTransactionsCsv> | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);
    setError(null);
    if (!file) {
      setFileText(null);
      setPreview(null);
      return;
    }
    const text = await readFileAsText(file);
    setFileText(text);
    setPreview(parseTransactionsCsv(text));
  }

  async function handleImport() {
    if (fileText === null) {
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const importResult = await importTransactionsCsv(fileText);
      setResult(importResult);
      await onImported();
    } catch {
      setError('Failed to import transactions.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="import-dialog-overlay" role="presentation">
      <div className="import-dialog" role="dialog" aria-modal="true" aria-label="Import transactions">
        <h3>Import transactions</h3>

        <label htmlFor="import-file">CSV file</label>
        <input id="import-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />

        {error ? <p role="alert">{error}</p> : null}

        {preview ? (
          <div className="import-dialog-preview">
            <p>
              {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} ready to import
            </p>
            {preview.errors.length > 0 ? (
              <ul className="import-dialog-errors">
                {preview.errors.map((rowError) => (
                  <li key={`${rowError.line}-${rowError.message}`}>
                    Line {rowError.line}: {rowError.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <p className="import-dialog-result">
            Imported {result.inserted} transaction{result.inserted === 1 ? '' : 's'}, skipped{' '}
            {result.skipped}.
          </p>
        ) : null}

        <div className="import-dialog-actions">
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!fileText || importing}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
