import { test, expect } from '@playwright/test';

test.describe('Transactions', () => {
  test('shows transactions page heading', async ({ page }) => {
    await page.goto('/dashboard/transactions');
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  });

  test('opens Add Transaction modal', async ({ page }) => {
    await page.goto('/dashboard/transactions');
    await page.getByRole('button', { name: '+ Add Transaction' }).click();
    await expect(page.getByRole('heading', { name: 'New Transaction' })).toBeVisible();
  });

  test('closes modal on Cancel', async ({ page }) => {
    await page.goto('/dashboard/transactions');
    await page.getByRole('button', { name: '+ Add Transaction' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'New Transaction' })).not.toBeVisible();
  });

  test('adds a new BUY transaction', async ({ page }) => {
    await page.goto('/dashboard/transactions');
    await page.getByRole('button', { name: '+ Add Transaction' }).click();

    await page.getByPlaceholder('e.g. AAPL').fill('NVDA');
    await page.locator('select[name="type"]').selectOption('BUY');
    await page.locator('input[name="quantity"]').fill('10');
    await page.locator('input[name="price"]').fill('130.00');

    await page.getByRole('button', { name: 'Save' }).click();

    // Modal closes and the new ticker appears in the list
    await expect(page.getByRole('heading', { name: 'New Transaction' })).not.toBeVisible();
    await expect(page.getByText('NVDA').first()).toBeVisible();
  });
});
