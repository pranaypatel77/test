import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const sampleTransactions = [
  {
    id: 1,
    date: '2024-06-01',
    amount_cents: 200000,
    payee: 'Employer',
    category_id: null,
    category_name: null,
    category_color: null,
    note: null,
    created_at: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 2,
    date: '2024-06-02',
    amount_cents: -1500,
    payee: 'Coffee Shop',
    category_id: 3,
    category_name: 'Dining',
    category_color: '#4caf50',
    note: null,
    created_at: '2024-06-02T10:00:00.000Z',
  },
];

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('summarizes income, expenses, and net, and renders a spending chart', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(sampleTransactions));

    render(<Dashboard />);

    expect(await screen.findByText('$2,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('$15.00')).toHaveLength(2);
    expect(screen.getByText('$1,985.00')).toBeInTheDocument();

    const chart = screen.getByRole('img', { name: /spending by category/i });
    expect(chart).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
  });

  it('shows an empty-state message when there is no spending', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse([]));

    render(<Dashboard />);

    expect(await screen.findByText(/no spending recorded yet/i)).toBeInTheDocument();
  });
});
