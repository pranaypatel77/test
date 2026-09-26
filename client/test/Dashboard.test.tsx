import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const sampleCategories = [
  { id: 1, name: 'Groceries', color: '#4caf50', kind: 'expense' },
  { id: 2, name: 'Rent', color: '#f44336', kind: 'expense' },
  { id: 3, name: 'Salary', color: '#009688', kind: 'income' },
];

const sampleAccounts = [
  { id: 1, name: 'Cash', kind: 'cash', opening_balance_cents: 0 },
  { id: 2, name: 'Checking', kind: 'checking', opening_balance_cents: 10000 },
];

/**
 * Queues the three fetch responses issued on mount: the page loads
 * categories, accounts, and the summary concurrently, so all three must be
 * mocked before rendering.
 */
function mockInitialLoad(fetchMock: ReturnType<typeof vi.fn>, summary: unknown, recurring: unknown[] = []) {
  fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
  fetchMock.mockResolvedValueOnce(jsonResponse(sampleAccounts));
  fetchMock.mockResolvedValueOnce(jsonResponse(summary));
  fetchMock.mockResolvedValueOnce(jsonResponse(recurring));
}

/** Finds a stat tile by its label ("Income", "Expenses", or "Net") and returns its value text. */
async function findTileValue(label: string): Promise<HTMLElement> {
  const labelElement = await screen.findByText(label);
  const tile = labelElement.closest('.stat-tile') as HTMLElement;
  return within(tile).getByText((_, element) => element?.className === 'stat-tile-value');
}

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults the month picker to the current month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} });

    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/summary?month=2024-03'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-03');
  });

  it('shows an empty state when the month has no transactions', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} });

    render(<Dashboard />);

    expect(await screen.findByText(/no transactions for this month/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /spending by category/i })).not.toBeInTheDocument();
  });

  it('renders stat tiles and a category chart when the month has transactions', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, {
      totalIncome: 300000,
      totalExpenses: 158000,
      net: 142000,
      categoryTotals: { Rent: 150000, Groceries: 8000 },
    });

    render(<Dashboard />);

    expect(await findTileValue('Income')).toHaveTextContent('$3,000.00');
    expect(await findTileValue('Expenses')).toHaveTextContent('$1,580.00');
    const netValue = await findTileValue('Net');
    expect(netValue).toHaveTextContent('$1,420.00');
    expect(netValue.closest('.stat-tile')).toHaveClass('stat-tile--positive');

    const chart = screen.getByRole('img', { name: /spending by category/i });
    expect(chart).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();

    const rentBar = chart.querySelector('[data-testid="category-bar-Rent"] rect');
    const groceriesBar = chart.querySelector('[data-testid="category-bar-Groceries"] rect');
    expect(rentBar).toHaveAttribute('fill', '#f44336');
    expect(groceriesBar).toHaveAttribute('fill', '#4caf50');
    expect(Number(rentBar?.getAttribute('width'))).toBeGreaterThan(
      Number(groceriesBar?.getAttribute('width')),
    );
  });

  it('shows a negative net balance styled as negative', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, {
      totalIncome: 1000,
      totalExpenses: 5000,
      net: -4000,
      categoryTotals: { Groceries: 5000 },
    });

    render(<Dashboard />);

    const netValue = await findTileValue('Net');
    expect(netValue).toHaveTextContent('-$40.00');
    expect(netValue.closest('.stat-tile')).toHaveClass('stat-tile--negative');
  });

  it('fetches a new summary and updates tiles when navigating to the next month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 100000, totalExpenses: 25000, net: 75000, categoryTotals: {} });

    render(<Dashboard />);

    expect(await findTileValue('Income')).toHaveTextContent('$1,000.00');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        totalIncome: 0,
        totalExpenses: 2000,
        net: -2000,
        categoryTotals: { Groceries: 2000 },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/summary?month=2024-04'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-04');
    expect(await findTileValue('Expenses')).toHaveTextContent('$20.00');
    expect(await findTileValue('Income')).toHaveTextContent('$0.00');
  });

  it('fetches a new summary and updates tiles when navigating to the previous month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 100000, totalExpenses: 25000, net: 75000, categoryTotals: {} });

    render(<Dashboard />);

    expect(await findTileValue('Income')).toHaveTextContent('$1,000.00');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 50000, totalExpenses: 10000, net: 40000, categoryTotals: {} }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/summary?month=2024-02'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-02');
    expect(await findTileValue('Income')).toHaveTextContent('$500.00');
  });

  it('fetches a new summary when the month input changes directly', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} });

    render(<Dashboard />);
    await screen.findByText(/no transactions for this month/i);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 7500, totalExpenses: 1500, net: 6000, categoryTotals: {} }),
    );

    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2024-06' } });

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/summary?month=2024-06'));
    expect(await findTileValue('Income')).toHaveTextContent('$75.00');
  });

  it('displays an account selector populated from the accounts API', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} });

    render(<Dashboard />);
    await screen.findByText(/no transactions for this month/i);

    const select = screen.getByLabelText('Account');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cash' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Checking' })).toBeInTheDocument();
  });

  it('re-fetches the summary scoped to the selected account', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 100000, totalExpenses: 25000, net: 75000, categoryTotals: {} });

    render(<Dashboard />);
    expect(await findTileValue('Income')).toHaveTextContent('$1,000.00');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 20000, totalExpenses: 5000, net: 15000, categoryTotals: {} }),
    );

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '2' } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/summary?month=2024-03&account_id=2'),
    );
    expect(await findTileValue('Income')).toHaveTextContent('$200.00');
  });

  it('shows an empty state in the Recurring section when none are detected', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }, []);

    render(<Dashboard />);

    const recurringSection = (await screen.findByText('Recurring')).closest('section') as HTMLElement;
    expect(within(recurringSection).getByText(/no recurring transactions detected/i)).toBeInTheDocument();
  });

  it('lists detected recurring series with payee, cadence, amount, and next expected date', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }, [
      {
        payee: 'Netflix',
        category_id: null,
        average_amount_cents: -1599,
        cadence: 'monthly',
        last_seen_date: '2024-03-05',
        next_expected_date: '2024-04-05',
        transaction_ids: [1, 2, 3],
        confidence: 0.9,
      },
    ]);

    render(<Dashboard />);

    const recurringSection = (await screen.findByText('Recurring')).closest('section') as HTMLElement;
    expect(within(recurringSection).getByText('Netflix')).toBeInTheDocument();
    expect(within(recurringSection).getByText('Monthly')).toBeInTheDocument();
    expect(within(recurringSection).getByText('-$15.99')).toBeInTheDocument();
    expect(within(recurringSection).getByText(/2024-04-05/)).toBeInTheDocument();
    expect(within(recurringSection).getByRole('button', { name: 'Not recurring' })).toBeInTheDocument();
  });

  it('dismisses a recurring series and removes it from the list', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockInitialLoad(fetchMock, { totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }, [
      {
        payee: 'Spotify',
        category_id: null,
        average_amount_cents: -999,
        cadence: 'monthly',
        last_seen_date: '2024-03-05',
        next_expected_date: '2024-04-05',
        transaction_ids: [1, 2, 3],
        confidence: 0.9,
      },
    ]);

    render(<Dashboard />);

    const recurringSection = (await screen.findByText('Recurring')).closest('section') as HTMLElement;
    expect(within(recurringSection).getByText('Spotify')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse(undefined, 204));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    fireEvent.click(within(recurringSection).getByRole('button', { name: 'Not recurring' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/recurring/dismiss',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ payee: 'Spotify', cadence: 'monthly' }),
        }),
      ),
    );

    await waitFor(() =>
      expect(within(recurringSection).getByText(/no recurring transactions detected/i)).toBeInTheDocument(),
    );
  });
});
