import { formatCurrency } from '../format.js';
import type { Cadence, RecurringSeries } from '../types.js';

interface RecurringSectionProps {
  series: RecurringSeries[];
  onDismiss: (payee: string, cadence: Cadence) => void;
}

const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
};

/**
 * Dashboard section listing detected recurring transaction series, each
 * with a "Not recurring" control to dismiss it.
 */
export default function RecurringSection({ series, onDismiss }: RecurringSectionProps) {
  return (
    <section aria-label="Recurring">
      <h3>Recurring</h3>
      {series.length === 0 ? (
        <p>No recurring transactions detected.</p>
      ) : (
        <ul className="recurring-list">
          {series.map((item) => (
            <li key={`${item.payee}-${item.cadence}`} className="recurring-item">
              <span className="recurring-payee">{item.payee}</span>
              <span className="recurring-cadence">{CADENCE_LABELS[item.cadence]}</span>
              <span className="recurring-amount">{formatCurrency(item.average_amount_cents)}</span>
              <span className="recurring-next">Next: {item.next_expected_date}</span>
              <button type="button" onClick={() => onDismiss(item.payee, item.cadence)}>
                Not recurring
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
