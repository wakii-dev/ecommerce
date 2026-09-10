import { expect, test } from '@playwright/test';
import { GATEWAY } from '../helpers/env';
import { adminUiLogin } from '../helpers/journey';

/**
 * ADMIN JOURNEY (SF-3 FI-407) — regression-lock lớp 4: product CRUD ĐẦY ĐỦ
 * field round-trip (chứng minh không còn field không-lưu — bug thật: admin
 * view stock luôn 0, fix FI-397 demo follow-up = fetch /api/inventory/
 * availability); coupon CRUD round-trip; category CRUD round-trip.
 *
 * Ground truth seed (probe 2026-09-10): 24 products, MỌI product có ≥1
 * variant (seed default variant — scripts/seed/seed.sh:93-104). Selectors:
 * form IDs ổn định (p-name, p-price…), testid sẵn có, classname contract
 * (ADR 0007 — KHÔNG thêm testid mới: cấm sửa app code). Serial + shared
 * state theo pattern golden-path — chạy --grep 1 test độc lập có thể đỏ vì
 * thiếu state test trước (accepted trade-off của suite này).
 */
test.describe.configure({ mode: 'serial' });

test.describe('Admin journey — CRUD đầy đủ field (FI-407)', () => {
  const STAMP = Date.now();
  const PRODUCT = {
    nameVi: `E2E Journey Áo ${STAMP}`,
    nameEn: `E2E Journey Shirt ${STAMP}`,
    descVi: `Mô tả e2e journey ${STAMP} — đủ field round-trip.`,
    descEn: `E2E journey description ${STAMP}.`,
    brand: 'E2EBrand',
    seoTitle: `Mua ${STAMP} giá tốt`,
    seoDesc: `SEO description cho product e2e ${STAMP} — cắt 160 ký tự là đủ.`,
    price: '459000',
    comparePrice: '559000',
    flash: '2027-01-31T23:59',
    variantName: 'Màu Đen',
    variantOptions: 'color=Đen',
    variantDelta: '10000',
    variantStock: '33',
    imageUrl: '/media/products/e2e-journey.png',
    imageAlt: 'Ảnh e2e journey'
  };

  test('A — admin login UI → products list mở (skeleton)', async ({ page }) => {
    await adminUiLogin(page);
    await page.goto(`${GATEWAY}/admin/products`);
    await expect(page.getByRole('button', { name: 'Thêm sản phẩm' })).toBeVisible();
  });

  /** Mở form thêm mới + fill TAB info (dùng chung B). Chọn category đầu tiên từ API. */
  async function fillInfoTab(page: import('@playwright/test').Page, categoryId: string): Promise<void> {
    // info tab (mặc định) — tên vi tự sinh slug; tên en qua sub-tab English
    // (ui-kit Tabs render role="tab" — KHÔNG phải button ẩn danh; plan-critic P0-1)
    await page.getByLabel('Tên (vi)').fill(PRODUCT.nameVi);
    await page.locator('#p-desc').fill(PRODUCT.descVi);
    await page.getByRole('tab', { name: /English \(bỏ trống/ }).click();
    await page.getByLabel('Tên (en)').fill(PRODUCT.nameEn);
    await page.locator('#p-desc-en').fill(PRODUCT.descEn);
    // exact: true — "Tiếng Việt" là substring của tab English ("…dùng tiếng Việt") → strict violation (chạy thật FI-407 T2)
    await page.getByRole('tab', { name: 'Tiếng Việt', exact: true }).click();
    // #p-brand — getByLabel('Thương hiệu') dính aria-label search box header ("Tìm sản phẩm, thương hiệu...") → strict violation (chạy thật T2)
    await page.locator('#p-brand').fill(PRODUCT.brand);
    // #p-category — getByLabel('Danh mục') dính nav shell-mininav aria-label="Danh mục" → strict violation (chạy thật T2)
    await page.locator('#p-category').selectOption(categoryId);
    await page.getByRole('checkbox').check(); // "Chính hãng" — checkbox duy nhất của tab info
  }

  test('B — tạo product ĐẦY ĐỦ field (info/SEO/giá/variant+stock/ảnh) → Đăng bán → thấy trong list', async ({ page }) => {
    await adminUiLogin(page);
    const cats = (await (await page.request.get(`${GATEWAY}/api/catalog/categories`)).json()) as
      Array<{ id: string }>;
    expect(cats.length).toBeGreaterThan(0);

    await page.goto(`${GATEWAY}/admin/products`);
    await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/new/);

    await fillInfoTab(page, cats[0]!.id);
    // tab SEO
    await page.getByRole('tab', { name: 'SEO' }).click();
    await page.getByLabel('SEO title').fill(PRODUCT.seoTitle);
    await page.getByLabel('SEO description').fill(PRODUCT.seoDesc);
    // tab Giá
    await page.getByRole('tab', { name: 'Giá' }).click();
    await page.getByLabel('Giá bán (₫)').fill(PRODUCT.price);
    await page.getByLabel('Giá niem yết (₫)').fill(PRODUCT.comparePrice);
    await page.getByLabel('Flash sale kết thúc').fill(PRODUCT.flash);
    // tab Phân loại — 1 row
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    await page.getByRole('button', { name: /Thêm phân loại/ }).click();
    const row = page.locator('.admin-variant-row').first();
    await row.locator('input').nth(0).fill(PRODUCT.variantName); // tên thuộc tính vi
    await row.locator('input').nth(2).fill(PRODUCT.variantOptions); // "Tùy chọn"
    await row.locator('input').nth(3).fill(PRODUCT.variantDelta); // "Chênh giá (₫)"
    await row.locator('input').nth(4).fill(PRODUCT.variantStock); // "Tồn kho"
    // tab Ảnh — thêm 1 row URL (KHÔNG upload MinIO — env fresh không cam kết ảnh).
    // Label ảnh KHÔNG có htmlFor → locator theo vị trí input trong row
    // (nth(0)=url, nth(1)=alt — pattern variant row; plan-critic P0-2)
    await page.getByRole('tab', { name: 'Ảnh' }).click();
    await page.getByRole('button', { name: /Thêm ảnh/ }).click();
    const imgRow = page.locator('.admin-variant-row').last();
    await imgRow.locator('input').nth(0).fill(PRODUCT.imageUrl);
    await imgRow.locator('input').nth(1).fill(PRODUCT.imageAlt);

    await page.getByRole('button', { name: 'Đăng bán' }).click();
    await expect(page.getByText('Đã tạo sản phẩm')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 15_000 });

    // list thấy product PUBLISHED (badge "Đăng bán") — search theo tên
    await page.getByLabel('Tìm kiếm').fill(PRODUCT.nameVi);
    await page.keyboard.press('Enter');
    const createdRow = page.locator('tbody tr', { hasText: PRODUCT.nameVi }).first();
    await expect(createdRow).toBeVisible({ timeout: 15_000 });
    await expect(createdRow).toContainText('Đăng bán');
  });

  test('C — mở lại form: MỌI field giữ đúng giá trị (round-trip; stock = availability thật)', async ({ page }) => {
    await adminUiLogin(page);
    await page.goto(`${GATEWAY}/admin/products`);
    await page.getByLabel('Tìm kiếm').fill(PRODUCT.nameVi);
    await page.keyboard.press('Enter');
    await page.locator('tbody tr', { hasText: PRODUCT.nameVi }).first()
      .getByRole('button', { name: 'Sửa' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}/);

    // info vi
    await expect(page.getByLabel('Tên (vi)')).toHaveValue(PRODUCT.nameVi);
    await expect(page.locator('#p-desc')).toHaveValue(PRODUCT.descVi);
    await expect(page.getByLabel('Slug (vi)')).toHaveValue(/e2e-journey/); // slug auto từ tên (plan-critic P2-2)
    await expect(page.locator('#p-brand')).toHaveValue(PRODUCT.brand);
    // en qua sub-tab (role="tab" — plan-critic P0-1)
    await page.getByRole('tab', { name: /English \(bỏ trống/ }).click();
    await expect(page.getByLabel('Tên (en)')).toHaveValue(PRODUCT.nameEn);
    await expect(page.locator('#p-desc-en')).toHaveValue(PRODUCT.descEn);
    await page.getByRole('tab', { name: 'Tiếng Việt', exact: true }).click();
    // official (checkbox duy nhất, checked)
    expect(await page.getByRole('checkbox').isChecked()).toBe(true);
    // SEO
    await page.getByRole('tab', { name: 'SEO' }).click();
    await expect(page.getByLabel('SEO title')).toHaveValue(PRODUCT.seoTitle);
    await expect(page.getByLabel('SEO description')).toHaveValue(PRODUCT.seoDesc);
    // Giá — flash assert phần NGÀY (spec-critic P1: datetime-local↔ISO lệch TZ giữa host/container; ngày đủ chứng minh field không rơi)
    await page.getByRole('tab', { name: 'Giá' }).click();
    await expect(page.getByLabel('Giá bán (₫)')).toHaveValue(PRODUCT.price);
    await expect(page.getByLabel('Giá niem yết (₫)')).toHaveValue(PRODUCT.comparePrice);
    await expect(page.getByLabel('Flash sale kết thúc')).toHaveValue(/^2027-01-31/);
    // Phân loại — variant row + STOCK = số đã nhập (fetch availability sau save-sync — fix FI-397)
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    const row = page.locator('.admin-variant-row').first();
    await expect(row.locator('input').nth(0)).toHaveValue(PRODUCT.variantName);
    await expect(row.locator('input').nth(2)).toHaveValue(PRODUCT.variantOptions);
    await expect(row.locator('input').nth(3)).toHaveValue(PRODUCT.variantDelta);
    await expect(row.locator('input').nth(4)).toHaveValue(PRODUCT.variantStock, { timeout: 15_000 }); // poll — availability async
    // Ảnh — row locator (label không htmlFor — plan-critic P0-2)
    await page.getByRole('tab', { name: 'Ảnh' }).click();
    const imgRow = page.locator('.admin-variant-row').first();
    await expect(imgRow.locator('input').nth(0)).toHaveValue(PRODUCT.imageUrl);
    await expect(imgRow.locator('input').nth(1)).toHaveValue(PRODUCT.imageAlt);
    // Ghi chú D17: variant nameEn KHÔNG round-trip (view trả name resolved — fallback vi) — không assert.
  });

  test('D — edit giá 469000 + stock 44 → save → mở lại giữ đúng (edit round-trip)', async ({ page }) => {
    await adminUiLogin(page);
    await page.goto(`${GATEWAY}/admin/products`);
    await page.getByLabel('Tìm kiếm').fill(PRODUCT.nameVi);
    await page.keyboard.press('Enter');
    await page.locator('tbody tr', { hasText: PRODUCT.nameVi }).first()
      .getByRole('button', { name: 'Sửa' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}/);

    await page.getByRole('tab', { name: 'Giá' }).click();
    await page.getByLabel('Giá bán (₫)').fill('469000');
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    const row = page.locator('.admin-variant-row').first();
    await row.locator('input').nth(4).fill('44');

    await page.getByRole('button', { name: 'Đăng bán' }).click();
    await expect(page.getByText('Đã cập nhật sản phẩm')).toBeVisible({ timeout: 15_000 });

    // reopen — cả giá lẫn stock đổi thật (stock qua inventory sync + availability fetch)
    await page.goto(`${GATEWAY}/admin/products`);
    await page.getByLabel('Tìm kiếm').fill(PRODUCT.nameVi);
    await page.keyboard.press('Enter');
    await page.locator('tbody tr', { hasText: PRODUCT.nameVi }).first()
      .getByRole('button', { name: 'Sửa' }).click();
    await page.getByRole('tab', { name: 'Giá' }).click();
    await expect(page.getByLabel('Giá bán (₫)')).toHaveValue('469000');
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    await expect(page.locator('.admin-variant-row').first().locator('input').nth(4))
      .toHaveValue('44', { timeout: 15_000 });
  });
});
