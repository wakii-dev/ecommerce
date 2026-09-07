import { expect, test } from '@playwright/test';
import { SHELL, STOREFRONT } from '../helpers/env';
import { registerNewUser } from '../helpers/api';

/**
 * SF-13 A2 (Task 12): checkout chọn COD → đơn CONFIRMED KHÔNG cần Stripe
 * (clientSecret null — saga bỏ bước intent, confirm sau reserve).
 */
test.describe.configure({ mode: 'serial' });

/** Login qua UI shell — chờ rời trang login (pattern golden-path). */
async function uiLogin(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
}

let user: { email: string; password: string };

test.beforeAll(async () => {
  user = await registerNewUser('cod13');
});

test('COD checkout → confirmation CONFIRMED không đụng Stripe', async ({ page }) => {
  await uiLogin(page, user.email, user.password);

  // PDP → add variant (uniqlo — có variant stock như golden path);
  // retry 3 lần như golden-path (hydration lạnh làm mất click)
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
  expect(resp!.status()).toBe(200);

  // checkout 3 bước
  await page.goto(`${SHELL}/checkout`);
  await page.getByLabel('Họ tên người nhận').fill('COD E2E Tester');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Số nhà + đường').fill('12 Nguyen Hue');
  await page.getByLabel('Phường/xã').fill('Ben Nghe');
  await page.getByLabel('Quận/huyện').fill('Quan 1');
  await page.getByLabel('Tỉnh/thành phố').fill('TP. Hồ Chí Minh');
  await page.getByRole('button', { name: /Tiếp tục — chọn vận chuyển/ }).click();
  await page.getByRole('button', { name: /Tiếp tục — thanh toán/ }).click();

  // chọn COD
  await page.getByTestId('payment-method-cod').check();
  await expect(page.getByTestId('cod-note')).toBeVisible();

  // đặt hàng — KHÔNG có Stripe iframe / pay panel
  await expect(page.locator('.pay-panel iframe')).toHaveCount(0);
  await page.getByRole('button', { name: /Đặt hàng COD/ }).click();

  // confirmation — COD đã CONFIRMED ngay (sau reserve), poll dừng sớm
  await expect(page).toHaveURL(/\/order\/confirmation/, { timeout: 30_000 });
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status-code', 'CONFIRMED', {
    timeout: 30_000
  });
});
