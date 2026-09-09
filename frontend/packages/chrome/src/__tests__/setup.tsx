import { render } from '@testing-library/react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import { initI18n } from '@ecommerce/i18n';
import type { Lang } from '@ecommerce/i18n';

/**
 * Shared test setup (FI-398 T13, spec §5 — P1 critic): mọi test render
 * component chrome đi qua `renderWithProviders` — initI18n() + bọc
 * I18nextProvider (instance thật, KHÔNG mock useT) + render RTL.
 *
 * i18n: `initI18n()` idempotent (lần gọi ĐẦU TIÊN thắng — `lang` ở các lần
 * sau bị bỏ qua) → `lang` option được bảo đảm bằng `changeLanguage` sau init
 * (pattern resetToVi locale-switcher T12). SSR tests (renderToStaticMarkup —
 * site-header.ssr / footer.ssr) GIỮ pattern initI18n-global: react-dom/server
 * không cần provider, useT rơi về instance global đã init.
 */
export interface RenderWithProvidersOptions extends RenderOptions {
  lang?: Lang;
}

export async function renderWithProviders(
  ui: ReactElement,
  { lang, ...options }: RenderWithProvidersOptions = {}
): Promise<RenderResult> {
  const i18n: I18nInstance = await initI18n({ lang });
  if (lang) await i18n.changeLanguage(lang);
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>, options);
}
