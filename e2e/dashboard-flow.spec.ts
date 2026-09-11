import { expect, test } from '@playwright/test';

/** Returns today's date as a `yyyy-mm-dd` string, in the local timezone. */
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('create a transaction, set a budget, and see it reflected on the dashboard', async ({ page }) => {
  const payee = `E2E Grocery Run ${Date.now()}`;
  const date = todayIso();

  // 1. Create an expense transaction on the Transactions page.
  await page.goto('/transactions');

  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Payee').fill(payee);
  await page.getByLabel('Amount').fill('-42.50');
  await page.getByLabel('Category').selectOption({ label: 'Groceries' });
  await page.getByRole('button', { name: 'Add transaction' }).click();

  const transactionRow = page.getByRole('row', { name: new RegExp(payee) });
  await expect(transactionRow).toBeVisible();
  await expect(transactionRow.getByText('-$42.50')).toBeVisible();

  // 2. Navigate to Budgets and set a limit for the Groceries category.
  await page.getByRole('link', { name: 'Budgets' }).click();
  await expect(page).toHaveURL(/\/budgets$/);

  const groceriesRow = page.getByRole('row', { name: /Groceries/ });
  const limitInput = groceriesRow.getByLabel('Groceries limit');
  await limitInput.fill('100.00');
  await limitInput.press('Tab');

  await expect(groceriesRow.getByText('$42.50')).toBeVisible();

  const progressBar = groceriesRow.locator('[data-testid^="budget-progress-"]');
  await expect(progressBar).toHaveClass(/budget-progress-bar--(green|amber|red)/);
  await expect(progressBar).not.toHaveCSS('width', '0px');

  // 3. Navigate to the Dashboard and confirm the expense total and a
  // colored category bar are both visible.
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const expenseTile = page.locator('.stat-tile--expense');
  await expect(expenseTile).toBeVisible();
  await expect(expenseTile.getByText('$42.50')).toBeVisible();

  const categoryBar = page.getByTestId('category-bar-Groceries');
  await expect(categoryBar).toBeVisible();
  await expect(categoryBar.locator('rect')).toHaveAttribute('fill', /^#[0-9a-fA-F]{6}$/);
});
