/**
 * SF-6 T10 — Visual walkthrough record (FI-396, Rule 0).
 * Cách dùng: node scripts/qa/walkthrough-record.mjs
 * Out: docs/superpowers/qa/walkthrough/*.png (5 surfaces × light/dark + mobile 375)
 *      + video webm cho flow checkout chính + in manifest JSON.
 *
 * SURFACES: storefront (home/PLP/PDP/search/coupons) · shell+checkout (home/cart/
 * drawer/checkout/confirmation) · account (orders) · admin (dashboard/products/orders).
 * KHÔNG mutate data: KHÔNG đặt order thật (confirmation chỉ mở route guest-state),
 * KHÔNG toggle coupon. Login chỉ để viewer thấy trạng thái đã đăng nhập (user@demo.vn).
 */
import { chromium } from 'file:///Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa/frontend/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const EXEC = '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const OUT = '/Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa/docs/superpowers/qa/walkthrough';
const SF = 'http://127.0.0.1:3101';
const SHELL = 'http://localhost:5703';
const ADMIN = 'http://localhost:5707';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC });
const manifest = [];
const shot = async (page, name) => {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  manifest.push({ name, url: page.url() });
  console.log('shot', name);
};
const setTheme = async (page, theme) => {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
  await page.waitForTimeout(350);
};

// ---- desktop context (video ON cho flow chính) ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT + '/video', size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();

// STOREFRONT light+dark
await page.goto(SF + '/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `sf-home-${th}`); }
await page.goto(SF + '/c/dien-tu', { waitUntil: 'load', timeout: 30000 }).catch(() => page.goto(SF + '/c/cong-nghe', { waitUntil: 'load' }));
await page.waitForTimeout(800);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `sf-plp-${th}`); }
// PDP — vào từ PLP link đầu để slug sống
await page.locator('a[href*="/p/"]').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForURL(/\/p\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1000);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `sf-pdp-${th}`); }
await page.goto(SF + '/search?q=xiaomi', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
await setTheme(page, 'light'); await shot(page, 'sf-search-light');
await page.goto(SF + '/coupons', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
await setTheme(page, 'light'); await shot(page, 'sf-coupons-light');

// SHELL + CART + CHECKOUT (đi flow guest → thêm giỏ từ PDP hiện tại nếu còn)
await page.goto(SHELL + '/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `shell-home-${th}`); }
// thêm hàng từ storefront rồi sang shell/cart (cùng host khác port — cookie theo localhost nên guest cart vẫn chung)
await page.goto(SF + '/p/dien-thoai-xiaomi-redmi-13c', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
await page.getByRole('button', { name: /THÊM VÀO GIỎ|Thêm vào giỏ/i }).first().click({ timeout: 8000 }).catch(() => console.log('ATC skip (stock?)'));
await page.waitForTimeout(800);
await page.goto(SHELL + '/cart', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1000);
await setTheme(page, 'light'); await shot(page, 'shell-cart-light');
await setTheme(page, 'dark'); await shot(page, 'shell-cart-dark');
// mini-cart drawer: click cart badge
await page.locator('header [class*="cart"], [data-testid*="cart-badge"], [class*="cart-badge"]').first().click({ timeout: 8000 }).catch(() => console.log('drawer skip'));
await page.waitForTimeout(900);
await setTheme(page, 'light'); await shot(page, 'shell-drawer-light');
await page.keyboard.press('Escape').catch(() => {});
await page.goto(SHELL + '/checkout', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1000);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `shell-checkout-${th}`); }

// ACCOUNT (user login qua UI)
await page.goto(SHELL + '/account', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
if (/login|dang-nhap/.test(page.url())) {
  await page.getByLabel(/Email/i).first().fill('user@demo.vn').catch(() => {});
  await page.getByLabel(/Mật khẩu/i).first().fill('Demo#2026').catch(() => {});
  await page.getByRole('button', { name: /Đăng nhập/i }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
}
await page.goto(SHELL + '/account/orders', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
for (const th of ['light', 'dark']) { await setTheme(page, th); await shot(page, `account-orders-${th}`); }

// ADMIN (login admin)
await page.goto(ADMIN + '/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
if (/login/i.test(await page.content())) {
  await page.getByLabel(/Email/i).first().fill('admin@demo.vn').catch(() => {});
  await page.getByLabel(/Mật khẩu/i).first().fill('admin123').catch(() => {});
  await page.getByRole('button', { name: /Đăng nhập/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
}
for (const th of ['admin', 'admin-dark']) { await setTheme(page, th); await shot(page, `admin-dashboard-${th}`); }
await page.goto(ADMIN + '/products', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
for (const th of ['admin', 'admin-dark']) { await setTheme(page, th); await shot(page, `admin-products-${th}`); }
await page.goto(ADMIN + '/orders', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
await setTheme(page, 'admin'); await shot(page, 'admin-orders-admin');

await ctx.close(); // flush video

// ---- mobile 375 context (storefront + shell) ----
const mctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const mp = await mctx.newPage();
await mp.goto(SF + '/', { waitUntil: 'load', timeout: 30000 });
await mp.waitForTimeout(1200);
await shot(mp, 'mobile-sf-home-375');
await mp.goto(SF + '/p/dien-thoai-xiaomi-redmi-13c', { waitUntil: 'load', timeout: 30000 });
await mp.waitForTimeout(1000);
await shot(mp, 'mobile-sf-pdp-375-sticky');
await mp.goto(SHELL + '/cart', { waitUntil: 'load', timeout: 30000 });
await mp.waitForTimeout(1000);
await shot(mp, 'mobile-shell-cart-375');
await mctx.close();

await browser.close();
writeFileSync(OUT + '/manifest.json', JSON.stringify(manifest, null, 2));
console.log('DONE —', manifest.length, 'shots; video dir:', OUT + '/video');
