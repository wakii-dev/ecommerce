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

/** Chọn variant hợp lệ trên PDP: quét chip size (màu giữ swatch đầu) đến khi
 *  nút THÊM VÀO GIỎ bật — tổ hợp đầu không phải variant thật (3 variant/6
 *  combo — live-verify r3). */
async function selectFirstVariant(page: import('@playwright/test').Page): Promise<void> {
  const swatch = page.locator('.pdp-swatch').first();
  if (await swatch.count()) await swatch.click();
  const chips = page.locator('.pdp-chips button');
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click();
    const add = page.getByRole('button', { name: 'THÊM VÀO GIỎ' });
    if (await add.isEnabled()) return;
  }
}
test.describe.configure({ mode: 'serial' });

test('user viết review → PENDING → admin duyệt (API) → PDP hiện + badge verified', async ({ page }) => {
  const reviewText = `E2E review ${Date.now()} — sản phẩm đúng mô tả`;

  // ── 1. user demo (seeded eligibility) viết review trên PDP ──
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'Tai nghe');
  await page.press('input[type=search][name=q]', 'Enter');
  await page.getByRole('link', { name: /Tai nghe/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const pdpUrl = page.url();

  // LOGIN TRƯỚC (đơn giản hoá — guest modal path đã biết cần login):
  // shell login → quay lại PDP bằng URL trực tiếp (goBack không restore
  // tab/state — live-verify r2)
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(DEMO_USER_EMAIL);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(DEMO_USER_PASSWORD);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
  await page.goto(pdpUrl);

  // CLEANUP state run trước: review (user, product) là UNIQUE — review E2E
  // cũ (đã APPROVED) chặn viết lại (409 "Bạn đã đánh giá sản phẩm này rồi").
  // Xoá review E2E cũ + review_eligibility giữ nguyên (badge vẫn xanh).
  {
    const { pgExec } = await import('../helpers/api');
    const slug = pdpUrl.split('/p/')[1]?.replace(/\/$/, '') ?? '';
    const pid = await pgExec('db_catalog', `SELECT id FROM products WHERE slug_vi='${slug}'`);
    if (pid) {
      const uid = await pgExec('db_identity', `SELECT id FROM users WHERE email='${DEMO_USER_EMAIL}'`);
      await pgExec('db_catalog', `DELETE FROM reviews WHERE user_id='${uid}' AND product_id='${pid}' AND content LIKE 'E2E review%'`);
    }
  }

  // reviews là TAB PANEL ẩn (#tab-reviews) — click tab trước (live-verify r1)
  const reviewTab = page.getByRole('link', { name: 'Đánh giá' });
  if (await reviewTab.count()) await reviewTab.first().click();

  await page.getByRole('button', { name: /Viết đánh giá/ }).first().click();

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
  // badge nằm trong tab panel ẩn — mở tab Đánh giá trước khi assert
  const badgeTab = page.getByRole('link', { name: 'Đánh giá' });
  if (await badgeTab.count()) await badgeTab.first().click();
  await expect(page.locator('.rv-verified').first()).toBeVisible();
});
