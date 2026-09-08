import { expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SHELL,
  STOREFRONT,
  hasStripe
} from '../helpers/env';
import {
  newCredentials,
  mailpitAttachmentNames,
  mailpitFindFor,
  mailpitMessages,
  registerNewUser,
  type Session
} from '../helpers/api';
import { clickPayWithRetry } from '../helpers/checkout';

/**
 * §5.2 GOLDEN PATH (SF-10): browse home → search → PDP (SEO SSR) → đăng ký
 * user mới (UI) → add to cart → coupon WELCOME10 → checkout → Stripe 4242 →
 * confirmation poll CONFIRMED → Mailpit email xác nhận → admin thấy đơn.
 *
 * SF-1 (FI-369): suite này CHẠY VỚI KEYS THẬT — test đầu hard-assert
 * hasStripe() (sk_test_* + pk_test_* + whsec_*) fail-loud thay vì silent
 * degrade. Payment PAID là webhook-only (payment_intent.succeeded) → thiếu
 * whsec/`make stripe-listen` = CONFIRMED không bao giờ tới. Regression
 * không-keys (payUnavailable 503 fail-loud): docs/demo-script.md — stripe
 * runbook (PaymentDegradedTest + UnconfiguredAdapter).
 *
 * user (API, beforeAll) dùng cho tests 4-7 — ĐỘC LẬP test 3 (UI register dùng
 * uiUser riêng: --grep một test không phá chuỗi phụ thuộc — live-verify r4).
 */

const STRIPE_READY = hasStripe();
const PENDING = '[PENDING-STRIPE-KEYS]';
// SF-1 FI-369: keys thật đã LIVE + E2E chạy full — marker chuyển trạng thái
const VERIFIED = '[VERIFIED-STRIPE]';
const STRIPE_TAG = STRIPE_READY ? VERIFIED : PENDING;

let uiUser: Session;
let user: Session;

/** Chọn variant trên PDP + click THÊM VÀO GIỎ kèm retry: response qua Next
 *  proxy lúc lạnh có thể >8s / click lost khi hydration — thử lại với chip
 *  kế tiếp (tối đa 3 lần). Trả POST response (determinstic assert — toast tự
 *  ẩn sau 2.5s). */
async function addFirstVariantToCart(page: import('@playwright/test').Page): Promise<import('@playwright/test').Response> {
  const swatch = page.locator('.pdp-swatch').first();
  if (await swatch.count()) await swatch.click();
  const chips = page.locator('.pdp-chips button');
  const chipCount = await chips.count();
  const addBtn = page.getByRole('button', { name: 'THÊM VÀO GIỎ' });
  let resp: import('@playwright/test').Response | null = null;
  for (let attempt = 0; attempt < 3 && !resp; attempt++) {
    if (chipCount > 0) await chips.nth(Math.min(attempt, chipCount - 1)).click();
    const addResponse = page.waitForResponse(
      (r) => r.url().includes('/api/cart/items') && r.request().method() === 'POST',
      { timeout: 8_000 }
    );
    await addBtn.click();
    resp = await addResponse.catch(() => null);
  }
  expect(resp, 'THÊM VÀO GIỎ phải fire POST /api/cart/items (3 lần thử)').not.toBeNull();
  expect(resp!.status(), await resp!.text().catch(() => '')).toBe(200);
  return resp!;
}

/** Login qua UI shell — chờ rời trang login (auto-navigate /account). */
async function uiLogin(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  uiUser = newCredentials('golden-ui');
  user = await registerNewUser('golden');
});

// SF-1: fail-loud đầu suite — keys/whsec thiếu → dừng ngay, không chạy silent-degrade
test('0 — Stripe keys live (hard-assert hasStripe)', () => {
  expect(
    STRIPE_READY,
    'Golden path cần Stripe keys thật: .env đủ STRIPE_SECRET_KEY=sk_test_*, ' +
      'VITE_STRIPE_PUBLISHABLE_KEY=pk_test_*, STRIPE_WEBHOOK_SECRET=whsec_* ' +
      '(+ `make stripe-listen` đang chạy để forward webhook). ' +
      'Chi tiết: README → "Webhook Stripe local (runbook)".'
  ).toBe(true);
});

