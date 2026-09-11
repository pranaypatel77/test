import { useState, type FormEvent } from 'react';
import type { TransactionFormValues } from './TransactionForm.js';
import type { Category, Transaction } from '../types.js';
import CategoryChip from './CategoryChip.js';
import CategorySelect from './CategorySelect.js';

interface TransactionTableProps {
  transactions: Transaction[];
  categories?: Category[];
  onUpdate?: (id: number, values: TransactionFormValues) => void | Promise<void>;
  onDelete?: (transaction: Transaction) => void | Promise<void>;
}

interface EditValues {
  date: string;
  payee: string;
  amount: string;
  categoryId: number | null;
  note: string;
}

function formatAmount(amountCents: number): string {
  const formatted = (Math.abs(amountCents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return amountCents < 0 ? `-${formatted}` : formatted;
}

function toEditValues(transaction: Transaction): EditValues {
  return {
    date: transaction.date,
    payee: transaction.payee,
    amount: (transaction.amount_cents / 100).toFixed(2),
    categoryId: transaction.category_id,
    note: transaction.note ?? '',
  };
}

/** A table of transactions, supporting inline editing and deletion. */
export default function TransactionTable({
  transactions,
  categories = [],
  onUpdate,
  onDelete,
}: TransactionTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues | null>(null);

  if (transactions.length === 0) {
    return <p>No transactions yet.</p>;
  }

  function startEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setEditValues(toEditValues(transaction));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>, transaction: Transaction) {
    event.preventDefault();
    if (!editValues) {
      return;
    }

    const amountCents = Math.round(Number(editValues.amount) * 100);
    if (!editValues.date || editValues.payee.trim().length === 0 || Number.isNaN(amountCents)) {
      return;
    }

    await onUpdate?.(transaction.id, {
      date: editValues.date,
      amount_cents: amountCents,
      payee: editValues.payee.trim(),
      category_id: editValues.categoryId,
      note: editValues.note.trim().length > 0 ? editValues.note.trim() : null,
    });

    setEditingId(null);
    setEditValues(null);
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Payee</th>
          <th>Category</th>
          <th>Amount</th>
          <th>Note</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) =>
          editingId === transaction.id && editValues ? (
            <tr key={transaction.id}>
              <td colSpan={6}>
                <form
                  aria-label={`Edit transaction ${transaction.id}`}
                  onSubmit={(event) => void handleSave(event, transaction)}
                >
                  <div>
                    <label htmlFor={`edit-date-${transaction.id}`}>Date</label>
                    <input
                      id={`edit-date-${transaction.id}`}
                      type="date"
                      value={editValues.date}
                      onChange={(event) =>
                        setEditValues((prev) => (prev ? { ...prev, date: event.target.value } : prev))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-payee-${transaction.id}`}>Payee</label>
                    <input
                      id={`edit-payee-${transaction.id}`}
                      type="text"
                      value={editValues.payee}
                      onChange={(event) =>
                        setEditValues((prev) => (prev ? { ...prev, payee: event.target.value } : prev))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-amount-${transaction.id}`}>Amount</label>
                    <input
                      id={`edit-amount-${transaction.id}`}
                      type="number"
                      step="0.01"
                      value={editValues.amount}
                      onChange={(event) =>
                        setEditValues((prev) => (prev ? { ...prev, amount: event.target.value } : prev))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-category-${transaction.id}`}>Category</label>
                    <CategorySelect
                      id={`edit-category-${transaction.id}`}
                      categories={categories}
                      value={editValues.categoryId}
                      onChange={(categoryId) =>
                        setEditValues((prev) => (prev ? { ...prev, categoryId } : prev))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-note-${transaction.id}`}>Note</label>
                    <input
                      id={`edit-note-${transaction.id}`}
                      type="text"
                      value={editValues.note}
                      onChange={(event) =>
                        setEditValues((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                      }
                    />
                  </div>
                  <button type="submit">Save</button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </form>
              </td>
            </tr>
          ) : (
            <tr key={transaction.id}>
              <td>{transaction.date}</td>
              <td>{transaction.payee}</td>
              <td>
                {transaction.category_name && transaction.category_color ? (
                  <CategoryChip name={transaction.category_name} color={transaction.category_color} />
                ) : (
                  'Uncategorized'
                )}
              </td>
              <td
                className={
                  transaction.amount_cents < 0
                    ? 'transactions-amount transactions-amount--expense'
                    : 'transactions-amount transactions-amount--income'
                }
              >
                {formatAmount(transaction.amount_cents)}
              </td>
              <td>{transaction.note}</td>
              <td>
                <button type="button" onClick={() => startEdit(transaction)}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete?.(transaction)}>
                  Delete
                </button>
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
