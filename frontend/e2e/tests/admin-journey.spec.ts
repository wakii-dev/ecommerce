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
});
