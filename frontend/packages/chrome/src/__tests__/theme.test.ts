import { describe, expect, it } from 'vitest';
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, resolveTheme, storedThemeValue } from '../theme';

/**
 * Theme canonical logic tests (FI-398 T7, spec §5.4): key canonical literal,
 * bảng case resolveTheme/storedThemeValue (port EXACT shell ThemeToggle),
 * THEME_BOOT_SCRIPT chứa key + set data-theme + guard try/catch.
 */
describe('THEME_STORAGE_KEY', () => {
  it('canonical literal ecommerce.theme', () => {
    expect(THEME_STORAGE_KEY).toBe('ecommerce.theme');
  });
});

describe('resolveTheme (port current() shell ThemeToggle)', () => {
  it.each([
    ['dark', false, 'dark'], // stored dark thắng system
    ['dark', true, 'dark'],
    ['light', false, 'storefront'], // stored light → storefront dù system
    ['light', true, 'storefront'],
    [null, true, 'dark'], // thiếu → theo system
    [null, false, 'storefront'],
    ['junk', true, 'dark'], // junk → bỏ qua, theo system
    ['junk', false, 'storefront']
  ] as const)('resolveTheme(%j, %j) → %j', (storage, prefersDark, expected) => {
    expect(resolveTheme(storage, prefersDark)).toBe(expected);
  });
});

describe('storedThemeValue (port nhánh storage toggle())', () => {
  it.each([
    ['dark', false, 'dark'], // ngược system light → ghi 'dark'
    ['dark', true, null], // cùng chiều system dark → XÓA key
    ['storefront', true, 'light'], // ngược system dark → ghi 'light'
    ['storefront', false, null] // cùng chiều system light → XÓA key
  ] as const)('storedThemeValue(%j, %j) → %j', (theme, prefersDark, expected) => {
    expect(storedThemeValue(theme, prefersDark)).toBe(expected);
  });
});

describe('THEME_BOOT_SCRIPT (khớp inline script shell index.html)', () => {
  it('chứa key canonical + assignment data-theme + guard try/catch', () => {
    expect(THEME_BOOT_SCRIPT).toContain("'ecommerce.theme'");
    expect(THEME_BOOT_SCRIPT).toContain('dataset.theme'); // set data-theme trên <html>
    expect(THEME_BOOT_SCRIPT).toMatch(/try\s*\{/);
    expect(THEME_BOOT_SCRIPT).toContain('(prefers-color-scheme: dark)');
  });

  it('fallback chain: stored → prefers-color-scheme → storefront', () => {
    expect(THEME_BOOT_SCRIPT).toContain("t === 'dark' || (!t && d) ? 'dark' : 'storefront'");
  });
});
