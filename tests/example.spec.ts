import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5173/');
});
test('has title', async ({ page }) => {

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Ministack/);
});

test('welcomes default user', async ({ page }) => {

  // Expects page to have a heading with the name of Installation.
  await expect(page.locator('h1')).toContainText('Hello Ministack User!')
});
