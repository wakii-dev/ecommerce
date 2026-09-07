import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Wiring meta-tests (plan Task 15): `scripts/render-smoke.mjs` chỉ EXECUTE ở
 * Phase 5 (cần live stack) nên không chạy được trong vitest — thay vào đó đọc
 * file as TEXT và assert các marker check bắt buộc còn nguyên. Meta nhưng rẻ:
 * chặn scenario assert bị xóa/mất khi refactor script mà không ai còn chạy
 * đúng những gì acceptance sweep cần ở Phase 5.
 */

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/render-smoke.mjs', import.meta.url));
const script = readFileSync(SCRIPT_PATH, 'utf8');

/** [marker, lý do marker phải tồn tại] — mỗi marker = 1 assert của smoke. */
const REQUIRED_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['actuator/health', 'preflight catalog health'],
  ['"status":"UP"', 'preflight yêu cầu UP'],
  ['make dev svc=catalog', 'hướng dẫn khi catalog chưa chạy'],
  ['GATEWAY_URL', 'env gateway URL'],
  ['BASE_URL', 'env storefront base URL'],
  ['Mua ngay', 'home hero CTA'],
  ['₫', 'giá format VND (home + PDP)'],
  ['application/ld+json', 'PDP JSON-LD script tag'],
  ['"@type":"Product"', 'JSON-LD Product type'],
  ['og:title', 'PDP OG meta'],
  ['THÊM VÀO GIỎ', 'PDP add-to-cart CTA'],
  ['/c/dien-tu', 'category page route'],
  ['Điện Tử', 'category name (resolve API + fallback literal)'],
  ['/search?q=', 'search page route'],
  ['/p/', 'product link (search results + sitemap)'],
  ['/coupons', 'coupons page route'],
  ['Chưa có mã giảm giá', 'coupons empty-state (SF-9 mock-gate)'],
  ['sitemap.xml', 'sitemap route'],
  ['<urlset', 'sitemap XML mở đầu'],
  ['robots.txt', 'robots route'],
  ['Disallow: /cart', 'robots chặn cart'],
  ['Sitemap:', 'robots trỏ sitemap'],
  ['noindex', 'en-fallback noindex guard'],
  ['SLUG_VI', 'env slug vi'],
  ['SLUG_EN', 'env slug en'],
  ['dien-thoai-xiaomi-redmi-13c', 'default slug vi'],
  ['xiaomi-redmi-13c-phone', 'default slug en'],
];

describe('wiring: scripts/render-smoke.mjs (meta — chặn mất assert)', () => {
  it('chứa đủ markers check bắt buộc', () => {
    for (const [marker, why] of REQUIRED_MARKERS) {
      expect(script.includes(marker), `missing "${marker}" (${why})`).toBe(true);
    }
  });

  it('exit 1 khi có failure (preflight + bảng FAIL + crash guard)', () => {
    expect(script.match(/process\.exit\(1\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('in bảng tổng PASS/FAIL', () => {
    expect(script).toContain('SMOKE PASS');
    expect(script).toContain('SMOKE FAIL');
  });
});

// FI-366 SF-1 (T12): GATEWAY_URL single-source — meta-test chặn drift quay
// lại: e2e/helpers/env.ts phải đọc `GATEWAY_URL` (.env nguồn duy nhất), không
// phải hardcode riêng E2E_GATEWAY_URL đứng đầu (drift thật đã gặp — T12).
describe('wiring: GATEWAY_URL single-source (FI-366 SF-1)', () => {
  const envHelperPath = fileURLToPath(new URL('../../../e2e/helpers/env.ts', import.meta.url));
  const envHelper = readFileSync(envHelperPath, 'utf8');

  it('e2e/helpers/env.ts đọc GATEWAY_URL (.env single-source, không hardcode :8080 riêng)', () => {
    expect(envHelper).toContain("env('GATEWAY_URL')");
  });
});
