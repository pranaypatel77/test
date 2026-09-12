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
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }),
    );

    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/summary?month=2024-03'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-03');
  });

  it('shows an empty state when the month has no transactions', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }),
    );

    render(<Dashboard />);

    expect(await screen.findByText(/no transactions for this month/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /spending by category/i })).not.toBeInTheDocument();
  });

  it('renders stat tiles and a category chart when the month has transactions', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        totalIncome: 300000,
        totalExpenses: 158000,
        net: 142000,
        categoryTotals: { Rent: 150000, Groceries: 8000 },
      }),
    );

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
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        totalIncome: 1000,
        totalExpenses: 5000,
        net: -4000,
        categoryTotals: { Groceries: 5000 },
      }),
    );

    render(<Dashboard />);

    const netValue = await findTileValue('Net');
    expect(netValue).toHaveTextContent('-$40.00');
    expect(netValue.closest('.stat-tile')).toHaveClass('stat-tile--negative');
  });

  it('fetches a new summary and updates tiles when navigating to the next month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 100000, totalExpenses: 25000, net: 75000, categoryTotals: {} }),
    );

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
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 100000, totalExpenses: 25000, net: 75000, categoryTotals: {} }),
    );

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
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleCategories));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 0, totalExpenses: 0, net: 0, categoryTotals: {} }),
    );

    render(<Dashboard />);
    await screen.findByText(/no transactions for this month/i);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalIncome: 7500, totalExpenses: 1500, net: 6000, categoryTotals: {} }),
    );

    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2024-06' } });

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/summary?month=2024-06'));
    expect(await findTileValue('Income')).toHaveTextContent('$75.00');
  });
});
