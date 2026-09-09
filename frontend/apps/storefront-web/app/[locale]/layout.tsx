import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { initI18n } from '@ecommerce/i18n';
import { setChromeSite } from '@ecommerce/chrome';

import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/tokens.css';

import ChromeShell from '../../components/ChromeShell';
import LiveChat from '../../components/LiveChat';
import PwaRegister from '../../components/PwaRegister';
import { ToastProvider } from '../../components/ui-kit';
import { resolveLocale } from '../../lib/format';
import { buildAlternates } from '../../lib/seo';
import { siteUrl } from '../../lib/site';

const DESCRIPTION: Record<string, string> = {
  vi: 'Chợ sôi động — hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
  en: 'Shop VN — thousands of official products at great prices, every day.',
};

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = resolveLocale(params.locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: 'Shop VN — Chợ sôi động', template: '%s | Shop VN' },
    description: DESCRIPTION[locale ?? 'vi'],
    // hreflang vi/en trang chủ — per-page (PLP/PDP) qua helper ở Task 12/13.
    alternates: buildAlternates('/'),
  };
}

/**
 * Locale layout — SF-4 (FI-401): Header/Footer render từ @ecommerce/chrome
 * (SiteHeader props-slots + Footer) qua client gate ChromeShell. Server await
 * initI18n + changeLanguage URL locale (P0-2 — instance memoized first-call-
 * wins; request đầu tiên của mỗi locale vẫn dịch đúng) + setChromeSite
 * same-origin trên chrome instance SERVER (client gate tự gọi trên instance
 * browser — singleton per runtime). ChromeShell bọc client tree trong
 * SessionBootProvider; islands local giữ (SearchBar/LocaleSwitcher/
 * PwaRegister/LiveChat/ToastProvider).
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();
  setChromeSite({ sfUrl: '', shellUrl: '' });
  const i18n = await initI18n({ lang: locale });
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
  return (
    <ChromeShell locale={locale}>
      {/* ToastProvider (client boundary qua shim) cho mọi page-level consumer
          useToast (hiện tại: CopyButton coupons — T10). Region toast render
          cuối layout — không chiếm layout flow. */}
      <ToastProvider>
        <main>{children}</main>
      </ToastProvider>
      <PwaRegister />
      <LiveChat />
    </ChromeShell>
  );
}
