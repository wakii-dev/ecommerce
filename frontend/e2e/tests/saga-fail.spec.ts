import { expect, test } from '@playwright/test';
import { GATEWAY, SHELL, STOREFRONT, hasStripe } from '../helpers/env';
import { authedFetch, registerNewUser, type Session } from '../helpers/api';

/**
 * §5.7 SAGA FAIL (SF-10): payment fail → order FAILED + availability API hồi
 * phục (reservation released) + coupon dùng lại được (released).
 *
 * STRIPE parameterization (coordinator duyệt — REQUIREMENT-GAP FI-310):
 * - CÓ keys: card 4000…0002 → Stripe webhook payment_failed → order FAILED
 *   (đúng kịch bản decline §5.7).
 * - KHÔNG keys: POST /orders fail ngay tại bước intent (502
 *   payment_unconfigured) — CÙNG đường compensation §3.3 (CheckoutSaga catch
 *   → release inventory + coupon → order FAILED). Assert compensation như nhau.
 */

const STRIPE_READY = hasStripe();
const PENDING = '[PENDING-STRIPE-KEYS]';
const COUPON = 'WELCOME10';

let user: Session;

test.describe.configure({ mode: 'serial' });

async function availability(token: string, variantId: string): Promise<number> {
  const res = await authedFetch(
    `/api/inventory/availability?variantIds=${variantId}`,
    token
  );
  const body = res.body as { variantId?: string; available?: number }[] | null;
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error(`availability API ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return body[0].available ?? 0;
}

async function latestOrderStatus(token: string): Promise<{ status: string; id: string }> {
  const res = await authedFetch('/api/ordering/me/orders?page=1&size=1', token);
  const body = res.body as { items?: { id: string; status: string }[] };
  const first = body.items?.[0];
  if (!first) throw new Error(`my/orders ${res.status}: không có đơn`);
  return { status: first.status, id: first.id };
}

test('payment fail → FAILED + stock released + coupon reusable', async ({ page }) => {
  test.info().annotations.push({
    type: STRIPE_READY ? 'stripe-mode' : 'pending',
    description: STRIPE_READY ? 'declined card 4000…0002' : PENDING + ' payment_unconfigured path'
  });

  // ── login + pick variant id từ PDP (search Áo thun — khác golden path) ──
  user = await registerNewUser('saga');
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'Áo thun');
  await page.press('input[type=search][name=q]', 'Enter');
  const link = page.getByRole('link', { name: /Áo thun/i }).first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href')) ?? '';
  await link.click();
  await expect(page).toHaveURL(/\/p\//);

  // variantId từ gallery/selector: lấy từ nút variant đầu (data-attribute của PDP)
  // — fallback: đọc qua API product (public).
  const slug = href.split('/').pop() ?? '';
  const productRes = await page.request.get(`${GATEWAY}/api/catalog/products/${slug}`);
  const product = (await productRes.json()) as { variants?: { id: string }[] };
  const variantId = product.variants?.[0]?.id;
  expect(variantId, 'product có variant (pin §6.1.4)').toBeDefined();

  const before = await availability(user.accessToken, variantId!);
  expect(before).toBeGreaterThan(0);

  // ── login UI + add to cart ──
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mật khẩu').fill(user.password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
  await page.goBack(); // về PDP
  await page.getByRole('button', { name: 'THÊM VÀO GIỎ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm' })).toBeVisible({ timeout: 15_000 });

  // ── checkout + coupon ──
  await page.goto(`${SHELL}/checkout`);
  await page.getByLabel('Họ tên người nhận').fill('E2E Saga Tester');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Số nhà + đường').fill('12 Nguyen Hue');
  await page.getByLabel('Phường/xã').fill('Ben Nghe');
  await page.getByLabel('Quận/huyện').fill('Quan 1');
  await page.getByLabel('Tỉnh/thành phố').fill('TP. Hồ Chí Minh');
  await page.getByRole('button', { name: /Tiếp tục — chọn vận chuyển/ }).click();
  await page.getByRole('button', { name: /Tiếp tục — thanh toán/ }).click();
  await page.getByLabel('Mã giảm giá').fill(COUPON);
  await page.getByRole('button', { name: /Áp dụng/ }).click();
  await expect(page.locator('.coupon-applied')).toContainText(COUPON);
  await page.getByRole('button', { name: /Kiểm tra & tạo đơn/ }).click();

  if (STRIPE_READY) {
    // intent OK → PaymentElement → card declined 4000…0002
    await expect(page.locator('.pay-panel iframe')).toBeVisible({ timeout: 30_000 });
    const stripe = page.frameLocator('.pay-panel iframe');
    await stripe.locator('input[name=number], input[autocomplete=cc-number]').first().fill('4000 0000 0000 0002');
    await stripe.locator('input[name=expiry], input[autocomplete=cc-exp]').first().fill('12 / 34');
    await stripe.locator('input[name=cvc], input[autocomplete=cc-csc]').first().fill('123');
    await page.getByRole('button', { name: /Thanh toán bằng thẻ/ }).click();
    await expect(page.locator('.pay-error')).toBeVisible({ timeout: 30_000 }); // card_declined
  } else {
    // không keys: saga 502 ngay tại POST /orders — UI hiện lý do server
    await expect(page.locator('.pay-error')).toBeVisible({ timeout: 30_000 });
  }

  // ── assert compensation: đơn FAILED (poll — webhook path mất vài giây) ──
  await expect
    .poll(async () => (await latestOrderStatus(user.accessToken)).status, {
      timeout: STRIPE_READY ? 60_000 : 15_000,
      intervals: [2_000]
    })
    .toBe('FAILED');

  // availability hồi phục (reservation released)
  await expect
    .poll(async () => availability(user.accessToken, variantId!), {
      timeout: 30_000,
      intervals: [2_000]
    })
    .toBe(before);

  // coupon dùng lại được — validate vẫn valid=true (released, không consume)
  const validate = await fetch(`${GATEWAY}/api/ordering/orders/validate-coupon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: COUPON, subtotal: 500_000 })
  });
  const couponBody = (await validate.json()) as { valid: boolean };
  expect(validate.status).toBe(200);
  expect(couponBody.valid).toBe(true);
});
