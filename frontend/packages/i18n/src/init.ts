import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './catalogs/en';
import { vi } from './catalogs/vi';

export type Lang = 'vi' | 'en';

let initPromise: Promise<I18nInstance> | null = null;

/**
 * Init i18next — idempotent: lần gọi ĐẦU TIÊN thắng (kể cả `lang` ở các lần
 * sau bị bỏ qua), mọi lần gọi sau trả cùng instance.
 *
 * KHÔNG gọi ở module top-level (D16 framework-portable) — app gọi trong
 * bootstrap (main.tsx) trước khi render, `await initI18n()` để tránh flash
 * key thô ở frame đầu.
 */
export function initI18n({ lang = 'vi' }: { lang?: Lang } = {}): Promise<I18nInstance> {
  if (!initPromise) {
    // Đăng ký instance với react-i18next: useT() render NGOÀI I18nextProvider
    // (standalone remote — component tự render provider đọc context rỗng) rơi
    // về getI18n() — nếu không register thì đó là instance khác chưa init →
    // t() trả key thô (bug guard /admin standalone :5177).
    initPromise = i18next.use(initReactI18next).init({
      lng: lang,
      fallbackLng: 'vi', // D17 — vi là ngôn ngữ dự phòng toàn story
      resources: {
        vi: { translation: vi },
        en: { translation: en }
      },
      returnNull: false,
      interpolation: { escapeValue: false }, // React tự escape
      react: { useSuspense: false } // không ép Suspense boundary lên consumer
    }).then(() => i18next);
  }
  return initPromise;
}
