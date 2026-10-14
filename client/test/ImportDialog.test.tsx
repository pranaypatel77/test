import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportDialog from '../src/components/ImportDialog.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function csvFile(text: string, name = 'transactions.csv') {
  return new File([text], name, { type: 'text/csv' });
}

describe('ImportDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a parsed preview with row count and errors before importing', async () => {
    const onClose = vi.fn();
    const onImported = vi.fn();
    render(<ImportDialog onClose={onClose} onImported={onImported} />);

    const csv = [
      'date,amount,description,category',
      '2024-03-01,12.50,Coffee,Dining',
      'not-a-date,10.00,Lunch,Dining',
    ].join('\n');

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [csvFile(csv)] },
    });

    expect(await screen.findByText('1 row ready to import')).toBeInTheDocument();
    expect(screen.getByText('Line 3: Invalid date "not-a-date"')).toBeInTheDocument();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the CSV to /api/transactions/import and shows the inserted/skipped result', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ inserted: 1, skipped: 1, errors: [] }));

    const onClose = vi.fn();
    const onImported = vi.fn();
    render(<ImportDialog onClose={onClose} onImported={onImported} />);

    const csv = [
      'date,amount,description,category',
      '2024-03-01,12.50,Coffee,Dining',
    ].join('\n');

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [csvFile(csv)] },
    });
    await screen.findByText('1 row ready to import');

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText('Imported 1 transaction, skipped 1.')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions/import',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      }),
    );

    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });
});
