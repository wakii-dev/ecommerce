'use client';

import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { LANG_STORAGE_KEY } from './lang';
import type { Locale } from './site';

/**
 * LocaleSwitcher (FI-398 T12, spec §3.9) — Shell-model (i18n-lang): useT()
 * → { lang, setLang }; 2 nút vi/en (aria-pressed theo lang hiện tại), click →
 * setLang(next) + persist localStorage['ecommerce.lang'] (try/catch — private
 * mode chỉ đổi lang phiên hiện tại). Labels chrome.locale.* (vi/en + aria
 * label group). KHÔNG register vào shell header (visual GIỮ NGUYÊN — chỉ xuất
 * hiện ở /ui-kit showcase; SF-4 quyết vị trí trên Next).
 */
// Shell-model (i18n-lang). KHÔNG drop-in cho storefront URL-locale ([locale] segment + switchLocalePath) — Next integration là quyết định SF-4 (spec §3.9).

function persist(next: Locale): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // private mode — setLang phiên hiện tại vẫn chạy
  }
}

export function LocaleSwitcher(): ReactElement {
  const { t, lang, setLang } = useT();
  const pick = (next: Locale): void => {
    setLang(next);
    persist(next);
  };
  return (
    <div className="chrome-locale-switcher" role="group" aria-label={t('chrome.locale.label')}>
      <button
        type="button"
        className="chrome-locale-switcher__btn"
        aria-pressed={lang === 'vi'}
        onClick={() => pick('vi')}
      >
        {t('chrome.locale.vi')}
      </button>
      <button
        type="button"
        className="chrome-locale-switcher__btn"
        aria-pressed={lang === 'en'}
        onClick={() => pick('en')}
      >
        {t('chrome.locale.en')}
      </button>
    </div>
  );
}

export default LocaleSwitcher;
