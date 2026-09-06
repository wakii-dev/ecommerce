import { useTranslation } from 'react-i18next';
import type { Lang } from './init';

export interface UseTResult {
  t: ReturnType<typeof useTranslation>['t'];
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/**
 * Wrapper react-i18next trả `{t, lang, setLang}`.
 *
 * Yêu cầu `initI18n()` đã chạy trong bootstrap app (hook KHÔNG tự init —
 * giữ framework-portable, tránh side-effect khi import).
 */
export function useT(): UseTResult {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language?.split('-')[0] ?? 'vi') as Lang;
  return {
    t,
    lang,
    setLang: (next: Lang) => {
      void i18n.changeLanguage(next);
    }
  };
}
