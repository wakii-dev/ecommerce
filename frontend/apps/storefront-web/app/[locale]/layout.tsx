import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// SF-4 PT6 (FI-401): KHÔNG import @ecommerce/i18n ở server component — init.ts
// (thiếu 'use client') kéo react-i18next vào bundle RSC, mà react-server runtime
// không export createContext → 500 "(0 , react.createContext) is not a function"
// khi boot /vi. init + changeLanguage locale chạy ở client gate ChromeShell
// ('use client' — bundle SSR/browser đều hợp lệ). setChromeSite giữ ở đây: barrel
// chrome trong RSC an toàn (module thuần + client-reference stub).
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
 * (SiteHeader props-slots + Footer) qua client gate ChromeShell. setChromeSite
 * same-origin gọi ở server trước render; initI18n + changeLanguage URL locale
 * chạy trong ChromeShell (P0-2 note PT6: server-await bị BỎ — react-i18next
 * không vào được bundle RSC, xem comment import phía trên; SSR chrome.* labels
 * nhảy key-thô→dịch sau hydration — trade-off chấp nhận, header labels qua
 * lib/i18n static dict vẫn dịch từ HTML đầu). ChromeShell bọc client tree trong
 * SessionBootProvider; islands local giữ (SearchBar/LocaleSwitcher/
 * PwaRegister/LiveChat/ToastProvider).
 */
export default function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();
  setChromeSite({ sfUrl: '', shellUrl: '' });
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
