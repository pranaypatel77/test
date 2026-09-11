import { formatMonthLabel, shiftMonth } from '../dateUtils.js';

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
}

/**
 * A month navigation control shared by pages that scope their data to a
 * single calendar month (e.g. Dashboard, Budgets). Renders previous/next
 * buttons alongside a native month input and a human-friendly label.
 */
export default function MonthPicker({ month, onChange }: MonthPickerProps) {
  return (
    <div className="month-nav">
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        &lt;
      </button>
      <label>
        Month
        <input
          type="month"
          aria-label="Month"
          value={month}
          onChange={(event) => {
            if (event.target.value) {
              onChange(event.target.value);
            }
          }}
        />
      </label>
      <button type="button" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        &gt;
      </button>
      <span>{formatMonthLabel(month)}</span>
    </div>
  );
}
