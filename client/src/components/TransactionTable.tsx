import type { Transaction } from '../types.js';
import CategoryChip from './CategoryChip.js';

interface TransactionTableProps {
  transactions: Transaction[];
}

function formatAmount(amountCents: number): string {
  return (amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** A table of transactions, including a colored chip for each one's category. */
export default function TransactionTable({ transactions }: TransactionTableProps) {
  if (transactions.length === 0) {
    return <p>No transactions yet.</p>;
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
              ) : null}
            </td>
            <td>{formatAmount(transaction.amount_cents)}</td>
            <td>{transaction.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
