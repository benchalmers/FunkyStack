import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    console.log(msg);
  });
  await page.goto('http://localhost:5173/');

});
test('has title', async ({ page }) => {

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/FunkyStack/);
});

test('welcomes default user, then changes that user to Test', async ({ page, browser }) => {

  // Expects page to have a heading with the name of Installation.
  await expect(page.locator('h1')).toContainText('Hello FunkyStack User!')

  await page.locator('input').fill('Test')
  
  const g =await page.getByText('Click to change user')
  g.click({force: ((browser.browserType().name())==='webkit')}) //Don't know why we have to force webkit?

  await expect(page.locator('h1')).toContainText('Hello Test!')
});
