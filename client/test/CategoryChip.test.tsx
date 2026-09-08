import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CategoryChip from '../src/components/CategoryChip.js';

describe('CategoryChip', () => {
  it('renders the category name', () => {
    render(<CategoryChip name="Groceries" color="#4caf50" />);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('sets the background color to the category color', () => {
    render(<CategoryChip name="Rent" color="#f44336" />);

    const chip = screen.getByText('Rent');
    expect(chip).toHaveStyle({ backgroundColor: '#f44336' });
  });
});