test('1 — home SSR: header search + locale switcher + hero renders', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  await expect(page).toHaveTitle(/Shop VN|Cửa hàng|Ecommerce/i);
  await expect(page.locator('input[type=search][name=q]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Switch language/i })).toBeVisible();
});

test('2 — search ES "Tai nghe" → có kết quả; SEO view-source PDP có tên + giá + JSON-LD', async ({ page }) => {
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'Tai nghe');
  await page.press('input[type=search][name=q]', 'Enter');
  await expect(page).toHaveURL(/\/search\?q=/);
  // PLP/PDP link — seed SF-4 có "Tai nghe Redmi Buds 4"
  const firstPdpLink = page.getByRole('link', { name: /Tai nghe/i }).first();
  await expect(firstPdpLink).toBeVisible();

  // §5.10 view-source: HTML SSR chứa tên + giá + JSON-LD Product + OG
  const href = (await firstPdpLink.getAttribute('href')) ?? '';
  const pdpUrl = href.startsWith('http') ? href : `${STOREFRONT}${href}`;
  const viewSource = await page.request.get(pdpUrl);
  const html = await viewSource.text();
  expect(html).toMatch(/application\/ld\+json/); // JSON-LD Product schema
  expect(html).toMatch(/Tai nghe/i);             // tên SSR (không phải shell rỗng)
  expect(html).toMatch(/og:title/);              // OG tags
  expect(html).toMatch(/₫|VND|đ/);               // giá render server-side
});

test('3 — đăng ký user mới qua UI + đăng nhập', async ({ page }) => {
  await page.goto(`${SHELL}/register`);
  await page.getByLabel('Họ tên').fill('E2E Golden Tester');
  await page.getByLabel('Email').fill(uiUser.email);
  await page.getByLabel('Mật khẩu').fill(uiUser.password);
  const [regResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 15_000 }).catch(() => null),
    page.getByRole('button', { name: /Đăng ký/ }).click()
  ]);
  expect(regResp?.status(), 'register UI phải 201').toBe(201);
  // register auto-login → account page (header tên user + Vai trò CUSTOMER)
  await expect(page.locator('body')).toContainText(/Vai trò|CUSTOMER/i, {
    timeout: 15_000
  });
});

