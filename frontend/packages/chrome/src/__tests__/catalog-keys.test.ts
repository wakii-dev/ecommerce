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

/**
 * Mirror nguồn hiện có (T13 P2 — Wave 1 review): string `chrome.*` phải
 * khớp NGUỒN nó mirror (shell.cart/theme, account.menu, nav.home/login/
 * register) — mirror tự-enforcing: drift 1 phía rớt test ngay, không đợi
 * e2e/text-based selector vỡ.
 */
describe('chrome.* mirror giá trị nguồn (vi + en)', () => {
  it('vi: cart.aria=shell, theme.*=shell.theme, menu.*=account.menu, guest=nav, header.aria=nav.home', () => {
    expect(viCatalog.chrome.cart.aria).toBe(viCatalog.shell.cart.aria);
    expect(viCatalog.chrome.theme.toLight).toBe(viCatalog.shell.theme.toLight);
    expect(viCatalog.chrome.theme.toDark).toBe(viCatalog.shell.theme.toDark);
    expect(viCatalog.chrome.theme.light).toBe(viCatalog.shell.theme.light);
    expect(viCatalog.chrome.theme.dark).toBe(viCatalog.shell.theme.dark);
    expect(viCatalog.chrome.menu.account).toBe(viCatalog.account.menu.account);
    expect(viCatalog.chrome.menu.orders).toBe(viCatalog.account.menu.orders);
    expect(viCatalog.chrome.menu.logout).toBe(viCatalog.account.menu.logout);
    expect(viCatalog.chrome.menu.displayNameFallback).toBe(viCatalog.account.menu.displayNameFallback);
    expect(viCatalog.chrome.guest.login).toBe(viCatalog.nav.login);
    expect(viCatalog.chrome.guest.register).toBe(viCatalog.nav.register);
    expect(viCatalog.chrome.header.aria).toBe(viCatalog.nav.home);
  });

  it('en: cùng bộ mirror', () => {
    expect(enCatalog.chrome.cart.aria).toBe(enCatalog.shell.cart.aria);
    expect(enCatalog.chrome.theme.toLight).toBe(enCatalog.shell.theme.toLight);
    expect(enCatalog.chrome.theme.toDark).toBe(enCatalog.shell.theme.toDark);
    expect(enCatalog.chrome.theme.light).toBe(enCatalog.shell.theme.light);
    expect(enCatalog.chrome.theme.dark).toBe(enCatalog.shell.theme.dark);
    expect(enCatalog.chrome.menu.account).toBe(enCatalog.account.menu.account);
    expect(enCatalog.chrome.menu.orders).toBe(enCatalog.account.menu.orders);
    expect(enCatalog.chrome.menu.logout).toBe(enCatalog.account.menu.logout);
    expect(enCatalog.chrome.menu.displayNameFallback).toBe(enCatalog.account.menu.displayNameFallback);
    expect(enCatalog.chrome.guest.login).toBe(enCatalog.nav.login);
    expect(enCatalog.chrome.guest.register).toBe(enCatalog.nav.register);
    expect(enCatalog.chrome.header.aria).toBe(enCatalog.nav.home);
  });
});
