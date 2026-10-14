import { describe, expect, it } from 'vitest';
import { parseTransactionsCsv } from '../src/csvImport.js';

describe('parseTransactionsCsv', () => {
  it('returns typed rows for a valid CSV', () => {
    const csv = [
      'date,amount,description,category',
      '2024-03-01,12.50,Coffee,Dining',
      '2024-03-02,-45.00,Groceries,Food',
    ].join('\n');

    const { rows, errors } = parseTransactionsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, date: '2024-03-01', amount: 12.5, description: 'Coffee', category: 'Dining' },
      { line: 3, date: '2024-03-02', amount: -45, description: 'Groceries', category: 'Food' },
    ]);
  });

  it('reports per-line errors for bad date, non-numeric amount, and empty description while still returning valid rows', () => {
    const csv = [
      'date,amount,description,category',
      '2024-03-01,12.50,Coffee,Dining',
      'not-a-date,10.00,Lunch,Dining',
      '2024-03-03,not-a-number,Taxi,Transport',
      '2024-03-04,20.00,,Shopping',
    ].join('\n');

    const { rows, errors } = parseTransactionsCsv(csv);

    expect(rows).toEqual([
      { line: 2, date: '2024-03-01', amount: 12.5, description: 'Coffee', category: 'Dining' },
    ]);

    expect(errors).toEqual([
      { line: 3, message: 'Invalid date "not-a-date"' },
      { line: 4, message: 'Invalid amount "not-a-number"' },
      { line: 5, message: 'Description is empty' },
    ]);
  });

  it('accepts a header with reordered and extra columns', () => {
    const csv = [
      'description,date,extra,category,amount',
      'Coffee,2024-03-01,ignored,Dining,12.50',
    ].join('\n');

    const { rows, errors } = parseTransactionsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, date: '2024-03-01', amount: 12.5, description: 'Coffee', category: 'Dining' },
    ]);
  });

  it('rejects a CSV with a missing or malformed header', () => {
    const csv = 'foo,bar,baz\n1,2,3';

    const { rows, errors } = parseTransactionsCsv(csv);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Expected header');
  });

  it('handles an empty string without throwing', () => {
    const { rows, errors } = parseTransactionsCsv('');

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('skips blank lines between data rows', () => {
    const csv = ['date,amount,description,category', '2024-03-01,10.00,Coffee,Dining', '', ''].join(
      '\n',
    );

    const { rows, errors } = parseTransactionsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, date: '2024-03-01', amount: 10, description: 'Coffee', category: 'Dining' },
    ]);
  });
});
