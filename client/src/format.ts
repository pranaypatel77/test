/** Formats an integer cents amount as a USD currency string, e.g. `-$15.00`. */
export function formatCurrency(amountCents: number): string {
  return (amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
