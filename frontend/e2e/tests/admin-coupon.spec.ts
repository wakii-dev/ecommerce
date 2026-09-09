import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, GATEWAY, SHELL, STOREFRONT } from '../helpers/env';
import { login, registerNewUser } from '../helpers/api';

/**
 * FI-369 SF-2 (A3): admin coupon CRUD end-to-end — KHÔNG cần Stripe keys
 * (COD checkout: assert sau RESERVED/FINALIZED — CONFIRMED, chưa PAID).
 * Flow: admin tạo coupon (UI form) → customer COD checkout dùng mã →
 * usedCount tăng → toggle off → validate fail → toggle on → pass lại.
 * Seed parity: WELCOME10/GIAM50K hiển thị đúng qua admin list mới.
 */
test.describe.configure({ mode: 'serial' });

// [A-Za-z0-9] — khớp regex BE ^[A-Za-z0-9_-]{1,64}$
const CODE = `E2EC${Date.now().toString(36).toUpperCase()}`;

interface AdminCoupon {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue?: number;
  usageLimit?: number;
  usedCount: number;
  active: boolean;
}

let adminToken = '';
let customer: { email: string; password: string };

async function adminCouponApi(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${GATEWAY}/api/ordering/admin/coupons${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function adminList(): Promise<AdminCoupon[]> {
  const res = await adminCouponApi('GET', '');
  expect(res.status, 'GET admin/coupons phải 200').toBe(200);
  return (await res.json()) as AdminCoupon[];
}

/** Login qua UI shell — chờ rời trang login (pattern golden-path). */
async function uiLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
}

test.beforeAll(async () => {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  adminToken = admin.accessToken;
  customer = await registerNewUser('e2ecoupon');
});

test('seed parity: admin list trả WELCOME10/GIAM50K đủ shape usage (T9)', async () => {
  const list = await adminList();
  const welcome = list.find((c) => c.code === 'WELCOME10');
  expect(welcome, 'WELCOME10 có trong admin list (make seed / flyway V14)').toBeDefined();
  expect(welcome!.type).toBe('PERCENT');
  expect(welcome!.usageLimit).toBe(100);
  expect(welcome!.active).toBe(true);
  expect(typeof welcome!.usedCount).toBe('number');

  const giam = list.find((c) => c.code === 'GIAM50K');
  expect(giam, 'GIAM50K có trong admin list').toBeDefined();
  expect(giam!.type).toBe('FIXED');
  expect(giam!.value).toBe(50000);
});

test('admin tạo coupon qua UI form → list thấy, usedCount 0', async ({ page }) => {
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`${SHELL}/admin/coupons`);

  // mở form + điền (PERCENT 15%, min 100k, limit 10)
  await page.getByTestId('coupon-create-btn').click();
  await page.getByLabel('Mã', { exact: true }).fill(CODE);
  await page.getByLabel('Giá trị').fill('15');
  await page.getByLabel('Đơn tối thiểu (₫)').fill('100000');
  await page.getByLabel('Lượt dùng').fill('10');
  await page.getByTestId('coupon-submit-btn').click();

  // list thấy mã mới (toast + row)
  await expect(page.getByText(CODE).first()).toBeVisible({ timeout: 10_000 });

  // API list xác nhận shape admin view
  const row = (await adminList()).find((c) => c.code === CODE);
  expect(row, 'coupon vừa tạo nằm trong GET admin list').toBeDefined();
  expect(row!.value).toBe(15);
  expect(row!.usageLimit).toBe(10);
  expect(row!.usedCount).toBe(0);
  expect(row!.active).toBe(true);
});

