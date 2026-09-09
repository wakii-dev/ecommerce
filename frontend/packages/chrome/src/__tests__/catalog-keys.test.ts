import { describe, expect, it } from 'vitest';

import { enCatalog, viCatalog } from '@ecommerce/i18n';

/**
 * Parity test chrome.* catalogs (FI-398 T11 — spec §5.10): vi + en phải có
 * CÙNG bộ leaf-key path — thiếu 1 key ở 1 catalog sẽ rớt im lặng lúc runtime
 * (useT trả raw key). Spot-check value để bắt catalog rỗng.
 */

/** Thu hết leaf key paths ('header.aria', 'footer.linkCart', …). */
function leafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? leafPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

const viKeys = leafPaths(viCatalog.chrome as Record<string, unknown>);
const enKeys = leafPaths(enCatalog.chrome as Record<string, unknown>);

describe('chrome.* catalogs parity (vi ↔ en)', () => {
  it('same leaf key set in both catalogs', () => {
    expect(viKeys.sort()).toEqual(enKeys.sort());
  });

  it('spot-check values non-empty in both', () => {
    expect(viCatalog.chrome.header.aria).toBe('Trang chủ');
    expect(enCatalog.chrome.header.aria).toBe('Home');
    expect(viCatalog.chrome.cart.aria).toContain('{{count}}');
    expect(enCatalog.chrome.cart.aria).toContain('{{count}}');
    expect(viCatalog.chrome.footer.linkMyReviews.length).toBeGreaterThan(0);
    expect(enCatalog.chrome.footer.linkMyReviews.length).toBeGreaterThan(0);
  });
});
