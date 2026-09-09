import { fireEvent, render, screen } from '@testing-library/react';
import { initI18n } from '@ecommerce/i18n';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeToggle } from '../index';

/**
 * ThemeToggle component tests (FI-398 T7, spec §5.4): click toggle set
 * data-theme trên <html> + ghi/xóa storage ĐÚNG CHIỀU so với system (ghi khi
 * ngược prefers-color-scheme, xóa khi cùng chiều). jsdom thiếu matchMedia →
 * stub qua vi.stubGlobal; storage reset mỗi case.
 */
beforeAll(async () => {
  await initI18n();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
}

describe('ThemeToggle', () => {
  it('system light + chưa stored: click → data-theme dark + GHI storage (ngược system)', () => {
    stubMatchMedia(false);
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Chuyển giao diện tối');

    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Chuyển giao diện sáng');
  });

  it('system dark: boot resolve dark (theo system) — click → data-theme storefront + GHI light', () => {
    stubMatchMedia(true);
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('true'); // resolveTheme(null, true) = dark

    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('storefront');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('stored dark + system light: click về storefront → XÓA storage (về theo system)', () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('true'); // stored thắng system

    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('storefront');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull(); // removeItem
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('title + sr-only nhãn khớp trạng thái (chrome.theme.*)', () => {
    stubMatchMedia(false);
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).toBe('Chuyển giao diện tối');
    expect(screen.getByText('Tối')).toBeTruthy(); // chrome-vh span visible cho SR
  });
});
