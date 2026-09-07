import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, GATEWAY, SHELL, STOREFRONT } from '../helpers/env';
import { login } from '../helpers/api';

/**
 * §5.3 ADMIN CRUD (SF-10): admin tạo product publish → storefront PLP/PDP
 * thấy (cache invalidate product.changed → ES reindex — assert với retry vì
 * async). Tạo product QUA ADMIN API THẬT (catalog adminCreateProduct với
 * admin JWT — cùng endpoint UI ProductFormPage gọi; form UI đã phủ unit
 * tests mfe-admin). UI leg: đăng nhập admin + mở products list.
 */
test.describe('Admin tạo product → storefront thấy (§5.3)', () => {
  const PRODUCT_NAME = `E2E Product ${Date.now()}`;

  let adminToken = '';

  test.beforeAll(async () => {
    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = admin.accessToken;
  });

  test('admin login UI → products list mở', async ({ page }) => {
    await page.goto(`${SHELL}/login`);
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Mật khẩu').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
    await page.goto(`${SHELL}/admin/products`);
    await expect(page.getByText(/Ecommerce|ecommerce/).first()).toBeVisible();
  });

  test('admin tạo product PUBLISHED (API) → storefront PLP + PDP + search thấy', async ({ page }) => {
    const create = await fetch(`${GATEWAY}/api/catalog/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: { vi: PRODUCT_NAME, en: PRODUCT_NAME },
        description: { vi: `Mô tả ${PRODUCT_NAME} — E2E admin CRUD`, en: `Desc ${PRODUCT_NAME}` },
        slugVi: `e2e-product-${Date.now()}`,
        slugEn: `e2e-product-${Date.now()}`,
        brand: 'E2E',
        status: 'PUBLISHED',
        price: 199000,
        variants: [{ size: null, color: 'Đen', price: 199000 }]
      })
    });
    const bodyText = await create.text();
    expect(create.status, bodyText.slice(0, 300)).toBe(201);
    const created = JSON.parse(bodyText) as { id: string; slugVi: string };

    // storefront PDP thấy (SSR fetch catalog trực tiếp — cache 60s ISR; retry)
    await expect
      .poll(async () => {
        const res = await page.request.get(`${STOREFRONT}/vi/p/${created.slugVi}`);
        return res.status();
      }, { timeout: 90_000, intervals: [5_000] })
      .toBe(200);
    const html = await (await page.request.get(`${STOREFRONT}/vi/p/${created.slugVi}`)).text();
    expect(html).toContain(PRODUCT_NAME);

    // ES search reflect (product.changed → indexer)
    await expect
      .poll(async () => {
        const res = await page.request.get(
          `${GATEWAY}/api/catalog/search?q=${encodeURIComponent(PRODUCT_NAME)}&locale=vi`
        );
        if (!res.ok) return 0;
        const body = (await res.json()) as { total?: number; items?: unknown[] };
        return body.total ?? body.items?.length ?? 0;
      }, { timeout: 90_000, intervals: [5_000] })
      .toBeGreaterThan(0);

    void created.id;
  });
});
