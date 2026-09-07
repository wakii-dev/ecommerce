import { describe, expect, it } from 'vitest';

import { resolveTheme, storedValueFor } from '../lib/theme';

describe('resolveTheme (SF-15 dark mode)', () => {
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

  it('storedValueFor: chỉ ghi khi user đi NGƯỢC system (null = theo system)', () => {
    expect(storedValueFor('dark', false)).toBe('dark');
    expect(storedValueFor('dark', true)).toBeNull();
    expect(storedValueFor('storefront', true)).toBe('light');
    expect(storedValueFor('storefront', false)).toBeNull();
  });
});
