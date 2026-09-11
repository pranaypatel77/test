import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Transactions from '../src/pages/Transactions.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const sampleTransactions = [
  {
    id: 2,
    date: '2024-06-01',
    amount_cents: -1500,
    payee: 'Coffee Shop',
    category_id: 3,
    note: 'Morning latte',
    created_at: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 1,
    date: '2024-01-15',
    amount_cents: 200000,
    payee: 'Employer',
    category_id: null,
    note: null,
    created_at: '2024-01-15T10:00:00.000Z',
  },
];

describe('Transactions page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows an empty state when the API returns no transactions', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse([]));

    render(<Transactions />);

    expect(
      await screen.findByText(/no transactions yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders fetched transactions sorted newest first with formatted, color-coded amounts', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // The page loads categories and transactions in parallel on mount.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleTransactions));

    render(<Transactions />);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1); // drop header row
    expect(rows).toHaveLength(2);

    // Newest date first.
    expect(within(rows[0]).getByText('2024-06-01')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Coffee Shop')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2024-01-15')).toBeInTheDocument();

    const expenseCell = within(rows[0]).getByText('-$15.00');
    expect(expenseCell).toHaveClass('transactions-amount--expense');

    const incomeCell = within(rows[1]).getByText('$2,000.00');
    expect(incomeCell).toHaveClass('transactions-amount--income');

    expect(within(rows[1]).getByText('Uncategorized')).toBeInTheDocument();
  });

  it('submits the add-transaction form and prepends the created row', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // Initial parallel load: categories, then transactions.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    render(<Transactions />);
    await screen.findByText(/no transactions yet/i);

    const created = {
      id: 5,
      date: '2024-07-04',
      amount_cents: 4599,
      payee: 'Bookstore',
      category_id: null,
      note: 'New novel',
      created_at: '2024-07-04T00:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(created, 201));
    // Reload after create: categories, then transactions.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([created]));

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-07-04' } });
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Bookstore' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '45.99' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'New novel' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    await screen.findByText('Bookstore');

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/transactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          date: '2024-07-04',
          amount_cents: 4599,
          payee: 'Bookstore',
          category_id: null,
          note: 'New novel',
        }),
      }),
    );

    expect(screen.getByText('$45.99')).toHaveClass('transactions-amount--income');
    // Form resets after a successful submit.
    expect((screen.getByLabelText('Payee') as HTMLInputElement).value).toBe('');
  });

  it('edits a transaction inline via PUT and updates the row', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleTransactions[0]]));

    render(<Transactions />);
    await screen.findByText('Coffee Shop');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const editForm = screen.getByRole('form', { name: /edit transaction/i });
    const payeeInput = within(editForm).getByLabelText('Payee');
    fireEvent.change(payeeInput, { target: { value: 'Coffee Shop Downtown' } });

    const updated = { ...sampleTransactions[0], payee: 'Coffee Shop Downtown' };
    fetchMock.mockResolvedValueOnce(jsonResponse(updated));

    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));

    await screen.findByText('Coffee Shop Downtown');

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/transactions/2',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(screen.queryByRole('form', { name: /edit transaction/i })).not.toBeInTheDocument();
  });

  it('cancels an inline edit without calling the API', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleTransactions[0]]));

    render(<Transactions />);
    await screen.findByText('Coffee Shop');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('form', { name: /edit transaction/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: /edit transaction/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deletes a transaction after confirmation', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleTransactions[0]]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<Transactions />);
    await screen.findByText('Coffee Shop');

    fetchMock.mockResolvedValueOnce(jsonResponse(null, 204));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Coffee Shop')).not.toBeInTheDocument());

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/transactions/2', { method: 'DELETE' });
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it('keeps the row when the delete confirmation is dismissed', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleTransactions[0]]));
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<Transactions />);
    await screen.findByText('Coffee Shop');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
  });

  it('imports a CSV file, shows the result banner, and refreshes the table', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // Initial parallel load: categories, then transactions.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    render(<Transactions />);
    await screen.findByText(/no transactions yet/i);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        imported: 1,
        skipped: [{ line: 3, reason: 'Invalid amount "oops".' }],
      }),
    );
    // Reload after import: categories, then transactions.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleTransactions[0]]));

    const file = new File(
      ['date,amount,payee,note\n2024-06-01,15.00,Coffee Shop,Morning latte\n2024-06-02,oops,Bad Row,Note'],
      'transactions.csv',
      { type: 'text/csv' },
    );

    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });

    await screen.findByText(/imported 1 transaction, skipped 1\./i);
    expect(screen.getByText(/line 3: invalid amount "oops"\./i)).toBeInTheDocument();
    await screen.findByText('Coffee Shop');

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/transactions/import',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
  });

  it('shows an error and does not refresh when the import request fails', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // Initial parallel load: categories, then transactions.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    render(<Transactions />);
    await screen.findByText(/no transactions yet/i);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));

    const file = new File(['date,amount,payee,note'], 'transactions.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });

    expect(await screen.findByText('Failed to import transactions.')).toBeInTheDocument();
    // Two initial load calls plus the failed import call; no reload happens.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
