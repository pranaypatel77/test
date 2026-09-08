import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CategorySelect from '../src/components/CategorySelect.js';
import type { Category } from '../src/types.js';

const categories: Category[] = [
  { id: 1, name: 'Groceries', color: '#4caf50', kind: 'expense' },
  { id: 2, name: 'Rent', color: '#f44336', kind: 'expense' },
  { id: 6, name: 'Salary', color: '#009688', kind: 'income' },
];

describe('CategorySelect', () => {
  it('renders a "No category" option plus one option per category', () => {
    render(<CategorySelect categories={categories} value={null} onChange={() => {}} />);

    expect(screen.getByRole('option', { name: 'No category' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rent' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument();
  });

  it('reflects the selected category id as the current value', () => {
    render(<CategorySelect categories={categories} value={2} onChange={() => {}} />);

    expect(screen.getByRole('combobox')).toHaveValue('2');
  });

  it('calls onChange with the numeric category id when a category is picked', () => {
    const handleChange = vi.fn();
    render(<CategorySelect categories={categories} value={null} onChange={handleChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    expect(handleChange).toHaveBeenCalledWith(2);
  });

  it('calls onChange with null when "No category" is picked', () => {
    const handleChange = vi.fn();
    render(<CategorySelect categories={categories} value={1} onChange={handleChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledWith(null);
  });
});
