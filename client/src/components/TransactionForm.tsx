import { useEffect, useState, type FormEvent } from 'react';
import type { Account, Category } from '../types.js';
import CategorySelect from './CategorySelect.js';

export interface TransactionFormValues {
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  account_id: number | null;
  note: string | null;
}

interface TransactionFormProps {
  categories: Category[];
  accounts?: Account[];
  initialValues?: Partial<TransactionFormValues>;
  submitLabel?: string;
  onSubmit: (values: TransactionFormValues) => void;
}

/** A form for entering a new (or editing an existing) transaction, including category and account selects. */
export default function TransactionForm({
  categories,
  accounts = [],
  initialValues,
  submitLabel = 'Add transaction',
  onSubmit,
}: TransactionFormProps) {
  const [date, setDate] = useState(initialValues?.date ?? '');
  const [payee, setPayee] = useState(initialValues?.payee ?? '');
  const [amount, setAmount] = useState(
    initialValues?.amount_cents !== undefined ? String(initialValues.amount_cents / 100) : '',
  );
  const [categoryId, setCategoryId] = useState<number | null>(initialValues?.category_id ?? null);
  const [accountId, setAccountId] = useState<number | null>(
    initialValues?.account_id ?? (accounts[0]?.id ?? null),
  );
  const [note, setNote] = useState(initialValues?.note ?? '');

  useEffect(() => {
    // Once accounts load, default to the first one if none has been chosen yet.
    if (accountId === null && accounts.length > 0 && initialValues?.account_id === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId, initialValues?.account_id]);

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
      account_id: accountId,
      note: note.trim().length > 0 ? note.trim() : null,
    });

    if (!initialValues) {
      setDate('');
      setPayee('');
      setAmount('');
      setCategoryId(null);
      setNote('');
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={submitLabel}>
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
        <label htmlFor="transaction-account">Account</label>
        <select
          id="transaction-account"
          value={accountId === null ? '' : String(accountId)}
          onChange={(event) => {
            const raw = event.target.value;
            setAccountId(raw === '' ? null : Number(raw));
          }}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
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
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
