# SF-3 Journey-Specs (FI-407) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2 Playwright journey specs regression-lock 3 bug thật lớp 3/4/5 (variant-less kẹt checkout; admin stock view 0; stale env) — GREEN trên fresh-boot env :8080.

**Architecture:** E2E-only (không đụng app code) — specs neo vào selector ổn định hiện có (form IDs `p-*`/`cat-*`/`coupon-*`, testid sẵn có, classname contract theo ADR 0007); fetch-id runtime qua public API (không hardcode UUID — fresh wipe đổi id); số thật từ seed (Nokia 590.000₫/stock 50; Biti's Đỏ/40 799.000₫ = base 749.000 + delta 50.000); checkout leg COD (không cần Stripe); stale-cart inject qua redis-cli.

**Tech Stack:** Playwright (`@playwright/test`, serial, workers=1 — config GIỮ nguyên) · TypeScript e2e (`frontend/e2e`) · docker exec redis-cli (inject) · env one-origin `:8080`.

**Linear Issue:** FI-407 · Spec: `docs/superpowers/specs/2026-09-10-fi407-journey-specs-design.md` (spec-critic PROCEED @3ec5639)

---

## Prerequisites (mỗi executor phải verify trước khi chạy task đầu)

```bash
cd /Users/hoivu/orca/workspaces/ecommerce/sf-3-journey-specs
# 1. Env sống (coordinator-managed — KHÔNG down -v, KHÔNG chạy harness):
curl -4 -s -o /dev/null -w "%{http_code}\n" -m 5 http://localhost:8080/actuator/health   # → 200
# 2. Deps (đã cài 2026-09-10 — nếu node_modules thiếu):
cd frontend && pnpm install && cd ..
# 3. Playwright discovery:
cd frontend && pnpm --filter @ecommerce/e2e exec playwright test --list 2>&1 | tail -1   # → "59 tests in 15 files" (baseline; tăng sau khi thêm spec)
```

**Lệnh chạy chuẩn (dùng ở MỌI task — cú pháp e2e-full.md:64, KHÔNG có flag `--run`):**

```bash
cd /Users/hoivu/orca/workspaces/ecommerce/sf-3-journey-specs/frontend
GATEWAY_URL=http://localhost:8080 E2E_STOREFRONT_URL=http://localhost:8080 \
E2E_SHELL_URL=http://localhost:8080 MAILPIT_API=http://localhost:8025 \
pnpm --filter @ecommerce/e2e exec playwright test tests/<spec>.spec.ts
```

**Chạy một test duy nhất:** thêm `--grep "<tên test>"`.

**Biến môi trường fresh-boot (ground truth probe 2026-09-10):**

| Hằng | Giá trị | Nguồn |
|---|---|---|
| ADMIN | `admin@demo.vn` / `admin123` (helpers/env, không hardcode chỗ khác) | seed |
| Nokia slug | `dien-thoai-nokia-110-2023` — price 590000, 1 variant (default, không color/size), availability 50 | db_catalog/db_inventory |
| Biti's slug | `giay-sneaker-bitis-hunter-street` — base 749000; variant "Đỏ / 40" price 799000 (delta +50000); "Đen / 41" price null | SeedData.java:133-141 |
| PDP giá | `.pdp-price` = `formatVnd(base+delta)` → `590.000 ₫` / `799.000 ₫` (dấu chấm nghìn + space + ₫) | storefront lib/format |
| Checkout POST | `/api/ordering/orders` (qua gateway), header `Idempotency-Key` BẮT BUỘC (UI tự gửi) | orderingApi.ts:160 |
| variantId null ở checkout | 400 `errors[]: items[0].variantId must not be null` → UI `.pay-error` (role=alert) | probe sống |
| Redis key | `cart:guest:<cart_token>` — CartDocument JSON {items[{id,productId,variantId,qty,slug,name,image,unitPrice,unavailable}], updatedAt, email} | CartStore.java:42 |
| Merge-on-login | checkout remote chrome (CartBadge header) watch authStore flip → POST `/api/cart/merge`; guest token localStorage same-origin :8080 | mfe-checkout bootstrap.tsx |

**Quy tắc chạy đỏ:** test đỏ vì APP sai hành vi fix (không phải selector/spec sai) → KHÔNG sửa app — ghi bug-register (bug thật, escalate SF-4), báo BLOCKED kèm evidence. Selector sai → sửa spec.

---

### Task 1: Skeleton admin-journey.spec.ts + helper re-login (bracket: spec-admin-journey-skeleton-login-helper)

**Files:**
- Create: `frontend/e2e/helpers/journey.ts`
- Create: `frontend/e2e/tests/admin-journey.spec.ts`

- [ ] **Step 1: Viết helper `frontend/e2e/helpers/journey.ts`**

```typescript
/**
 * helpers/journey.ts (SF-3 FI-407) — helper dùng chung 2 journey specs mới.
 * KHÔNG sửa helpers hiện có (env/api/checkout — pack touch map). Credentials
 * admin lấy từ helpers/env (ADMIN_EMAIL/ADMIN_PASSWORD — .env hoặc seed
 * default) — KHÔNG hardcode secret trong spec (security-audit gate).
 * Re-login ĐẦU MỖI SECTION (JWT 15' — pack §3; không giữ storageState xuyên 15').
 */
import { expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, SHELL } from './env';

/** UI login (email bất kỳ) — chờ rời /login. Pattern uiLogin golden-path. */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
}

/** UI login ADMIN → khu quản trị mở. */
export async function adminUiLogin(page: Page): Promise<void> {
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}
```

- [ ] **Step 2: Viết skeleton `frontend/e2e/tests/admin-journey.spec.ts`**

```typescript
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
```

- [ ] **Step 3: Chạy trên env sống**

Chạy: lệnh chuẩn ở header với `tests/admin-journey.spec.ts`
Expected: **1 passed** (login admin UI qua :8080 một origin).

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/helpers/journey.ts frontend/e2e/tests/admin-journey.spec.ts
git commit -m "test(qa): admin-journey skeleton + re-login helper mỗi section (FI-407 T1)"
```

---

### Task 2: Product create đầy đủ field + round-trip reopen (bracket: admin-product-crud-full-fields-roundtrip)

**Files:**
- Modify: `frontend/e2e/tests/admin-journey.spec.ts` (thêm 2 test vào describe)

- [ ] **Step 1: Thêm test "B — tạo product đầy đủ field → Đăng bán"** vào trong `test.describe` (sau test A)

```typescript
  /** Mở form thêm mới + fill TAB info (dùng chung B). Chọn category đầu tiên từ API. */
  async function fillInfoTab(page: import('@playwright/test').Page, categoryId: string): Promise<void> {
    // info tab (mặc định) — tên vi tự sinh slug; tên en qua sub-tab English
    await page.getByLabel('Tên (vi)').fill(PRODUCT.nameVi);
    await page.locator('#p-desc').fill(PRODUCT.descVi);
    await page.getByRole('button', { name: /English \(bỏ trống/ }).click();
    await page.getByLabel('Tên (en)').fill(PRODUCT.nameEn);
    await page.locator('#p-desc-en').fill(PRODUCT.descEn);
    await page.getByRole('button', { name: 'Tiếng Việt' }).click();
    await page.getByLabel('Thương hiệu').fill(PRODUCT.brand);
    await page.getByLabel('Danh mục').selectOption(categoryId);
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
    // tab Ảnh — thêm 1 row URL (KHÔNG upload MinIO — env fresh không cam kết ảnh)
    await page.getByRole('tab', { name: 'Ảnh' }).click();
    await page.getByRole('button', { name: /Thêm ảnh/ }).click();
    await page.getByLabel('URL ảnh').fill(PRODUCT.imageUrl);
    await page.getByLabel('Mô tả ảnh (alt)').fill(PRODUCT.imageAlt);

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
```

- [ ] **Step 2: Thêm test "C — round-trip reopen assert TỪNG field"**

```typescript
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
    await expect(page.getByLabel('Slug (vi)')).not.toBeHidden();
    await expect(page.getByLabel('Thương hiệu')).toHaveValue(PRODUCT.brand);
    // en qua sub-tab
    await page.getByRole('button', { name: /English \(bỏ trống/ }).click();
    await expect(page.getByLabel('Tên (en)')).toHaveValue(PRODUCT.nameEn);
    await expect(page.locator('#p-desc-en')).toHaveValue(PRODUCT.descEn);
    await page.getByRole('button', { name: 'Tiếng Việt' }).click();
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
    // Ảnh
    await page.getByRole('tab', { name: 'Ảnh' }).click();
    await expect(page.getByLabel('URL ảnh')).toHaveValue(PRODUCT.imageUrl);
    await expect(page.getByLabel('Mô tả ảnh (alt)')).toHaveValue(PRODUCT.imageAlt);
    // Ghi chú D17: variant nameEn KHÔNG round-trip (view trả name resolved — fallback vi) — không assert.
  });
```

- [ ] **Step 3: Chạy cả describe trên env sống** — Expected: **3 passed** (A, B, C).
  - Đỏ vì selector không tìm thấy label → xem `frontend/packages/i18n/src/catalogs/vi.ts` (labels admin.products.*) + sửa SELECTOR trong spec (không sửa app).
- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/tests/admin-journey.spec.ts
git commit -m "test(qa): product CRUD full-fields round-trip — mọi field giữ đúng (FI-407 T2)"
```

---

### Task 3: Variant stock round-trip + edit round-trip (bracket: admin-product-variant-stock-roundtrip)

**Files:**
- Modify: `frontend/e2e/tests/admin-journey.spec.ts` (thêm 1 test)

- [ ] **Step 1: Thêm test "D — edit: giá + stock đổi → save → reopen giữ đúng"**

```typescript
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
```

- [ ] **Step 2: Chạy describe** — Expected: **4 passed**.
- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/tests/admin-journey.spec.ts
git commit -m "test(qa): variant stock + edit round-trip qua inventory sync (FI-407 T3)"
```

---

### Task 4: Coupon CRUD round-trip (bracket: admin-coupon-crud-roundtrip)

**Files:**
- Modify: `frontend/e2e/tests/admin-journey.spec.ts` (thêm 1 test)

- [ ] **Step 1: Thêm test "E — coupon CRUD round-trip"**

```typescript
  test('E — coupon CRUD round-trip: tạo FIXED → sửa → toggle tắt → xóa', async ({ page }) => {
    await adminUiLogin(page);
    const CODE = `E2EJ${STAMP}`.slice(0, 64); // [A-Za-z0-9_-], form tự uppercase
    await page.goto(`${GATEWAY}/admin/coupons`);
    await page.getByTestId('coupon-create-btn').click();
    await page.getByLabel('Mã').fill(CODE);
    await page.getByLabel('Kiểu').selectOption('FIXED');
    await page.getByLabel('Giá trị').fill('50000');
    await page.getByLabel('Đơn tối thiểu (₫)').fill('100000');
    await page.getByLabel('Lượt dùng').fill('5');
    await page.getByLabel('Kết thúc').fill('2027-06-30T23:59');
    await page.getByLabel('Mô tả').fill('e2e journey coupon round-trip');
    await page.getByTestId('coupon-submit-btn').click();
    await expect(page.getByText('Đã tạo mã giảm giá')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`coupon-usage-${CODE}`)).toHaveText(/0\/5/);

    // SỬA — code khóa (hint "Mã không đổi khi sửa"), đổi value 50000 → 60000
    const couponRow = page.locator('tbody tr', { hasText: CODE }).first();
    couponRow.getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(page.getByLabel('Mã')).toBeDisabled();
    await page.getByLabel('Giá trị').fill('60000');
    await page.getByTestId('coupon-submit-btn').click();
    await expect(page.getByText('Đã cập nhật mã giảm giá')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr', { hasText: CODE }).first())
      .toContainText(/60\.000\s*₫/); // formatVnd Intl vi-VN — space có thể non-breaking

    // TOGGLE off
    await page.getByTestId(`coupon-toggle-${CODE}`).click();
    await expect(page.getByTestId(`coupon-toggle-${CODE}`)).toContainText('Tắt', { timeout: 15_000 });

    // XÓA (modal confirm) — dọn rác
    await page.getByTestId(`coupon-delete-${CODE}`).click();
    await page.getByRole('button', { name: 'Đồng ý' }).click();
    await expect(page.locator('tbody tr', { hasText: CODE })).toHaveCount(0, { timeout: 15_000 });
  });
```

- [ ] **Step 2: Chạy describe** — Expected: **5 passed**.
  - Lưu ý: window "Kết thúc phải sau bắt đầu" — KHÔNG fill "Bắt đầu" (startsAt rỗng = hợp lệ).
- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/tests/admin-journey.spec.ts
git commit -m "test(qa): coupon CRUD round-trip — tạo/sửa/toggle/xóa (FI-407 T4)"
```

---

### Task 5: Category CRUD round-trip (bracket: admin-category-crud-roundtrip)

**Files:**
- Modify: `frontend/e2e/tests/admin-journey.spec.ts` (thêm 1 test)

- [ ] **Step 1: Thêm test "F — category CRUD round-trip"**

```typescript
  test('F — category CRUD round-trip: tạo → sửa tên → xóa (dọn rác)', async ({ page }) => {
    await adminUiLogin(page);
    const CAT = `E2E Danh Mục ${STAMP}`;
    await page.goto(`${GATEWAY}/admin/categories`);
    await page.getByRole('button', { name: 'Thêm danh mục' }).click();
    await page.getByLabel('Tên (vi)').fill(CAT);
    await page.getByLabel('Tên (en)').fill(`E2E Category ${STAMP}`);
    await page.getByLabel('Slug (vi)').fill(`e2e-danh-muc-${STAMP}`);
    await page.getByLabel('Slug (en)').fill(`e2e-category-${STAMP}`);
    await page.getByLabel('Danh mục cha').selectOption({ label: '— Danh mục gốc —' });
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã tạo danh mục')).toBeVisible({ timeout: 15_000 });

    const catRow = page.locator('[data-testid="category-row"]', { hasText: CAT }).first();
    await expect(catRow).toBeVisible({ timeout: 15_000 });

    // SỬA tên vi
    catRow.getByRole('button', { name: 'Sửa', exact: true }).click();
    await page.getByLabel('Tên (vi)').fill(`${CAT} (đã sửa)`);
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Đã cập nhật danh mục')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="category-row"]', { hasText: `${CAT} (đã sửa)` }).first())
      .toBeVisible({ timeout: 15_000 });

    // XÓA (modal confirm) — category mới không con/không product → xóa được
    const renamedRow = page.locator('[data-testid="category-row"]', { hasText: `${CAT} (đã sửa)` }).first();
    renamedRow.getByRole('button', { name: 'Xóa', exact: true }).click();
    await page.getByRole('button', { name: 'Đồng ý' }).click();
    await expect(
      page.locator('[data-testid="category-row"]', { hasText: CAT })
    ).toHaveCount(0, { timeout: 15_000 });
  });
```

- [ ] **Step 2: Chạy toàn file admin-journey** — Expected: **6 passed**.
- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/tests/admin-journey.spec.ts
git commit -m "test(qa): category CRUD round-trip — tạo/sửa/xóa (FI-407 T5)"
```

---

### Task 6: Data-lifecycle — guest variant-less checkout (bracket: spec-data-lifecycle-guest-variantless-checkout)

**Files:**
- Create: `frontend/e2e/tests/data-lifecycle.spec.ts`

- [ ] **Step 1: Viết spec với test lớp 3a**

```typescript
import { expect, test } from '@playwright/test';
import { GATEWAY, SHELL, STOREFRONT } from '../helpers/env';
import { registerNewUser, type Session } from '../helpers/api';
import { uiLogin } from '../helpers/journey';

/**
 * DATA LIFECYCLE (SF-3 FI-407) — regression-lock lớp 3/4/5:
 *  - Lớp 3: product variant-less GỐC (Nokia — trước seed fix kẹt checkout
 *    `items[].variantId must not be null`) giờ có DEFAULT VARIANT
 *    (scripts/seed/seed.sh:93-104) → PDP selector ẨN nhưng auto-pick variant
 *    đầu → add-to-cart gửi variantId default → checkout PASS qua validate.
 *    Stale cart line variantId null → lỗi RÕ RÀNG (400 validation → .pay-error),
 *    không 500 (CartService null-safe ~:127).
 *  - Lớp 4: PDP không render "Đã bán" từ ratingCount (fix FI-390); giá =
 *    base + priceDelta (CatalogQueryService.java:254); admin stock = inventory thật.
 *  - Lớp 5: fresh-state — page sống sau fresh boot, entry chunks content-hash,
 *    SW absence (port-owner là detector của harness SF-2 — không assert ở đây).
 *
 * COD checkout (SF-13): CONFIRMED không cần Stripe — env fresh-boot không cam
 * kết stripe keys. Số thật (probe 2026-09-10): Nokia 590.000₫; Biti's Đỏ/40
 * 799.000₫ = 749.000 + delta 50.000; Nokia availability 50.
 */
test.describe.configure({ mode: 'serial' });

const NOKIA_SLUG = 'dien-thoai-nokia-110-2023';
const BITIS_SLUG = 'giay-sneaker-bitis-hunter-street';

/** Đi 3 bước checkout tới nút đặt hàng (address → ship → payment). */
async function gotoCheckoutAndChooseCod(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${SHELL}/checkout`);
  await page.getByLabel('Họ tên người nhận').fill('E2E Lifecycle Tester');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Số nhà + đường').fill('12 Nguyen Hue');
  await page.getByLabel('Phường/xã').fill('Ben Nghe');
  await page.getByLabel('Quận/huyện').fill('Quan 1');
  await page.getByLabel('Tỉnh/thành phố').fill('TP. Hồ Chí Minh');
  await page.getByRole('button', { name: /^Tiếp tục — chọn vận chuyển/ }).click();
  await page.getByRole('button', { name: /^Tiếp tục — thanh toán/ }).click();
  await page.getByTestId('payment-method-cod').check();
  await expect(page.getByTestId('cod-note')).toBeVisible();
}

test.describe('Data lifecycle — lớp 3/4/5 (FI-407)', () => {
  let user: Session;

  test.beforeAll(async () => {
    user = await registerNewUser('lifecycle407');
  });

  test('lớp 3a — Nokia (variant-less gốc): PDP ẩn selector, add gửi default variant → login merge → COD checkout CONFIRMED', async ({ page }) => {
    // fetch-id RUNTIME — fresh wipe đổi UUID, KHÔNG hardcode
    const detail = (await (await page.request.get(`${GATEWAY}/api/catalog/products/${NOKIA_SLUG}?locale=vi`)).json()) as {
      id: string; name: string; price: number; variants: Array<{ id: string; priceDelta: number }>;
    };
    expect(detail.variants.length, 'seed default variant phải tồn tại (seed.sh:93-104)').toBeGreaterThan(0);
    const defaultVariantId = detail.variants[0]!.id;

    await page.goto(`${STOREFRONT}/vi/p/${NOKIA_SLUG}`);
    // default variant không color/size → selector ẨN (collectOptions rỗng)…
    await expect(page.locator('.pdp-variants')).toHaveCount(0);
    // …nhưng price = base + delta(0) hiển thị chuẩn
    await expect(page.locator('.pdp-price')).toHaveText('590.000 ₫');

    // add-to-cart — REGRESSION LOCK: payload phải mang variantId DEFAULT (tự chọn)
    const addResp = page.waitForResponse(
      (r) => r.url().includes('/api/cart/items') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'THÊM VÀO GIỎ' }).click();
    const resp = await addResp;
    expect(resp.status(), await resp.text().catch(() => '')).toBe(200);
    const payload = resp.request().postDataJSON() as { productId: string; variantId?: string | null };
    expect(payload.productId).toBe(detail.id);
    expect(payload.variantId, 'add-to-cart phải TỰ chọn default variant (không null/kẹt)')
      .toBe(defaultVariantId);

    // login (merge-on-login) → giỏ merge guest→user
    await uiLogin(page, user.email, user.password);
    await page.goto(`${SHELL}/cart`);
    await expect(page.getByText('Nokia 110').first()).toBeVisible({ timeout: 15_000 });

    // checkout COD — CONFIRMED = pass qua bước validate (không "variantId must not be null")
    await gotoCheckoutAndChooseCod(page);
    await page.getByRole('button', { name: /^Đặt hàng COD/ }).click();
    await expect(page).toHaveURL(/\/order\/confirmation/, { timeout: 30_000 });
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status-code', 'CONFIRMED', {
      timeout: 60_000
    });
  });
});
```

- [ ] **Step 2: Chạy** — Expected: **1 passed** ( confirmation CONFIRMED trong 60s).
  - Nếu merge không tới (cart trống sau login) → bug thật lớp 3 (merge-on-login) → bug-register + BLOCKED (KHÔNG sửa app).
- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/tests/data-lifecycle.spec.ts
git commit -m "test(qa): lifecycle lớp 3a — Nokia default variant qua checkout COD CONFIRMED (FI-407 T6)"
```

---

### Task 7: Stale cart `variantId: null` → lỗi rõ ràng (bracket: spec-data-lifecycle-stale-cart-merge)

**Files:**
- Modify: `frontend/e2e/helpers/journey.ts` (thêm helper inject)
- Modify: `frontend/e2e/tests/data-lifecycle.spec.ts` (thêm 1 test)

- [ ] **Step 1: Thêm helper vào `helpers/journey.ts`** (cuối file)

```typescript
/**
 * Inject stale guest cart (FI-407 lớp 3b): GHI ĐÈ key `cart:guest:<token>`
 * bằng CartDocument JSON có line variantId NULL — mô phỏng data cũ trước seed
 * fix. Shape khớp records CartModels.java (LineItem 9 field; CartDocument:
 * items/updatedAt/email). Redis exec theo pattern pgExec: E2E_REDIS_CONTAINER
 * (rig isolate) hoặc `docker compose exec -T redis` (spec-critic P2).
 * execFileSync ARG-ARRAY — JSON không đi qua /bin/sh (FI-402 P0 pattern).
 */
export async function injectStaleGuestCart(input: {
  guestToken: string;
  productId: string;
  slug: string;
  name: string;
  unitPrice: number;
}): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  const path = require('node:path') as typeof import('node:path');
  const repoRoot = path.resolve(__dirname, '../../..');
  const doc = {
    items: [
      {
        id: crypto.randomUUID(),
        productId: input.productId,
        variantId: null, // STALE — dòng cũ trước seed fix
        qty: 1,
        slug: input.slug,
        name: input.name,
        image: '',
        unitPrice: input.unitPrice,
        unavailable: false
      }
    ],
    updatedAt: new Date().toISOString(),
    email: null
  };
  const container = process.env.E2E_REDIS_CONTAINER;
  const { args, cmd } = container
    ? { args: ['exec', container, 'redis-cli', 'SET', `cart:guest:${input.guestToken}`, JSON.stringify(doc)], cmd: 'docker' }
    : { args: ['compose', 'exec', '-T', 'redis', 'redis-cli', 'SET', `cart:guest:${input.guestToken}`, JSON.stringify(doc)], cmd: 'docker' };
  execFileSync(cmd, args, { encoding: 'utf8', cwd: repoRoot });
}
```

- [ ] **Step 2: Thêm test lớp 3b vào data-lifecycle.spec.ts** (import thêm `injectStaleGuestCart`)

```typescript
  test('lớp 3b — stale cart line variantId null: cart render (không 500) → merge → checkout lỗi RÕ RÀNG (.pay-error variantId)', async ({ page }) => {
    const detail = (await (await page.request.get(`${GATEWAY}/api/catalog/products/${NOKIA_SLUG}?locale=vi`)).json()) as {
      id: string; name: string; price: number;
    };

    // guest THẬT qua UI — cart_token cookie sống trong jar (Path=/api/cart)
    await page.goto(`${STOREFRONT}/vi/p/${NOKIA_SLUG}`);
    const addResp = page.waitForResponse(
      (r) => r.url().includes('/api/cart/items') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'THÊM VÀO GIỎ' }).click();
    expect((await addResp).status()).toBe(200);

    // GHI ĐÈ redis key bằng doc stale (variantId null)
    const cartToken = (await page.context().cookies()).find((c) => c.name === 'cart_token')!.value;
    await injectStaleGuestCart({
      guestToken: cartToken, productId: detail.id, slug: NOKIA_SLUG,
      name: detail.name, unitPrice: detail.price
    });

    // cart page render line stale — CartService tolerant (không 500)
    await page.goto(`${SHELL}/cart`);
    await expect(page.getByText('Nokia 110').first()).toBeVisible({ timeout: 15_000 });

    // login → merge → user cart mang line stale
    await uiLogin(page, user.email, user.password);
    await page.goto(`${SHELL}/cart`);
    await expect(page.getByText('Nokia 110').first()).toBeVisible({ timeout: 15_000 });

    // checkout → 400 validation "items[0].variantId must not be null" surface .pay-error (role=alert) — KHÔNG 500 trắng
    await gotoCheckoutAndChooseCod(page);
    await page.getByRole('button', { name: /^Đặt hàng COD/ }).click();
    await expect(page.locator('.pay-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.pay-error')).toContainText('variantId');
  });
```

- [ ] **Step 3: Chạy cả file data-lifecycle** — Expected: **2 passed**.
- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/helpers/journey.ts frontend/e2e/tests/data-lifecycle.spec.ts
git commit -m "test(qa): lifecycle lớp 3b — stale cart variantId null → lỗi rõ ràng, không 500 (FI-407 T7)"
```

---

### Task 8: Surfacing số thật + fresh-state (bracket: spec-surfacing-asserts-real-numbers)

**Files:**
- Modify: `frontend/e2e/tests/data-lifecycle.spec.ts` (thêm 3 test)

- [ ] **Step 1: Thêm 2 test lớp 4 (PDP)** — import thêm `adminUiLogin` từ helper

```typescript
  test("lớp 4 — PDP Biti's: giá hiển thị = base + priceDelta (799.000 ₫ = 749.000 + 50.000 auto-pick Đỏ/40)", async ({ page }) => {
    await page.goto(`${STOREFRONT}/vi/p/${BITIS_SLUG}`);
    // auto-pick lựa đầu mỗi dimension (Đỏ + 40) → variant 799000
    await expect(page.locator('.pdp-price')).toHaveText('799.000 ₫', { timeout: 15_000 });
  });

  test('lớp 4 — PDP không render "Đã bán" từ ratingCount (fix FI-390 giữ nguyên)', async ({ page }) => {
    for (const slug of [NOKIA_SLUG, BITIS_SLUG]) {
      await page.goto(`${STOREFRONT}/vi/p/${slug}`);
      const text = await page.locator('body').innerText();
      expect(text, `PDP ${slug} không được render "Đã bán"`).not.toContain('Đã bán');
    }
  });
```

- [ ] **Step 2: Thêm test lớp 4 (admin stock surfacing) + lớp 5 (fresh-state)**

```typescript
  test('lớp 4 — admin edit form Nokia: stock input = inventory thật (50, không 0 ảo — fix FI-397)', async ({ page }) => {
    await adminUiLogin(page);
    await page.goto(`${SHELL}/admin/products`);
    await page.getByLabel('Tìm kiếm').fill('Nokia 110');
    await page.keyboard.press('Enter');
    await page.locator('tbody tr', { hasText: 'Nokia 110' }).first()
      .getByRole('button', { name: 'Sửa' }).click();
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    // availability fetch async → poll về giá trị THẬT từ db_inventory (seed 50/variant)
    await expect(page.locator('.admin-variant-row input').nth(4)).toHaveValue('50', { timeout: 15_000 });
  });

  test('lớp 5 — fresh-state: page sống sau fresh boot + entry chunks content-hash + SW absence', async ({ page, request }) => {
    const home = await request.get(`${STOREFRONT}/vi`);
    expect(home.status()).toBe(200);
    const html = await home.text();
    expect(html).toMatch(/Shop VN|Cửa hàng|Ecommerce/i);

    // entry scripts content-hashed (build mới → hash mới — baseline ghi report mỗi run)
    const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
    expect(chunks.length, 'entry chunks phải có mặt trong SSR HTML').toBeGreaterThan(0);
    for (const url of chunks.slice(0, 5)) {
      const r = await request.get(`${STOREFRONT}${url}`);
      expect(r.status(), `chunk ${url} phải load được`).toBe(200);
    }
    const hashed = chunks.filter((u) => /-[0-9a-f]{8,}\.js$/.test(u));
    expect(hashed.length, 'chunks phải content-hashed (cache-bust sau rebuild)').toBeGreaterThan(0);

    // SW absence (storefront KHÔNG có service worker — nếu sau này thêm, assert
    // này đỏ = nhắc thêm assert version-key đổi sau rebuild — spec epic §5.7)
    await page.goto(`${STOREFRONT}/vi`);
    const registrations = await page.evaluate(() => navigator.serviceWorker.getRegistrations());
    expect(registrations).toHaveLength(0);

    // wipe marker (nếu có) = evidence env-fresh — SOFT note, không hard-fail
    const { existsSync, readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const marker = path.resolve(__dirname, '../../../.run/qa-fresh-boot-wiped');
    if (existsSync(marker)) {
      test.info().annotations.push({ type: 'info', description: `fresh-boot wipe marker: ${readFileSync(marker, 'utf8').trim()}` });
    }
  });
```

- [ ] **Step 3: Chạy cả file** — Expected: **5 passed**.
- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/tests/data-lifecycle.spec.ts
git commit -m "test(qa): surfacing số thật (admin stock 50, giá base+delta, không Đã bán) + fresh-state (FI-407 T8)"
```

---

### Task 9: Full run trên fresh-boot env + report-sf3 (bracket: run-on-fresh-boot-green)

**Files:**
- Create: `docs/superpowers/qa/report-sf3.md`

- [ ] **Step 1: Full run cả 2 spec serial (lệnh chuẩn, cả 2 file)** — Expected: **11 passed** (6 admin-journey + 5 data-lifecycle), 0 failed/flaky ngoài retry policy.
- [ ] **Step 2: Evidence không đụng specs cũ**

```bash
git diff --stat 276a5b1..HEAD -- frontend/e2e/tests/ | grep -v "admin-journey\|data-lifecycle" || echo "CLEAN — chỉ 2 spec mới"
git diff --name-only 276a5b1..HEAD -- frontend/e2e/helpers/env.ts frontend/e2e/helpers/api.ts frontend/e2e/helpers/checkout.ts frontend/e2e/playwright.config.ts scripts/qa/ | wc -l   # → 0
```

- [ ] **Step 3: Viết `docs/superpowers/qa/report-sf3.md`** — nội dung bắt buộc: lệnh chạy đúng + env state (:8080 UP, seeded, wipe marker timestamp nếu có); bảng kết quả từng test; số asserts số-thật (590.000₫ / 799.000₫ / stock 50/33/44); drift note pack-vs-seed (Mustela delta 0 không phải 1000; stock 50 không phải 100 — pack số ví dụ, specs dùng số seed thật); evidence git diff specs cũ sạch; bug-register (rỗng hoặc bug thật nếu có).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/qa/report-sf3.md
git commit -m "docs(qa): report-sf3 — 2 journey specs green trên fresh-boot env (FI-407 T9)"
```

---

## Self-review (đã chạy)

1. **Spec coverage**: ACCEPTANCE 1 → Tasks 2+3 (product round-trip, stock 33/44) + Task 4 (coupon) + Task 5 (category); ACCEPTANCE 2 → Tasks 6+7; ACCEPTANCE 3 → Task 8; ACCEPTANCE 4 → Task 9; ACCEPTANCE 5 → Task 9 Step 2. §3.1 Section A-E khớp Tasks 1-5; §3.2 khớp Tasks 6-8; §3.3 helper khớp Tasks 1+7.
2. **Placeholder scan**: không TBD/TODO; mọi code block hoàn chỉnh; commands exact.
3. **Type consistency**: helper names `adminUiLogin`/`uiLogin`/`injectStaleGuestCart` dùng nhất quán; constants PRODUCT/STAMP/NOKIA_SLUG/BITIS_SLUG nhất quán giữa các task.
