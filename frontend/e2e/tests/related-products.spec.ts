import { expect, test } from '@playwright/test';
import { STOREFRONT } from '../helpers/env';

/**
 * SF-13 A6 (Task 12): PDP có "Sản phẩm tương tự" (≥1 card, không chứa self);
 * về home thấy "Đã xem gần đây" với sản phẩm vừa xem (localStorage).
 */
test.describe.configure({ mode: 'serial' });

test('PDP hiện Sản phẩm tương tự; home hiện Đã xem gần đây', async ({ page }) => {
  // seed SF-4 có "Tai nghe Redmi Buds 4"
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'Tai nghe');
  await page.press('input[type=search][name=q]', 'Enter');
  const pdpLink = page.getByRole('link', { name: /Tai nghe/i }).first();
  await expect(pdpLink).toBeVisible({ timeout: 15_000 });
  await pdpLink.click();
  await expect(page).toHaveURL(/\/p\//);
  const pdpUrl = page.url();

  // PDP: related ≥1 card — đợi tracker ghi localStorage (hydration async)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('recently_viewed')), { timeout: 10_000 })
    .not.toBeNull();
  const related = page.getByTestId('related-products');
  await expect(related).toBeVisible({ timeout: 15_000 });
  await expect(related.locator('a')).not.toHaveCount(0);

  // home: recently viewed chứa sản phẩm vừa xem
  await page.goto(`${STOREFRONT}/vi`);
  const recent = page.getByTestId('recently-viewed');
  await expect(recent).toBeVisible({ timeout: 10_000 });
  await expect(recent.locator('a').first()).toBeVisible();

  // link card trỏ về PDP vừa xem
  const firstHref = await recent.locator('a').first().getAttribute('href');
  expect(pdpUrl).toContain(new URL(firstHref ?? 'http://x/invalid', pdpUrl).pathname);
});
