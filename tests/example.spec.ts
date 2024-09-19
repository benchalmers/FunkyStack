import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5173/');
});
test('has title', async ({ page }) => {

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Ministack/);
});

test('welcomes default user, then changes that user to Test', async ({ page }) => {

  // Expects page to have a heading with the name of Installation.
  await expect(page.locator('h1')).toContainText('Hello Ministack User!')

  await page.locator('input').fill('Test')
  await page.locator('button').click()

  await expect(page.locator('h1')).toContainText('Hello Test!')
});
