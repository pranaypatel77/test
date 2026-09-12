import { useCallback, useEffect, useState } from 'react';
import MonthPicker from '../components/MonthPicker.js';
import { fetchBudgets, updateBudget } from '../api.js';
import { currentMonth } from '../dateUtils.js';
import { formatCurrency } from '../format.js';
import type { BudgetStatus } from '../types.js';

/** Returns the progress bar status class for the given spend ratio. */
function progressStatus(limitCents: number | null, spentCents: number): 'green' | 'amber' | 'red' | 'none' {
  if (limitCents === null || limitCents <= 0) {
    return 'none';
  }

  const ratio = spentCents / limitCents;
  if (ratio > 1) {
    return 'red';
  }
  if (ratio > 0.8) {
    return 'amber';
  }
  return 'green';
}

/** Converts a dollars-and-cents input string (e.g. `"12.50"`) to integer cents, or `null` if invalid. */
function parseDollarsToCents(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) {
    return null;
  }
  return Math.round(dollars * 100);
}

export default function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const loadBudgets = useCallback(async (targetMonth: string) => {
    try {
      const data = await fetchBudgets(targetMonth);
      setBudgets(data);
      setDrafts(
        Object.fromEntries(
          data.map((budget) => [
            budget.category_id,
            budget.limit_cents === null ? '' : (budget.limit_cents / 100).toFixed(2),
          ]),
        ),
      );
      setError(null);
    } catch {
      setError('Failed to load budgets.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBudgets(month);
  }, [month, loadBudgets]);

  const handleLimitBlur = useCallback(
    async (categoryId: number) => {
      const draftValue = drafts[categoryId] ?? '';
      const limitCents = parseDollarsToCents(draftValue);

      if (limitCents === null || limitCents <= 0) {
        setError('Limit must be a positive dollar amount.');
        return;
      }

      try {
        const updated = await updateBudget(categoryId, month, limitCents);
        setBudgets((current) =>
          current.map((budget) => (budget.category_id === categoryId ? updated : budget)),
        );
        setError(null);
      } catch {
        setError('Failed to update budget.');
      }
    },
    [drafts, month],
  );

  return (
    <section>
      <h2>Budgets</h2>
      <MonthPicker month={month} onChange={setMonth} />

      {error ? <p role="alert">{error}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Limit</th>
            <th>Spent</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((budget) => {
            const status = progressStatus(budget.limit_cents, budget.amount_spent_cents);
            const percent =
              budget.limit_cents && budget.limit_cents > 0
                ? Math.min((budget.amount_spent_cents / budget.limit_cents) * 100, 100)
                : 0;

            return (
              <tr key={budget.category_id}>
                <td>{budget.category_name}</td>
                <td>
                  <label>
                    <span className="sr-only">{`${budget.category_name} limit`}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`${budget.category_name} limit`}
                      value={drafts[budget.category_id] ?? ''}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [budget.category_id]: event.target.value }))
                      }
                      onBlur={() => void handleLimitBlur(budget.category_id)}
                    />
                  </label>
                </td>
                <td>{formatCurrency(budget.amount_spent_cents)}</td>
                <td>
                  <div
                    className="budget-progress"
                    role="progressbar"
                    aria-valuenow={Math.round(percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`budget-progress-bar budget-progress-bar--${status}`}
                      style={{ width: `${percent}%` }}
                      data-testid={`budget-progress-${budget.category_id}`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
