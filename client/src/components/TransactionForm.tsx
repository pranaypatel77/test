import { useState, type FormEvent } from 'react';
import type { Category } from '../types.js';
import CategorySelect from './CategorySelect.js';

export interface TransactionFormValues {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  note: string | null;
}

interface TransactionFormProps {
  categories: Category[];
  onSubmit: (values: TransactionFormValues) => void;
}

/** A form for entering a new transaction, including a category select. */
export default function TransactionForm({ categories, onSubmit }: TransactionFormProps) {
  const [date, setDate] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amountCents = Math.round(Number(amount) * 100);
    if (!date || payee.trim().length === 0 || Number.isNaN(amountCents)) {
      return;
    }

    onSubmit({
      date,
      amount_cents: amountCents,
      payee: payee.trim(),
      category_id: categoryId,
      note: note.trim().length > 0 ? note.trim() : null,
    });

    setDate('');
    setPayee('');
    setAmount('');
    setCategoryId(null);
    setNote('');
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Add transaction">
      <div>
        <label htmlFor="transaction-date">Date</label>
        <input
          id="transaction-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="transaction-payee">Payee</label>
        <input
          id="transaction-payee"
          type="text"
          value={payee}
          onChange={(event) => setPayee(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="transaction-amount">Amount</label>
        <input
          id="transaction-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="transaction-category">Category</label>
        <CategorySelect
          id="transaction-category"
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>
      <div>
        <label htmlFor="transaction-note">Note</label>
        <input
          id="transaction-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <button type="submit">Add transaction</button>
    </form>
  );
}
