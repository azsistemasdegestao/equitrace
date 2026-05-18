import { test as setup, expect } from '@playwright/test';
import path from 'path';

const adminFile = path.join(__dirname, '../playwright/.auth/admin.json');
const userFile = path.join(__dirname, '../playwright/.auth/user.json');

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
}

setup('authenticate as admin', async ({ page }) => {
  await login(page, 'admin@wallet.com', 'admin123');
  await expect(page.getByText('Equitrace')).toBeVisible();
  await page.context().storageState({ path: adminFile });
});

setup('create and authenticate as test user', async ({ page }) => {
  // Log in as admin so the /api/users endpoint accepts the request
  await login(page, 'admin@wallet.com', 'admin123');

  // Create test user — ignore 409 if it already exists from a prior run
  await page.request.post('/api/users', {
    data: { name: 'Test User', email: 'testuser@wallet.com', password: 'testpass123', role: 'USER' },
  });

  // Log in as the test user and save state
  await login(page, 'testuser@wallet.com', 'testpass123');
  await page.context().storageState({ path: userFile });
});
