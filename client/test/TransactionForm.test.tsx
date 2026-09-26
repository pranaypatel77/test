import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TransactionForm from '../src/components/TransactionForm.js';
import type { Account, Category } from '../src/types.js';

const categories: Category[] = [
  { id: 1, name: 'Groceries', color: '#4caf50', kind: 'expense' },
  { id: 2, name: 'Rent', color: '#f44336', kind: 'expense' },
];

const accounts: Account[] = [
  { id: 10, name: 'Cash', kind: 'cash', opening_balance_cents: 0 },
  { id: 20, name: 'Checking', kind: 'checking', opening_balance_cents: 10000 },
];

describe('TransactionForm', () => {
  it('includes a category select populated with the given categories', () => {
    render(<TransactionForm categories={categories} onSubmit={() => {}} />);

    const select = screen.getByLabelText('Category');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rent' })).toBeInTheDocument();
  });

  it('includes an account select populated from the given accounts', () => {
    render(<TransactionForm categories={categories} accounts={accounts} onSubmit={() => {}} />);

    const select = screen.getByLabelText('Account');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cash' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Checking' })).toBeInTheDocument();
  });

  it('defaults the selected account to the first account once accounts load', () => {
    render(<TransactionForm categories={categories} accounts={accounts} onSubmit={() => {}} />);

    expect((screen.getByLabelText('Account') as HTMLSelectElement).value).toBe('10');
  });

  it('submits the entered values including the selected category and account ids', () => {
    const handleSubmit = vi.fn();
    render(<TransactionForm categories={categories} accounts={accounts} onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } });
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Corner Store' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Snacks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(handleSubmit).toHaveBeenCalledWith({
      date: '2024-03-15',
      amount_cents: 1250,
      payee: 'Corner Store',
      category_id: 1,
      account_id: 20,
      note: 'Snacks',
    });
  });

  it('submits a null category_id when no category is selected', () => {
    const handleSubmit = vi.fn();
    render(<TransactionForm categories={categories} onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } });
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Corner Store' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: null }),
    );
  });

  it('pre-selects the current account and category when editing an existing transaction', () => {
    const handleSubmit = vi.fn();
    render(
      <TransactionForm
        categories={categories}
        accounts={accounts}
        submitLabel="Save transaction"
        initialValues={{
          date: '2024-03-15',
          amount_cents: -1500,
          payee: 'Coffee Shop',
          category_id: 2,
          account_id: 20,
          note: 'Latte',
        }}
        onSubmit={handleSubmit}
      />,
    );

    expect((screen.getByLabelText('Account') as HTMLSelectElement).value).toBe('20');
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('2');

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 10 }),
    );
  });
});
