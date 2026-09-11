import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Budgets from '../src/pages/Budgets.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const sampleBudgets = [
  {
    category_id: 1,
    category_name: 'Groceries',
    category_color: '#4caf50',
    month: '2024-03',
    limit_cents: 20000,
    amount_spent_cents: 15000,
  },
  {
    category_id: 2,
    category_name: 'Rent',
    category_color: '#f44336',
    month: '2024-03',
    limit_cents: 150000,
    amount_spent_cents: 150000,
  },
  {
    category_id: 3,
    category_name: 'Dining',
    category_color: '#9c27b0',
    month: '2024-03',
    limit_cents: 5000,
    amount_spent_cents: 6000,
  },
  {
    category_id: 4,
    category_name: 'Transport',
    category_color: '#2196f3',
    month: '2024-03',
    limit_cents: null,
    amount_spent_cents: 0,
  },
];

function findRow(name: string): HTMLElement {
  const cell = screen.getByText(name);
  return cell.closest('tr') as HTMLElement;
}

describe('Budgets page', () => {
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

  it('defaults the month picker to the current month and requests that month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/budgets?month=2024-03'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-03');
  });

  it('renders each category with its limit, spent amount, and a progress bar', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);

    await screen.findByText('Groceries');

    const groceriesRow = findRow('Groceries');
    expect((within(groceriesRow).getByLabelText('Groceries limit') as HTMLInputElement).value).toBe(
      '200.00',
    );
    expect(within(groceriesRow).getByText('$150.00')).toBeInTheDocument();

    const transportRow = findRow('Transport');
    expect((within(transportRow).getByLabelText('Transport limit') as HTMLInputElement).value).toBe('');
    expect(within(transportRow).getByText('$0.00')).toBeInTheDocument();
  });

  it('shows a green progress bar when spending is at or below 80% of the limit', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);
    await screen.findByText('Groceries');

    const bar = screen.getByTestId('budget-progress-1');
    expect(bar).toHaveClass('budget-progress-bar--green');
  });

  it('shows an amber progress bar when spending is between 80% and 100% of the limit', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          category_id: 5,
          category_name: 'Utilities',
          category_color: '#ff9800',
          month: '2024-03',
          limit_cents: 10000,
          amount_spent_cents: 8500,
        },
      ]),
    );

    render(<Budgets />);
    await screen.findByText('Utilities');

    const bar = screen.getByTestId('budget-progress-5');
    expect(bar).toHaveClass('budget-progress-bar--amber');
  });

  it('shows a red progress bar when spending exceeds the limit', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);
    await screen.findByText('Dining');

    const bar = screen.getByTestId('budget-progress-3');
    expect(bar).toHaveClass('budget-progress-bar--red');

    const rentBar = screen.getByTestId('budget-progress-2');
    expect(rentBar).toHaveClass('budget-progress-bar--amber');
  });

  it('saves a new limit via PUT when the input is blurred and updates the display', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);
    await screen.findByText('Transport');

    const transportRow = findRow('Transport');
    const input = within(transportRow).getByLabelText('Transport limit');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        category_id: 4,
        category_name: 'Transport',
        category_color: '#2196f3',
        month: '2024-03',
        limit_cents: 10000,
        amount_spent_cents: 0,
      }),
    );

    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/budgets/4?month=2024-03',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ limit_cents: 10000 }),
        }),
      ),
    );

    const bar = await screen.findByTestId('budget-progress-4');
    expect(bar).toHaveClass('budget-progress-bar--green');
  });

  it('fetches a new month of budgets when navigating to the next month', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleBudgets));

    render(<Budgets />);
    await screen.findByText('Groceries');

    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          category_id: 1,
          category_name: 'Groceries',
          category_color: '#4caf50',
          month: '2024-04',
          limit_cents: null,
          amount_spent_cents: 0,
        },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/budgets?month=2024-04'));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe('2024-04');
  });
});
