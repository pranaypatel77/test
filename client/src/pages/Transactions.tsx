import { useEffect, useState, type FormEvent } from 'react';

interface Transaction {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  note: string | null;
  created_at: string;
}

interface TransactionFormValues {
  date: string;
  amount: string;
  payee: string;
  note: string;
}

const API_URL = '/api/transactions';

/** Returns today's date as a `yyyy-mm-dd` string, suitable for a date input default. */
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyFormValues(): TransactionFormValues {
  return { date: todayISODate(), amount: '', payee: '', note: '' };
}

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Converts a dollar-amount string (e.g. "12.50") to integer cents. */
function dollarsToCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function formatCurrency(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

/** Sorts transactions newest first, breaking ties by id (most recently created first). */
function sortByDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return b.id - a.id;
  });
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formValues, setFormValues] = useState<TransactionFormValues>(emptyFormValues);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<TransactionFormValues>(emptyFormValues);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(API_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load transactions.');
        }
        return response.json();
      })
      .then((data: Transaction[]) => {
        if (!cancelled) {
          setTransactions(sortByDateDesc(data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Failed to load transactions. Please try again later.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const amountCents = dollarsToCents(formValues.amount);
    if (!formValues.date || formValues.payee.trim().length === 0 || Number.isNaN(amountCents)) {
      setFormError('Please provide a date, payee, and a valid amount.');
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formValues.date,
          amount_cents: amountCents,
          payee: formValues.payee.trim(),
          note: formValues.note.trim().length > 0 ? formValues.note.trim() : null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(body?.error ?? 'Failed to add transaction.');
        return;
      }

      const created: Transaction = await response.json();
      setTransactions((prev) => sortByDateDesc([created, ...(prev ?? [])]));
      setFormValues(emptyFormValues());
    } catch {
      setFormError('Failed to add transaction.');
    }
  }

  function startEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setEditError(null);
    setEditValues({
      date: transaction.date,
      amount: centsToDollarsString(transaction.amount_cents),
      payee: transaction.payee,
      note: transaction.note ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, transaction: Transaction) {
    event.preventDefault();
    setEditError(null);

    const amountCents = dollarsToCents(editValues.amount);
    if (!editValues.date || editValues.payee.trim().length === 0 || Number.isNaN(amountCents)) {
      setEditError('Please provide a date, payee, and a valid amount.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editValues.date,
          amount_cents: amountCents,
          payee: editValues.payee.trim(),
          category_id: transaction.category_id,
          note: editValues.note.trim().length > 0 ? editValues.note.trim() : null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setEditError(body?.error ?? 'Failed to update transaction.');
        return;
      }

      const updated: Transaction = await response.json();
      setTransactions((prev) =>
        sortByDateDesc((prev ?? []).map((item) => (item.id === updated.id ? updated : item))),
      );
      setEditingId(null);
    } catch {
      setEditError('Failed to update transaction.');
    }
  }

  async function handleDelete(transaction: Transaction) {
    const confirmed = window.confirm(
      `Delete the transaction "${transaction.payee}" on ${transaction.date}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/${transaction.id}`, { method: 'DELETE' });
      if (!response.ok) {
        return;
      }
      setTransactions((prev) => (prev ?? []).filter((item) => item.id !== transaction.id));
    } catch {
      // Leave the row in place on network failure so the user can retry.
    }
  }

  return (
    <section>
      <h2>Transactions</h2>

      <form aria-label="Add transaction" onSubmit={handleAddSubmit}>
        <div>
          <label htmlFor="add-date">Date</label>
          <input
            id="add-date"
            type="date"
            value={formValues.date}
            onChange={(event) => setFormValues((prev) => ({ ...prev, date: event.target.value }))}
            required
          />
        </div>
        <div>
          <label htmlFor="add-payee">Payee</label>
          <input
            id="add-payee"
            type="text"
            value={formValues.payee}
            onChange={(event) =>
              setFormValues((prev) => ({ ...prev, payee: event.target.value }))
            }
            required
          />
        </div>
        <div>
          <label htmlFor="add-amount">Amount</label>
          <input
            id="add-amount"
            type="number"
            step="0.01"
            value={formValues.amount}
            onChange={(event) =>
              setFormValues((prev) => ({ ...prev, amount: event.target.value }))
            }
            required
          />
        </div>
        <div>
          <label htmlFor="add-note">Note</label>
          <input
            id="add-note"
            type="text"
            value={formValues.note}
            onChange={(event) => setFormValues((prev) => ({ ...prev, note: event.target.value }))}
          />
        </div>
        <button type="submit">Add transaction</button>
        {formError && <p role="alert">{formError}</p>}
      </form>

      {loadError && <p role="alert">{loadError}</p>}

      {transactions === null ? (
        <p>Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <p>No transactions yet. Add your first transaction above.</p>
      ) : (
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
              editingId === transaction.id ? (
                <tr key={transaction.id}>
                  <td colSpan={6}>
                    <form
                      aria-label={`Edit transaction ${transaction.id}`}
                      onSubmit={(event) => handleEditSubmit(event, transaction)}
                    >
                      <div>
                        <label htmlFor={`edit-date-${transaction.id}`}>Date</label>
                        <input
                          id={`edit-date-${transaction.id}`}
                          type="date"
                          value={editValues.date}
                          onChange={(event) =>
                            setEditValues((prev) => ({ ...prev, date: event.target.value }))
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
                            setEditValues((prev) => ({ ...prev, payee: event.target.value }))
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
                            setEditValues((prev) => ({ ...prev, amount: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-note-${transaction.id}`}>Note</label>
                        <input
                          id={`edit-note-${transaction.id}`}
                          type="text"
                          value={editValues.note}
                          onChange={(event) =>
                            setEditValues((prev) => ({ ...prev, note: event.target.value }))
                          }
                        />
                      </div>
                      <button type="submit">Save</button>
                      <button type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
                      {editError && <p role="alert">{editError}</p>}
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>{transaction.payee}</td>
                  <td>{transaction.category_id ?? 'Uncategorized'}</td>
                  <td
                    className={
                      transaction.amount_cents < 0
                        ? 'transactions-amount transactions-amount--expense'
                        : 'transactions-amount transactions-amount--income'
                    }
                  >
                    {formatCurrency(transaction.amount_cents)}
                  </td>
                  <td>{transaction.note ?? ''}</td>
                  <td>
                    <button type="button" onClick={() => startEdit(transaction)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(transaction)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
