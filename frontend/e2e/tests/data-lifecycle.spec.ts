import { expect, test } from '@playwright/test';
import { GATEWAY, SHELL, STOREFRONT } from '../helpers/env';
import { registerNewUser, type Session } from '../helpers/api';
import { adminUiLogin, injectStaleGuestCart, uiLogin } from '../helpers/journey';

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

    // login (merge-on-login) → chờ POST /api/cart/merge. Merge fire ĐỒNG THỜI
    // auth flip (bootstrap.tsx watchMergeOnLogin — shell init eager mọi page,
    // main.tsx:64) → listener phải attach TRƯỚC click Đăng nhập, không thì
    // merge hoàn tất trước khi listener vào (race thật — 2/2 run đỏ, executor T6)
    const mergeResp = page.waitForResponse(
      (r) => r.url().includes('/api/cart/merge') && r.request().method() === 'POST',
      { timeout: 10_000 }
    );
    await uiLogin(page, user.email, user.password);
    await mergeResp;
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

    // login → chờ merge (listener attach TRƯỚC click — race thật, xem lớp 3a) → user cart mang line stale
    const mergeResp = page.waitForResponse(
      (r) => r.url().includes('/api/cart/merge') && r.request().method() === 'POST',
      { timeout: 10_000 }
    );
    await uiLogin(page, user.email, user.password);
    await mergeResp;
    await page.goto(`${SHELL}/cart`);
    await expect(page.getByText('Nokia 110').first()).toBeVisible({ timeout: 15_000 });

    // checkout → 400 validation "items[0].variantId must not be null" surface .pay-error (role=alert) — KHÔNG 500 trắng
    await gotoCheckoutAndChooseCod(page);
    await page.getByRole('button', { name: /^Đặt hàng COD/ }).click();
    await expect(page.locator('.pay-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.pay-error')).toContainText('variantId');
  });

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

  test('lớp 4 — admin edit form Nokia: stock input = inventory THẬT (không 0 ảo — fix FI-397)', async ({ page }) => {
    // availability RUNTIME, không hardcode 50: suite này TỰ đặt hàng Nokia (lớp 3a)
    // mỗi run + env dùng chung có order trước đó → số giảm thật (probe T8: 46,
    // reserved 4). Assert = số THẬT db_inventory cùng nguồn admin form fetch
    // (ProductFormPage.tsx:62 /api/inventory/availability) — lock "không 0 ảo".
    const detail = (await (await page.request.get(`${GATEWAY}/api/catalog/products/${NOKIA_SLUG}?locale=vi`)).json()) as {
      variants: Array<{ id: string }>;
    };
    const variantId = detail.variants[0]!.id;
    const avail = (await (await page.request.get(`${GATEWAY}/api/inventory/availability?variantIds=${variantId}`)).json()) as
      Array<{ variantId: string; available: number }>;
    expect(avail[0]!.variantId).toBe(variantId);
    const expectedStock = String(avail[0]!.available);

    await adminUiLogin(page);
    await page.goto(`${GATEWAY}/admin/products`); // one-origin :8080 — nhất quán GATEWAY như admin-journey (plan-critic P2-3)
    await page.getByLabel('Tìm kiếm').fill('Nokia 110');
    await page.keyboard.press('Enter');
    await page.locator('tbody tr', { hasText: 'Nokia 110' }).first()
      .getByRole('button', { name: 'Sửa' }).click();
    await page.getByRole('tab', { name: 'Phân loại' }).click();
    // availability fetch async → poll về giá trị THẬT từ db_inventory
    await expect(page.locator('.admin-variant-row input').nth(4)).toHaveValue(expectedStock, { timeout: 15_000 });
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

    // SW — SF-15 PwaRegister đăng ký /sw.js CHỈ prod (PwaRegister.tsx:12) — env
    // :8080 là prod build nên CÓ ĐÚNG 1 registration (assumption "SW absence"
    // của plan đã hết hạn theo thiết kế; epic §5.7 assert version-key đổi sau
    // rebuild cần rig 2 build — follow-up ngoài story này). Lock fresh-state:
    // đúng sw.js của app + asset load được (poll — register fire async sau load).
    await page.goto(`${STOREFRONT}/vi`);
    await expect
      .poll(
        () => page.evaluate(() =>
          navigator.serviceWorker.getRegistrations().then((rs) =>
            // scriptURL nằm trên ServiceWorker (active/waiting/installing),
            // KHÔNG phải trên Registration — null trong lúc install → poll chờ
            rs.map((r) => r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL)
          )
        ),
        { timeout: 10_000 }
      )
      .toEqual([`${STOREFRONT}/sw.js`]);
    const swResp = await request.get(`${STOREFRONT}/sw.js`);
    expect(swResp.status(), 'sw.js phải load được').toBe(200);

    // wipe marker (nếu có) = evidence env-fresh — SOFT note, không hard-fail
    const { existsSync, readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const marker = path.resolve(__dirname, '../../../.run/qa-fresh-boot-wiped');
    if (existsSync(marker)) {
      test.info().annotations.push({ type: 'info', description: `fresh-boot wipe marker: ${readFileSync(marker, 'utf8').trim()}` });
    }
  });
});
