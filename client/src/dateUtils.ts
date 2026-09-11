/** Returns the current calendar month as a `yyyy-mm` string. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns the `yyyy-mm` month that is `delta` months away from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Renders a human-friendly label for a `yyyy-mm` month, e.g. `March 2024`. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
