import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Admin — page access', () => {
  test('shows admin page with user list', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByText(/Users \(/)).toBeVisible();
  });

  test('opens Add User modal', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: '+ Add User' }).click();
    await expect(page.getByRole('heading', { name: 'New User' })).toBeVisible();
  });

  test('closes Add User modal on Cancel', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: '+ Add User' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'New User' })).not.toBeVisible();
  });

  test('opens Reset Password modal', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: 'Reset password' }).first().click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
  });

  test('non-admin authenticated user is redirected from /dashboard/admin', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../playwright/.auth/user.json'),
    });
    const page = await context.newPage();
    await page.goto('/dashboard/admin');
    await expect(page).toHaveURL('/dashboard');
    await context.close();
  });

  test('unauthenticated user is redirected from /dashboard/admin to /login', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/dashboard/admin');
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});

// Run create → delete in order to keep DB clean between runs
test.describe.serial('Admin — user CRUD', () => {
  const testEmail = 'e2e-admin-test@wallet.com';

  test('creates a new user', async ({ page }) => {
    await page.goto('/dashboard/admin');
    await page.getByRole('button', { name: '+ Add User' }).click();

    await page.getByPlaceholder('Full name').fill('E2E Admin Test');
    await page.getByPlaceholder('user@example.com').fill(testEmail);
    await page.getByPlaceholder('Min. 6 characters').fill('e2epass123');
    await page.locator('select[name="role"]').selectOption('USER');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByRole('heading', { name: 'New User' })).not.toBeVisible();
    await expect(page.getByText('E2E Admin Test')).toBeVisible();
  });

  test('resets password of the created user', async ({ page }) => {
    await page.goto('/dashboard/admin');
    const row = page.getByRole('row').filter({ hasText: testEmail });
    await row.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();

    await page.getByPlaceholder('Min. 6 characters').fill('newpass456');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).not.toBeVisible();
  });

  test('deletes the created user', async ({ page }) => {
    await page.goto('/dashboard/admin');
    const row = page.getByRole('row').filter({ hasText: testEmail });
    await row.getByRole('button', { name: 'Delete' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText(testEmail)).not.toBeVisible();
  });
});
