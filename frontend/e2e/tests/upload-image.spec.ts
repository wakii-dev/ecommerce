import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, GATEWAY, SHELL, STOREFRONT } from '../helpers/env';
import { login } from '../helpers/api';

/**
 * SF-13 A3 (Task 12): admin upload ảnh MinIO trong product form → URL
 * /media/products/ hiện → lưu → PDP thấy ảnh thật. Product tạo trước qua
 * API (pattern admin-crud); UI leg: form edit → tab Ảnh → upload → Đăng bán.
 */
test.describe.configure({ mode: 'serial' });

const PRODUCT_NAME = `E2E Upload ${Date.now()}`;
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let adminToken = '';
let slugVi = `e2e-upload-${Date.now()}`;

test.beforeAll(async () => {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  adminToken = admin.accessToken;
  const catsRaw = (await (await fetch(`${GATEWAY}/api/catalog/categories`)).json()) as
    | { items?: { id: string }[] }
    | { id: string }[];
  const catList = Array.isArray(catsRaw) ? catsRaw : (catsRaw.items ?? []);
  const categoryId = catList[0]?.id;
  expect(categoryId, 'có category để gắn product').toBeDefined();
  const create = await fetch(`${GATEWAY}/api/catalog/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      nameI18n: { vi: PRODUCT_NAME, en: PRODUCT_NAME },
      descriptionI18n: { vi: `Mô tả ${PRODUCT_NAME}`, en: `Desc ${PRODUCT_NAME}` },
      slugVi,
      slugEn: `${slugVi}-en`,
      brand: 'E2E',
      status: 'PUBLISHED',
      price: 199000,
      categoryId,
      variants: [{ nameI18n: { vi: 'Đen' }, options: { color: 'Đen' }, priceDelta: 0, stock: 50 }]
    })
  });
  expect(create.status, await create.text()).toBe(201);
});

test('upload ảnh → URL /media → Đăng bán → PDP thấy ảnh', async ({ page }) => {
  // admin login (UI)
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Mật khẩu').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });

  // mở form edit product vừa tạo
  await page.goto(`${SHELL}/admin/products`);
  await page.getByRole('button', { name: /Sửa/ }).first().isVisible();
  const editButtons = page.locator('.admin-page button', { hasText: /Sửa/ });
  // tìm row chứa product mình → nút Sửa cùng hàng
  const row = page.locator('tr', { hasText: PRODUCT_NAME });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /Sửa/ }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}/);

  // tab Ảnh → upload
  await page.getByText(/^Ảnh$/, { exact: true }).click();
  await page.setInputFiles('input[type=file]', {
    name: 'e2e-upload.png',
    mimeType: 'image/png',
    buffer: PNG_1PX
  });
  const urlInput = page.locator('input[value^="/media/products/"]').first();
  await expect(urlInput).toBeVisible({ timeout: 15_000 });
  const uploadedUrl = await urlInput.inputValue();

  // Đăng bán (lưu + PUBLISHED)
  await page.getByRole('button', { name: /Đăng bán/ }).click();
  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 15_000 });

  // PDP thấy ảnh upload
  await page.goto(`${STOREFRONT}/vi/p/${slugVi}`);
  await expect(page.locator('img[src^="/media/products/"]').first()).toBeVisible({ timeout: 20_000 });
});