test('customer COD checkout dùng mã → usedCount tăng (không cần Stripe)', async ({ page }) => {
  await uiLogin(page, customer.email, customer.password);

  // PDP uniqlo → add variant (pattern cod-checkout)
  await page.goto(`${STOREFRONT}/vi`);
  await page.fill('input[type=search][name=q]', 'uniqlo');
  await page.press('input[type=search][name=q]', 'Enter');
  await page.getByRole('link', { name: /uniqlo/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);
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
  expect(resp, 'THÊM VÀO GIỎ phải fire POST /api/cart/items').not.toBeNull();

  // checkout 3 bước (subtotal > 100k để pass minOrder) + áp coupon
  await page.goto(`${SHELL}/checkout`);
  await page.getByLabel('Họ tên người nhận').fill('Coupon E2E Tester');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Số nhà + đường').fill('12 Nguyen Hue');
  await page.getByLabel('Phường/xã').fill('Ben Nghe');
  await page.getByLabel('Quận/huyện').fill('Quan 1');
  await page.getByLabel('Tỉnh/thành phố').fill('TP. Hồ Chí Minh');
  await page.getByRole('button', { name: /Tiếp tục — chọn vận chuyển/ }).click();
  await page.getByRole('button', { name: /Tiếp tục — thanh toán/ }).click();

  // áp mã ở bước thanh toán — validate realtime phải PASS
  await page.getByLabel('Mã giảm giá').fill(CODE);
  await page.getByRole('button', { name: /Áp dụng/ }).click();
  await expect(page.locator('.coupon-error')).toHaveCount(0);

  // COD → CONFIRMED (reserve + finalize — không Stripe)
  await page.getByTestId('payment-method-cod').check();
  await page.getByRole('button', { name: /Đặt hàng COD/ }).click();
  await expect(page).toHaveURL(/\/order\/confirmation/, { timeout: 30_000 });
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status-code', 'CONFIRMED', {
    timeout: 30_000
  });

  // usedCount tăng trong admin list (poll — finalize async qua saga event)
  await expect
    .poll(async () => (await adminList()).find((c) => c.code === CODE)?.usedCount ?? -1, {
      timeout: 30_000,
      intervals: [2_000]
    })
    .toBe(1);
});

test('toggle off → validate fail; toggle on → pass lại (N4)', async ({ page }) => {
  // validate-coupon dùng customer token (public endpoint, token an toàn)
  const session = await login(customer.email, customer.password);
  const validate = async (): Promise<{ valid: boolean; message?: string }> => {
    const res = await fetch(`${GATEWAY}/api/ordering/orders/validate-coupon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`
      },
      body: JSON.stringify({ code: CODE, subtotal: 500000 })
    });
    return (await res.json()) as { valid: boolean; message?: string };
  };

  // OFF qua API toggle flip (POST /{code}/toggle — contract A3 a205cbf)
  const off = await adminCouponApi('POST', `/${CODE}/toggle`);
  expect(off.status, 'toggle off phải 200').toBe(200);
  const invalid = await validate();
  expect(invalid.valid).toBe(false);
  expect(invalid.message).toContain('không còn hiệu lực');

  // UI phản ánh trạng thái inactive
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`${SHELL}/admin/coupons`);
  await expect(page.getByTestId(`coupon-toggle-${CODE}`)).toHaveText(/Tắt/i, { timeout: 10_000 });

  // ON → flip lần 2, dùng được lại
  const on = await adminCouponApi('POST', `/${CODE}/toggle`);
  expect(on.status).toBe(200);
  expect((await validate()).valid).toBe(true);
});

test('delete coupon chưa reservation → 204; đã reservation → 409 N4', async () => {
  // mã E2E vừa dùng (đã FINALIZED reservation) → bị chặn xóa (409 + lịch sử)
  const blocked = await adminCouponApi('DELETE', `/${CODE}`);
  expect(blocked.status).toBe(409);
  const blockedBody = (await blocked.json()) as { detail?: string };
  expect(blockedBody.detail ?? '').toContain('lịch sử');

  // mã mới chưa từng dùng → xóa được
  const fresh = `E2ED${Date.now().toString(36).toUpperCase()}`;
  const created = await adminCouponApi('POST', '', {
    code: fresh,
    type: 'FIXED',
    value: 10000,
    description: 'e2e delete-fresh'
  });
  expect(created.status).toBe(201);
  const del = await adminCouponApi('DELETE', `/${fresh}`);
  expect(del.status).toBe(204);
  expect((await adminList()).find((c) => c.code === fresh)).toBeUndefined();
});
