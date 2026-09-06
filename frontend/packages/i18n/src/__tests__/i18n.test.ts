import { describe, expect, it } from 'vitest';
import { initI18n } from '../init';
import type { i18n as I18nInstance } from 'i18next';

// Instance là module-singleton nên các test trong file này chạy theo thứ tự
// khai báo (vitest sequential trong 1 file) — test đổi ngôn ngữ tự reset lại.
describe('initI18n', () => {
  it('mặc định vi — dịch đúng key chrome', async () => {
    const i18n: I18nInstance = await initI18n();
    expect(i18n.language).toBe('vi');
    expect(i18n.t('nav.home')).toBe('Trang chủ');
    expect(i18n.t('actions.addToCart')).toBe('Thêm vào giỏ');
    expect(i18n.t('common.loading')).toBe('Đang tải...');
    expect(i18n.t('auth.forgot')).toBe('Quên mật khẩu?');
  });

  it('idempotent — gọi lần 2 trả cùng instance, không re-init', async () => {
    const first = await initI18n();
    const second = await initI18n({ lang: 'en' }); // options lần sau bị bỏ qua
    expect(second).toBe(first);
    expect(first.language).toBe('vi');
  });

  it('switch en — dịch đúng key', async () => {
    const i18n = await initI18n();
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('nav.home')).toBe('Home');
    expect(i18n.t('actions.buyNow')).toBe('Buy now');
    expect(i18n.t('common.error')).toBe('Something went wrong');
    await i18n.changeLanguage('vi');
  });

  it('key thiếu ở en → fallback về vi (D17)', async () => {
    const i18n = await initI18n();
    // key chỉ tồn tại ở vi — mô phỏng catalog lệch key khi dev
    i18n.addResourceBundle('vi', 'translation', {
      testOnly: { onlyVi: 'Chỉ có tiếng Việt' }
    });
    await i18n.changeLanguage('en');
    expect(i18n.t('testOnly.onlyVi')).toBe('Chỉ có tiếng Việt');
    await i18n.changeLanguage('vi');
  });
});
