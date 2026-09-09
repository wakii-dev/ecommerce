import { describe, expect, it } from 'vitest';

import { resolveTheme, storedThemeValue } from '@ecommerce/chrome';

describe('resolveTheme (SF-15 dark mode — canonical chrome SF-4)', () => {
  it('localStorage thắng prefers-color-scheme', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('storefront');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('không có lựa chọn → theo prefers-color-scheme (lần đầu)', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('storefront');
    expect(resolveTheme('', true)).toBe('dark');
    expect(resolveTheme('rác', false)).toBe('storefront');
  });

  it('storedThemeValue: chỉ ghi khi user đi NGƯỢC system (null = theo system)', () => {
    expect(storedThemeValue('dark', false)).toBe('dark');
    expect(storedThemeValue('dark', true)).toBeNull();
    expect(storedThemeValue('storefront', true)).toBe('light');
    expect(storedThemeValue('storefront', false)).toBeNull();
  });
});
