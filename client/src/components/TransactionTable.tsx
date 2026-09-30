import type { Transaction } from '../types.js';
import CategoryChip from './CategoryChip.js';

interface TransactionTableProps {
  transactions: Transaction[];
  /**
   * The balance to start accumulating from before any of the given
   * transactions are applied. For a single-account view this should be that
   * account's `opening_balance_cents`; for an "All Accounts" view this
   * should be the sum of every account's `opening_balance_cents`.
   */
  openingBalanceCents?: number;
  onEdit?: (transaction: Transaction) => void;
}

function formatAmount(amountCents: number): string {
  const formatted = (Math.abs(amountCents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return amountCents < 0 ? `-${formatted}` : formatted;
}

/**
 * Computes the running balance after each transaction, processing them in
 * ascending date order (ties broken by id) starting from
 * `openingBalanceCents`. Returns a map from transaction id to the balance
 * immediately after that transaction is applied.
 */
function computeRunningBalances(
  transactions: Transaction[],
  openingBalanceCents: number,
): Map<number, number> {
  const ascending = [...transactions].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.id - b.id;
  });

  let running = openingBalanceCents;
  const balances = new Map<number, number>();
  for (const transaction of ascending) {
    running += transaction.amount_cents;
    balances.set(transaction.id, running);
  }
  return balances;
}

/** A table of transactions, including a colored chip for each one's category and a running balance. */
export default function TransactionTable({
  transactions,
  openingBalanceCents = 0,
  onEdit,
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return <p>No transactions yet.</p>;
  }

  const balances = computeRunningBalances(transactions, openingBalanceCents);

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Payee</th>
          <th>Category</th>
          <th>Amount</th>
          <th>Balance</th>
          <th>Note</th>
          {onEdit ? <th>Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
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
            <td className="transactions-balance">
              {formatAmount(balances.get(transaction.id) ?? openingBalanceCents)}
            </td>
            <td>{transaction.note}</td>
            {onEdit ? (
              <td>
                <button type="button" onClick={() => onEdit(transaction)}>
                  Edit
                </button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
