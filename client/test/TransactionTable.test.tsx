import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TransactionTable from '../src/components/TransactionTable.js';
import type { Transaction } from '../src/types.js';

const transactions: Transaction[] = [
  {
    id: 1,
    date: '2024-03-15',
    amount_cents: -1500,
    payee: 'Coffee Shop',
    category_id: 4,
    category_name: 'Dining',
    category_color: '#9c27b0',
    note: 'Morning latte',
    created_at: '2024-03-15T00:00:00.000Z',
  },
  {
    id: 2,
    date: '2024-03-10',
    amount_cents: 200000,
    payee: 'Employer',
    category_id: null,
    category_name: null,
    category_color: null,
    note: null,
    created_at: '2024-03-10T00:00:00.000Z',
  },
];

describe('TransactionTable', () => {
  it('renders a "No transactions yet" message when empty', () => {
    render(<TransactionTable transactions={[]} />);

    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('renders a category chip with the category name and background color', () => {
    render(<TransactionTable transactions={transactions} />);

    const chip = screen.getByText('Dining');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle({ backgroundColor: '#9c27b0' });
  });

  it('renders no chip for transactions without a category', () => {
    render(<TransactionTable transactions={transactions} />);

    expect(screen.getByText('Employer')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('renders payee and formatted amount for each row', () => {
    render(<TransactionTable transactions={transactions} />);

    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('-$15.00')).toBeInTheDocument();
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });
});
