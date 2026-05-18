import { test, expect } from '@playwright/test';
import path from 'path';

const csvFile = path.join(__dirname, 'fixtures/sample.csv');

test.describe('Import', () => {
  test('shows import page heading and column hint', async ({ page }) => {
    await page.goto('/dashboard/import');
    await expect(page.getByRole('heading', { name: 'Import Transactions' })).toBeVisible();
    await expect(page.getByText('DATA')).toBeVisible();
  });

  test('uploads a valid CSV and shows preview table', async ({ page }) => {
    await page.goto('/dashboard/import');
    await page.locator('input[type="file"]').setInputFiles(csvFile);
    await expect(page.getByText(/Valid rows/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Import' })).toBeVisible();
  });

  test('preview shows correct tickers from the CSV', async ({ page }) => {
    await page.goto('/dashboard/import');
    await page.locator('input[type="file"]').setInputFiles(csvFile);
    await expect(page.getByText(/Valid rows/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'AAPL' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'MSFT' })).toBeVisible();
  });

  test('confirms import and shows success message', async ({ page }) => {
    await page.goto('/dashboard/import');
    await page.locator('input[type="file"]').setInputFiles(csvFile);
    await expect(page.getByRole('button', { name: 'Confirm Import' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Import' }).click();
    await expect(page.getByText(/imported successfully/)).toBeVisible();
  });
});
