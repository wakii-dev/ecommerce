import i18next, { type i18n as I18nInstance } from 'i18next';
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
    // i18next.init() resolve với TFunction — chuẩn hóa trả instance i18next
    initPromise = i18next.init({
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
