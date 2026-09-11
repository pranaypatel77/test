import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TransactionForm from '../src/components/TransactionForm.js';
import type { Category } from '../src/types.js';

const categories: Category[] = [
  { id: 1, name: 'Groceries', color: '#4caf50', kind: 'expense' },
  { id: 2, name: 'Rent', color: '#f44336', kind: 'expense' },
];

describe('TransactionForm', () => {
  it('includes a category select populated with the given categories', () => {
    render(<TransactionForm categories={categories} onSubmit={() => {}} />);

    const select = screen.getByLabelText('Category');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rent' })).toBeInTheDocument();
  });

  it('submits the entered values including the selected category id', () => {
    const handleSubmit = vi.fn();
    render(<TransactionForm categories={categories} onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } });
    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Corner Store' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Snacks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(handleSubmit).toHaveBeenCalledWith({
      date: '2024-03-15',
      amount_cents: 1250,
      payee: 'Corner Store',
      category_id: 1,
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
});
