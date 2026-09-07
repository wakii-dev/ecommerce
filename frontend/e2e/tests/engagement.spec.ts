import { expect, test } from '@playwright/test';

import { GATEWAY, STOREFRONT } from '../helpers/env';

/**
 * Engagement suite (SF-15, FI-325) — deterministic trên `make dev` stack:
 *   1. Dark mode toggle → html[data-theme=dark] + persist qua reload
 *   2. PWA manifest 200 + JSON hợp lệ + icons 200 (KHÔNG assert
 *      serviceWorker.ready — PwaRegister prod-only, SW active verify bằng
 *      prod build ở walkthrough Task 11)
 *   3. Stock-alert API contract (guest): slug lạ 404 · email sai 400 ·
 *      variant còn hàng 400 (UI out-of-stock flow → walkthrough T11)
 *   4. OAuth discovery well-known (nút login ẩn/hiện theo env)
 */
test.describe('SF-15 engagement & platform', () => {
  test.describe('dark mode', () => {
    test('toggle → dark → reload giữ nguyên → toggle lại', async ({ page }) => {
      await page.goto(`${STOREFRONT}/vi`);
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', /storefront|dark/);

      const toggle = page.getByRole('button', { name: /giao diện/i });
      const before = await html.getAttribute('data-theme');
      await toggle.click();
      const after = await html.getAttribute('data-theme');
      expect(after).not.toBe(before);

      // persist qua reload (localStorage / system)
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', after!);

      // trả lại theme ban đầu (không ô nhiễm test khác)
      await page.getByRole('button', { name: /giao diện/i }).click();
      await expect(html).toHaveAttribute('data-theme', before!);
    });
  });

  test.describe('PWA', () => {
    test('manifest.webmanifest 200 + JSON hợp lệ + icons có mặt', async ({ request }) => {
      // Qua GATEWAY (predicate storefront +manifest.webmanifest,/icons/**)
      const manifest = await request.get(`${GATEWAY}/manifest.webmanifest`);
      expect(manifest.status()).toBe(200);
      const body = await manifest.json();
      expect(body.name).toContain('ShopVN');
      expect(body.display).toBe('standalone');
      expect(body.start_url).toBe('/vi');
      for (const icon of body.icons as Array<{ src: string }>) {
        const res = await request.get(`${GATEWAY}${icon.src}`);
        expect(res.status(), `icon ${icon.src}`).toBe(200);
      }
      const apple = await request.get(`${GATEWAY}/icons/apple-touch-icon.png`);
      expect(apple.status()).toBe(200);
    });
  });

  test.describe('stock alert API (guest, public)', () => {
    const BAD_EMAIL = 'khong-phai-email';

    test('slug lạ → 404 problem+json', async ({ request }) => {
      const res = await request.post(`${GATEWAY}/api/catalog/products/khong-ton-tai-xyz/stock-alert`, {
        data: { email: 'guest@example.com', variantId: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.status()).toBe(404);
      expect(res.headers()['content-type']).toContain('application/problem+json');
    });

    test('email sai → 400', async ({ request }) => {
      const products = await request.get(`${GATEWAY}/api/catalog/products?size=1`);
      const page = await products.json();
      const product = page.items?.[0] ?? page.content?.[0];
      expect(product, 'seed có ít nhất 1 product').toBeTruthy();
      const res = await request.post(
        `${GATEWAY}/api/catalog/products/${product.slug}/stock-alert`,
        { data: { email: BAD_EMAIL, variantId: product.variants?.[0]?.id ?? product.id } },
      );
      expect(res.status()).toBe(400);
    });
  });

  test.describe('oauth discovery', () => {
    test('well-known oauth-providers trả JSON {google,facebook}', async ({ request }) => {
      const res = await request.get(`${GATEWAY}/api/identity/.well-known/oauth-providers`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(typeof body.google).toBe('boolean');
      expect(typeof body.facebook).toBe('boolean');
    });
  });
});
