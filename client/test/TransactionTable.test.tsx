import { render, screen, within } from '@testing-library/react';
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
    account_id: 1,
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
    account_id: 1,
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
    expect(screen.getAllByText('$2,000.00')).not.toHaveLength(0);
  });

  describe('running balance', () => {
    it('renders a "Balance" column header', () => {
      render(<TransactionTable transactions={transactions} openingBalanceCents={0} />);

      expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument();
    });

    it('accumulates the running balance in ascending date order starting from the opening balance', () => {
      // Ascending date order: 2024-03-10 (Employer, +200000) then
      // 2024-03-15 (Coffee Shop, -1500). Starting from an opening balance of
      // 10000: 10000 + 200000 = 210000, then 210000 - 1500 = 208500.
      render(<TransactionTable transactions={transactions} openingBalanceCents={10000} />);

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row').slice(1);

      const employerRow = rows.find((row) => within(row).queryByText('Employer'));
      const coffeeRow = rows.find((row) => within(row).queryByText('Coffee Shop'));

      expect(employerRow && within(employerRow).getByText('$2,100.00')).toBeInTheDocument();
      expect(coffeeRow && within(coffeeRow).getByText('$2,085.00')).toBeInTheDocument();
    });

    it('defaults the opening balance to zero when none is given', () => {
      render(<TransactionTable transactions={transactions} />);

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row').slice(1);
      const coffeeRow = rows.find((row) => within(row).queryByText('Coffee Shop'));

      // 0 + 200000 - 1500 = 198500.
      expect(coffeeRow && within(coffeeRow).getByText('$1,985.00')).toBeInTheDocument();
    });

    it('resets the running balance to the new opening balance when re-rendered for a different account', () => {
      const singleAccountTransactions: Transaction[] = [
        {
          id: 3,
          date: '2024-04-01',
          amount_cents: -500,
          payee: 'Checking Purchase',
          category_id: null,
          category_name: null,
          category_color: null,
          account_id: 2,
          note: null,
          created_at: '2024-04-01T00:00:00.000Z',
        },
      ];

      const { rerender } = render(
        <TransactionTable transactions={transactions} openingBalanceCents={10000} />,
      );

      // Switching to a single-account tab re-renders with that account's own
      // transactions and its own opening_balance_cents, which should reset
      // the running balance rather than continuing from the prior view.
      rerender(
        <TransactionTable transactions={singleAccountTransactions} openingBalanceCents={5000} />,
      );

      const table = screen.getByRole('table');
      // 5000 - 500 = 4500.
      expect(within(table).getByText('$45.00')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('renders an Edit button per row and invokes the callback with the transaction', () => {
      let clicked: Transaction | null = null;
      render(
        <TransactionTable
          transactions={transactions}
          onEdit={(transaction) => {
            clicked = transaction;
          }}
        />,
      );

      const buttons = screen.getAllByRole('button', { name: 'Edit' });
      expect(buttons).toHaveLength(2);

      buttons[0].click();
      expect(clicked).not.toBeNull();
    });
  });
});
