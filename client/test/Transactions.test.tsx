import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Transactions from '../src/pages/Transactions.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const sampleCategories = [{ id: 3, name: 'Dining', color: '#9c27b0', kind: 'expense' }];

/**
 * Queues the two fetch responses issued on mount: the page loads categories
 * and transactions concurrently, so both must be mocked before rendering.
 */
function mockInitialLoad(fetchMock: ReturnType<typeof vi.fn>, transactions: unknown) {
  fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
  fetchMock.mockResolvedValueOnce(jsonResponse(transactions));
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
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, []);

    render(<Transactions />);

    expect(
      await screen.findByText(/no transactions yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders fetched transactions sorted newest first with formatted, color-coded amounts', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, sampleTransactions);

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
    mockInitialLoad(fetchMock, []);

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
    // The page reloads categories and transactions after a successful create.
    mockInitialLoad(fetchMock, [created]);

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

});
