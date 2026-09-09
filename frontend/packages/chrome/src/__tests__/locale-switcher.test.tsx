import { fireEvent, screen } from '@testing-library/react';
import { initI18n } from '@ecommerce/i18n';
import { afterAll, describe, expect, it } from 'vitest';
import type { i18n as I18nInstance } from 'i18next';
import { LANG_STORAGE_KEY, LocaleSwitcher, storedLang } from '../index';
import { renderWithProviders } from './setup';

/**
 * LocaleSwitcher (FI-398 T12, spec §5.7): 2 nút vi/en — click en →
 * i18n.language đổi + persist localStorage['ecommerce.lang']; aria-pressed
 * flip theo lang; storedLang() đọc lại an toàn (giá trị lạ/private mode →
 * null). i18n qua renderWithProviders (setup T13 — P1 critic); reset lang vi
 * + clear storage giữa các case (initI18n idempotent — options lần đầu thắng,
 * changeLanguage đổi được mọi lúc).
 */
afterAll(() => {
  window.localStorage.clear();
});

async function resetToVi(): Promise<I18nInstance> {
  const i18n = await initI18n();
  await i18n.changeLanguage('vi');
  window.localStorage.clear();
  return i18n;
}

describe('LocaleSwitcher (shell-model)', () => {
  it('render 2 nút vi/en — labels chrome.locale.*, lang mặc định vi → aria-pressed vi=true/en=false', async () => {
    await resetToVi();
    await renderWithProviders(<LocaleSwitcher />, { lang: 'vi' });
    const viBtn = screen.getByRole('button', { name: 'Tiếng Việt' });
    const enBtn = screen.getByRole('button', { name: 'English' });
    expect(viBtn.getAttribute('aria-pressed')).toBe('true');
    expect(enBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeTruthy(); // chrome.locale.label
  });

  it('click en → i18n.language \'en\' + localStorage ghi + aria-pressed flip', async () => {
    const i18n = await resetToVi();
    await renderWithProviders(<LocaleSwitcher />, { lang: 'vi' });
    const viBtn = screen.getByRole('button', { name: 'Tiếng Việt' });
    const enBtn = screen.getByRole('button', { name: 'English' });

    fireEvent.click(enBtn);
    expect(i18n.language).toBe('en'); // useT().setLang đã chạy
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('en'); // persist
    expect(viBtn.getAttribute('aria-pressed')).toBe('false'); // flip
    expect(enBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('click vi sau en → lang về \'vi\' + storage cập nhật (đọc lại qua storedLang)', async () => {
    const i18n = await resetToVi();
    await renderWithProviders(<LocaleSwitcher />, { lang: 'vi' });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(storedLang()).toBe('en'); // reads back từ click trước

    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    expect(i18n.language).toBe('vi');
    expect(storedLang()).toBe('vi');
  });
});

describe('storedLang (đọc an toàn)', () => {
  it('giá trị hợp lệ vi/en → trả nguyên; giá trị lạ → null', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'en');
    expect(storedLang()).toBe('en');
    window.localStorage.setItem(LANG_STORAGE_KEY, 'vi');
    expect(storedLang()).toBe('vi');
    window.localStorage.setItem(LANG_STORAGE_KEY, 'fr');
    expect(storedLang()).toBeNull(); // giá trị lạ → null
  });

  it('thiếu key → null (caller fallback \'vi\')', () => {
    window.localStorage.removeItem(LANG_STORAGE_KEY);
    expect(storedLang()).toBeNull();
  });
});
