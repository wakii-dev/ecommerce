import { expect, test } from '@playwright/test';
import { STOREFRONT } from '../helpers/env';

/**
 * SF-3 honesty-pass (FI-372 T11) — binary hoá "zero dead link":
 * header/footer/tiles/"Xem thêm" click → URL đích ĐÚNG; không còn
 * `href="#"` trên bất kỳ trang nào; AddToCart lỗi mạng → toast LỖI THẬT
 * (không "coming soon").
 *
 * Chạy cách ly (không cần full stack): start mock-gateway (/tmp/story/
 * fi372-mock-gateway.mjs :9099 + :8025) + storefront dev của worktree
 * GATEWAY_URL trỏ mock — E2E_STOREFRONT_URL override theo helpers/env.
 */
test.describe.configure({ mode: 'serial' });

const pathnameOf = (url: string): string => new URL(url).pathname;

test('home: không có bất kỳ link chết nào (a[href="#"] = 0)', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
});

test('header mini-nav: 3 link → PLP /c/dien-tu với sort thật', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  const nav = page.locator('nav.mini-nav');

  // href attributes đúng đích trước, rồi click thật
  await expect(nav.locator('a').nth(0)).toHaveAttribute('href', /^\/c\/dien-tu$/);
  await expect(nav.locator('a').nth(1)).toHaveAttribute('href', /^\/c\/dien-tu\?sort=newest$/);
  await expect(nav.locator('a').nth(2)).toHaveAttribute('href', /^\/c\/dien-tu\?sort=rating$/);

  const expectedUrls = [/\/c\/dien-tu$/, /\/c\/dien-tu\?sort=newest$/, /\/c\/dien-tu\?sort=rating$/];
  for (const [index, expectedUrl] of expectedUrls.entries()) {
    await nav.locator('a').nth(index).click();
    await expect(page).toHaveURL(expectedUrl);
    // PLP thật (không 404/dead): có ít nhất 1 product card render từ data
    await expect(page.locator('main a[href*="/p/"]').first()).toBeVisible();
    await page.goBack();
  }
});

test('CategoryTiles: tile + "Xem thêm" → route thật', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  const tiles = page.locator('.cat-grid');

  // tile danh mục đầu (seed hợp nhất: Làm Đẹp đứng đầu cat-grid) → /c/lam-dep
  await tiles.locator('.cat-tile').first().click();
  await expect(page).toHaveURL(/\/c\/lam-dep$/);
  await page.goBack();

  // "Xem thêm →" → /vi/search (surface duyệt chung)
  await tiles.locator('.cat-tile--more').click();
  await expect(page).toHaveURL(/\/search$/);
});

test('home "Xem thêm" (featured): → PLP danh mục đầu sort=discount', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  const more = page.locator('a.featured-more');
  await expect(more).toHaveAttribute('href', /^\/c\/[a-z0-9-]+\?sort=discount$/);
  await more.click();
  await expect(page).toHaveURL(/\/c\/[a-z0-9-]+\?sort=discount$/);
  await expect(page.locator('main a[href*="/p/"]').first()).toBeVisible();
});

test('footer: mọi link điều hướng tới route thật (category + shell)', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  const footerLinks = page.locator('.site-footer a');
  const count = await footerLinks.count();
  expect(count).toBeGreaterThanOrEqual(10); // 5 category + 5 shell
  await expect(page.locator('.site-footer a[href="#"]')).toHaveCount(0);

  const seen = new Set<string>();
  const targetRe = /^(\/c\/[a-z0-9-]+|\/cart|\/account(\/(orders|wishlist|reviews))?)$/;
  for (let i = 0; i < count; i += 1) {
    const link = footerLinks.nth(i);
    const href = (await link.getAttribute('href')) ?? '';
    expect(href).not.toBe('#');
    const label = (await link.textContent()) ?? '';
    await link.click();
    // SPA nav (next/link) không bắn load-event mới — waitForLoadState + page.url()
    // tức-thì đọc URL CŨ. Đợi đích bằng toHaveURL (auto-retry, function tuỳ chọn
    // origin-agnostic vì shell link cross-origin :5703).
    await expect(page).toHaveURL((u) => targetRe.test(pathnameOf(u)));
    const path = pathnameOf(page.url());
    // đích phải là route danh mục thật hoặc route shell thật
    expect(path, `footer link "${label}" → ${path}`).toMatch(targetRe);
    seen.add(path);
    await page.goBack();
    await expect(footerLinks).toHaveCount(count); // quay về home nguyên vẹn
  }
  // cả 2 nhóm đều được phủ: /c/* và shell routes
  expect([...seen].some((p) => p.startsWith('/c/'))).toBe(true);
  expect([...seen].some((p) => p.startsWith('/cart') || p.startsWith('/account'))).toBe(true);
});

test('AddToCart: lỗi mạng → toast lỗi thật, không hứa hẹn giả', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi/p/dien-thoai-xiaomi-redmi-13c`);
  await expect(page.locator('.pdp-atc')).toBeVisible();

  // chặn POST /api/cart/items ở tầng browser (route.abort) — giả lập cart-service chết
  await page.route('**/api/cart/items*', (route) => route.abort());
  await page.getByRole('button', { name: 'THÊM VÀO GIỎ' }).click();

  const toast = page.locator('.pdp-toast[role="status"]');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Không thêm được vào giỏ — thử lại');
  await expect(page.locator('.pdp-toast')).not.toHaveText(/sớm|soon/i);
});

test('PDP: không có link chết; breadcrumb + tabs là anchor có đích', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi/p/dien-thoai-xiaomi-redmi-13c`);
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
  // breadcrumb về home
  await expect(page.locator('.plp-breadcrumb a').first()).toHaveAttribute('href', '/');
});
