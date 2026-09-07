import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, GATEWAY, SHELL, STOREFRONT, env } from '../helpers/env';
import { login } from '../helpers/api';

/**
 * §5.6 REVIEW FLOW (SF-10): user CÓ đơn CONFIRMED (seed eligibility cho
 * user@demo.vn — golden-path user khi có keys) viết review → admin duyệt
 * (API) → PDP hiện review + badge "Mua đã xác nhận".
 */
const DEMO_USER_EMAIL = env('DEMO_USER_EMAIL') || 'user@demo.vn';
const DEMO_USER_PASSWORD = env('DEMO_USER_PASSWORD') || 'Demo#2026';
const PENDING = '[PENDING-STRIPE-KEYS]';

test.describe.configure({ mode: 'serial' });

test('user viết review → PENDING → admin duyệt (API) → PDP hiện + badge verified', async ({ page }) => {
  const reviewText = `E2E review ${Date.now()} — sản phẩm đúng mô tả`;

  // ── 1. user demo (seeded eligibility) viết review trên PDP ──
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'Tai nghe');
  await page.press('input[type=search][name=q]', 'Enter');
  await page.getByRole('link', { name: /Tai nghe/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);

  await page.getByRole('button', { name: /Viết đánh giá/ }).first().click();
  // guest → modal yêu cầu đăng nhập: login ngay trong flow
  const needsLogin = await page.getByText(/đăng nhập/i).count();
  if (needsLogin > 0) {
    await page.goto(`${SHELL}/login`);
    await page.getByLabel('Email').fill(DEMO_USER_EMAIL);
    await page.getByLabel('Mật khẩu').fill(DEMO_USER_PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
    await page.goBack();
    await page.getByRole('button', { name: /Viết đánh giá/ }).first().click();
  } else {
    // modal mở cho guest → đóng, login, mở lại (session cookie port-agnostic)
    await page.goto(`${SHELL}/login`);
    await page.getByLabel('Email').fill(DEMO_USER_EMAIL);
    await page.getByLabel('Mật khẩu').fill(DEMO_USER_PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
    await page.goBack();
    await page.getByRole('button', { name: /Viết đánh giá/ }).first().click();
  }

  // modal: chọn 5 sao + nội dung + Gửi
  const dialog = page.getByRole('dialog', { name: /Viết đánh giá/ });
  await dialog.locator('button[aria-label*="5"], .rv-star').last().click();
  await dialog.locator('textarea, input[type=text]').last().fill(reviewText);
  await dialog.getByRole('button', { name: /Gửi đánh giá/ }).click();
  await expect(page.getByText(/đang chờ duyệt|pending/i).first()).toBeVisible({ timeout: 15_000 });

  // ── 2. admin duyệt (API — pack: "admin approve (API)") ──
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  // tìm review PENDING của user trên admin list
  const list = await fetch(`${GATEWAY}/api/catalog/admin/reviews?status=PENDING&size=50`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` }
  });
  expect(list.status).toBe(200);
  const pending = (await list.json()) as {
    items: { id: string; content: string; productId: string }[];
  };
  const mine = pending.items.find((r) => r.content === reviewText);
  expect(mine, 'review PENDING vừa tạo').toBeDefined();
  const approve = await fetch(`${GATEWAY}/api/catalog/admin/reviews/${mine!.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.accessToken}` }
  });
  expect(approve.status).toBe(200);

  // ── 3. PDP hiện review + badge "Mua đã xác nhận" (moderated → cache no-store) ──
  await expect
    .poll(async () => {
      await page.goto(page.url()); // reload PDP
      return (await page.getByText(reviewText).count()) > 0;
    }, { timeout: 60_000, intervals: [5_000] })
    .toBe(true);
  await expect(page.locator('.rv-verified').first()).toBeVisible();
});