test('4 — PDP add to cart → cart badge → /cart thấy item', async ({ page }) => {
  await uiLogin(page, user.email, user.password);

  // PDP → THÊM VÀO GIỎ — product CÓ variant (uniqlo — order thật cần
  // variant_id có stock; Tai nghe 0-variant chỉ dùng cho search/SEO asserts)
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'uniqlo');
  await page.press('input[type=search][name=q]', 'Enter');
  await page.getByRole('link', { name: /uniqlo/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  await addFirstVariantToCart(page);

  // cart (shell) — item vừa thêm hiện (cart_token cookie port-agnostic)
  await page.goto(`${SHELL}/cart`);
  await expect(page.getByText(/uniqlo|Áo Thun|Áo thun/i).first()).toBeVisible();
});

test('5 — checkout: coupon WELCOME10 −10% → tạo đơn', async ({ page }) => {
  await uiLogin(page, user.email, user.password);

  // thêm hàng (context mới — cart_token cookie mới, item test 4 ở context cũ)
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'uniqlo');
  await page.press('input[type=search][name=q]', 'Enter');
  await page.getByRole('link', { name: /uniqlo/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  await addFirstVariantToCart(page);

  await page.goto(`${SHELL}/checkout`);
  // bước 1 địa chỉ
  await page.getByLabel('Họ tên người nhận').fill('E2E Golden Tester');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Số nhà + đường').fill('12 Nguyen Hue');
  await page.getByLabel('Phường/xã').fill('Ben Nghe');
  await page.getByLabel('Quận/huyện').fill('Quan 1');
  await page.getByLabel('Tỉnh/thành phố').fill('TP. Hồ Chí Minh');
  await page.getByRole('button', { name: /Tiếp tục — chọn vận chuyển/ }).click();
  await page.getByRole('button', { name: /Tiếp tục — thanh toán/ }).click();
  // bước 3 coupon
  await page.getByLabel('Mã giảm giá').fill('WELCOME10');
  await page.getByRole('button', { name: /Áp dụng/ }).click();
  await expect(page.locator('.coupon-applied')).toContainText('WELCOME10');
  await page.getByRole('button', { name: /Kiểm tra & tạo đơn/ }).click();

  if (!STRIPE_READY) {
    // Không keys: saga 502 tại bước payment → compensation → UI hiện lý do.
    // Đơn FAILED + stock released + coupon released (§5.7 path tương đương).
    await expect(page.locator('.pay-error')).toBeVisible({ timeout: 20_000 });
    test.info().annotations.push({ type: 'pending', description: PENDING });
    return;
  }

  // PaymentElement mount (Stripe thật)
  await expect(page.locator('.pay-panel iframe')).toBeVisible({ timeout: 30_000 });
  // điền thẻ 4242 trong Stripe iframe
  const stripe = page.frameLocator('.pay-panel iframe');
  await stripe.locator('input[name=number], input[autocomplete=cc-number]').first().fill('4242 4242 4242 4242');
  await stripe.locator('input[name=expiry], input[autocomplete=cc-exp]').first().fill('12 / 34');
  await stripe.locator('input[name=cvc], input[autocomplete=cc-csc]').first().fill('123');
  await clickPayWithRetry(page); // helper/checkout.ts — click lost khi layout shift

  // confirmation page — poll tới CONFIRMED
  await expect(page).toHaveURL(/\/order\/confirmation/, { timeout: 30_000 });
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status-code', 'CONFIRMED', {
    timeout: 60_000
  });
});

test(`6 — Mailpit email cảm ơn + attach PDF ${STRIPE_TAG}`, async () => {
  test.skip(!STRIPE_READY, PENDING);
  // email đến SAU khi order CONFIRMED (ordering → order.confirmed →
  // notification ThankYouMailer → invoice PDF) — poll Mailpit, không one-shot
  await expect
    .poll(async () => {
      const messages = await mailpitMessages();
      return mailpitFindFor(messages, user.email, 'Cảm ơn bạn đã mua hàng')?.ID ?? null;
    }, { timeout: 30_000, intervals: [2_000] })
    .not.toBeNull();
  const messages = await mailpitMessages();
  const mail = mailpitFindFor(messages, user.email, 'Cảm ơn bạn đã mua hàng');
  expect(mail, 'email cảm ơn cho user mới').toBeDefined();
  const attachments = await mailpitAttachmentNames(mail!.ID);
  expect(attachments.some((a) => a.endsWith('.pdf')), 'đính kèm PDF hóa đơn').toBe(true);
});

test(`7 — admin thấy đơn CONFIRMED trong admin orders ${STRIPE_TAG}`, async ({ page }) => {
  test.skip(!STRIPE_READY, PENDING);
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`${SHELL}/admin/orders`);
  // Cột KHÁCH HÀNG hiển thị TÊN + SĐT (không email — live-verify SF-1 08-09);
  // bảng sort mới→cũ: đơn CONFIRMED vừa tạo (test 5, tên địa chỉ test 5) = dòng đầu
  const newest = page.locator('tbody tr').first();
  await expect(newest).toContainText('E2E Golden Tester', { timeout: 20_000 });
  await expect(newest).toContainText('Đã xác nhận');
});
